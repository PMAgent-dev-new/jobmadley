import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { list, put } from '@vercel/blob'

const IMAGE_VERSION = 'v1'
const IMAGE_PREFIX = `catalog/images/${IMAGE_VERSION}/`
const OUTPUT_SIZE = 1080
const MAX_BYTES = 8 * 1024 * 1024

export function canonicalImageSource(url: string): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return ''
  }
}

export function catalogImagePath(sourceUrl: string): string {
  const digest = createHash('sha256')
    .update(`${IMAGE_VERSION}\n${canonicalImageSource(sourceUrl)}`)
    .digest('hex')
    .slice(0, 32)
  return `${IMAGE_PREFIX}${digest}.jpg`
}

/**
 * 横長・縦長の元画像を変形せず、ぼかした同一画像を背景に敷いて正方形へ再レンダリングする。
 * 文字・ロゴ・人物をAIで描き直さないため、求人画像の内容をそのまま保てる。
 */
export async function renderSquareCatalogImage(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input, { failOn: 'error' }).metadata()
  if (!meta.width || !meta.height) throw new Error('画像サイズを取得できません')

  const background = await sharp(input)
    .rotate()
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover' })
    .blur(28)
    .modulate({ brightness: 0.72, saturation: 0.82 })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer()

  const foreground = await sharp(input)
    .rotate()
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const output = await sharp(background)
    .composite([{ input: foreground, gravity: 'centre' }])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer()

  const outMeta = await sharp(output).metadata()
  if (outMeta.width !== OUTPUT_SIZE || outMeta.height !== OUTPUT_SIZE) {
    throw new Error(`生成画像のサイズが不正です: ${outMeta.width}x${outMeta.height}`)
  }
  if (output.byteLength > MAX_BYTES) {
    throw new Error(`生成画像が8MBを超えています: ${output.byteLength} bytes`)
  }
  return output
}

async function fetchSourceImage(url: string): Promise<Buffer> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) throw new Error(`画像ではありません: ${contentType}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
    }
  }
  throw new Error(`元画像の取得に失敗しました: ${url}`, { cause: lastError })
}

async function listExistingImages(token: string): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  let cursor: string | undefined
  do {
    const result = await list({ prefix: IMAGE_PREFIX, limit: 1_000, cursor, token })
    for (const blob of result.blobs) found.set(blob.pathname, blob.url)
    cursor = result.hasMore ? result.cursor : undefined
  } while (cursor)
  return found
}

type PrepareOptions = {
  token: string
  force?: boolean
  concurrency?: number
}

/**
 * 元画像URLごとに一度だけ正方形画像を生成し、永続Blob URLを返す。
 * パスには変換バージョンと元画像URLのハッシュを含むため、元画像変更時だけ再生成される。
 */
export async function prepareCatalogImages(
  sourceUrls: string[],
  options: PrepareOptions,
): Promise<Map<string, string>> {
  const sources = [...new Set(sourceUrls.map(canonicalImageSource).filter(Boolean))]
  const existing = options.force ? new Map<string, string>() : await listExistingImages(options.token)
  const result = new Map<string, string>()
  const pending: string[] = []

  for (const source of sources) {
    const path = catalogImagePath(source)
    const cached = existing.get(path)
    if (cached) result.set(source, cached)
    else pending.push(source)
  }

  let next = 0
  const worker = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= pending.length) return
      const source = pending[index]
      const input = await fetchSourceImage(source)
      const output = await renderSquareCatalogImage(input)
      const path = catalogImagePath(source)
      const blob = await put(path, output, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'image/jpeg',
        token: options.token,
      })
      result.set(source, blob.url)
      console.log(`[catalog-image] generated ${index + 1}/${pending.length}: ${path}`)
    }
  }

  const workerCount = Math.max(1, Math.min(options.concurrency ?? 4, pending.length || 1))
  await Promise.all(Array.from({ length: workerCount }, worker))
  console.log(`[catalog-image] unique=${sources.length} / cached=${sources.length - pending.length} / generated=${pending.length}`)
  return result
}
