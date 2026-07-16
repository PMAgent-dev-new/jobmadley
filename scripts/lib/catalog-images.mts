import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { list, put } from '@vercel/blob'

const IMAGE_VERSION = 'v4'
const IMAGE_PREFIX = `catalog/images/${IMAGE_VERSION}/`
const OUTPUT_SIZE = 1080
const PHOTO_HEIGHT = 720
const PANEL_HEIGHT = OUTPUT_SIZE - PHOTO_HEIGHT
const MAX_BYTES = 8 * 1024 * 1024

export type CatalogImageSpec = {
  id: string
  sourceUrl: string
  fallbackSourceUrl?: string
  category: string
  title: string
  salary?: string
  location?: string
  employmentType?: string
}

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

function normalizedSpec(spec: CatalogImageSpec): CatalogImageSpec {
  return {
    id: String(spec.id || '').trim(),
    sourceUrl: canonicalImageSource(spec.sourceUrl),
    fallbackSourceUrl: canonicalImageSource(spec.fallbackSourceUrl || '') || undefined,
    category: String(spec.category || '').trim(),
    title: String(spec.title || '').trim(),
    salary: String(spec.salary || '').trim(),
    location: String(spec.location || '').trim(),
    employmentType: String(spec.employmentType || '').trim(),
  }
}

export function catalogImagePath(spec: CatalogImageSpec): string {
  const normalized = normalizedSpec(spec)
  const digest = createHash('sha256')
    .update(`${IMAGE_VERSION}\n${JSON.stringify(normalized)}`)
    .digest('hex')
    .slice(0, 32)
  return `${IMAGE_PREFIX}${digest}.jpg`
}

function visualWidth(value: string): number {
  return [...value].reduce((total, char) => total + (/^[\x00-\x7F]$/.test(char) ? 0.55 : 1), 0)
}

function truncateVisual(value: string, maxWidth: number): string {
  const chars = [...String(value || '').replace(/\s+/g, ' ').trim()]
  let out = ''
  for (const char of chars) {
    if (visualWidth(`${out}${char}…`) > maxWidth) return `${out}…`
    out += char
  }
  return out
}

function wrapVisual(value: string, maxWidth: number, maxLines: number): string[] {
  const chars = [...String(value || '').replace(/\s+/g, ' ').trim()]
  const lines: string[] = []
  let line = ''
  while (chars.length && lines.length < maxLines) {
    const char = chars.shift() as string
    if (line && visualWidth(`${line}${char}`) > maxWidth) {
      lines.push(line)
      line = char
    } else {
      line += char
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (chars.length && lines.length) lines[lines.length - 1] = truncateVisual(`${lines.at(-1)}${chars.join('')}`, maxWidth)
  return lines.length ? lines : ['求人情報']
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    taxi: 'タクシードライバー',
    hire: 'ハイヤードライバー',
    dispatch: '運行管理・配車',
    mechanic: '自動車整備・メカニック',
  }
  return labels[category] || '求人情報'
}

function renderInfoPanel(spec: CatalogImageSpec): Buffer {
  const titleLines = wrapVisual(spec.title, 22, 2)
  const titleY = titleLines.length === 1 ? [164] : [127, 185]
  const salary = truncateVisual(spec.salary || spec.employmentType || '条件は詳細ページへ', 17)
  const location = truncateVisual(
    [spec.location, spec.employmentType].filter(Boolean).join('　') || '勤務地は詳細ページへ',
    22,
  )
  const titleSvg = titleLines
    .map((line, index) => `<text x="48" y="${titleY[index]}" class="title">${escapeXml(line)}</text>`)
    .join('')

  return Buffer.from(`
    <svg width="${OUTPUT_SIZE}" height="${PANEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text { font-family: "Noto Sans CJK JP", "Noto Sans JP", sans-serif; }
        .title { font-size: 46px; font-weight: 800; fill: #111827; }
        .meta { font-size: 31px; font-weight: 700; fill: #334155; }
      </style>
      <rect width="1080" height="360" fill="#ffffff"/>
      <rect width="1080" height="66" fill="#1f1fff"/>
      <text x="48" y="45" font-size="29" font-weight="800" fill="#ffffff">${escapeXml(categoryLabel(spec.category))}</text>
      <text x="1032" y="45" text-anchor="end" font-size="28" font-weight="900" font-style="italic" fill="#ffffff">RIDE JOB</text>
      ${titleSvg}
      <text x="48" y="322" class="meta">${escapeXml(location)}</text>
      <rect x="668" y="255" width="364" height="78" rx="6" fill="#ffdd2d"/>
      <text x="1010" y="310" text-anchor="end" font-size="42" font-weight="900" fill="#0b2c69">${escapeXml(salary)}</text>
    </svg>
  `)
}

/**
 * 承認済みの求人別写真または安全な縮退写真を主素材にし、正確な求人名・勤務地・給与を下部に表示する。
 * AIに条件テキストを描かせないことで、広告と求人データの一貫性を保つ。
 */
export async function renderCatalogCreative(input: Buffer, spec: CatalogImageSpec): Promise<Buffer> {
  const meta = await sharp(input, { failOn: 'error' }).metadata()
  if (!meta.width || !meta.height) throw new Error('画像サイズを取得できません')

  const photo = await sharp(input)
    .rotate()
    .resize(OUTPUT_SIZE, PHOTO_HEIGHT, {
      fit: 'cover',
      position: 'north',
    })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer()

  const output = await sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([
      { input: photo, left: 0, top: 0 },
      { input: renderInfoPanel(spec), left: 0, top: PHOTO_HEIGHT },
    ])
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
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 RIDEJOB-Catalog-Image/3.0' },
        signal: AbortSignal.timeout(30_000),
      })
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

/** 求人IDと表示条件ごとに広告画像を一度だけ生成し、永続Blob URLを返す。 */
export async function prepareCatalogImages(
  imageSpecs: CatalogImageSpec[],
  options: PrepareOptions,
): Promise<Map<string, string>> {
  const specs = [...new Map(
    imageSpecs
      .map(normalizedSpec)
      .filter((spec) => spec.id && spec.sourceUrl)
      .map((spec) => [spec.id, spec]),
  ).values()]
  const existing = options.force ? new Map<string, string>() : await listExistingImages(options.token)
  const result = new Map<string, string>()
  const pending: CatalogImageSpec[] = []

  for (const spec of specs) {
    const path = catalogImagePath(spec)
    const cached = existing.get(path)
    if (cached) result.set(spec.id, cached)
    else pending.push(spec)
  }

  let next = 0
  const sourceCache = new Map<string, Promise<Buffer>>()
  const fetchCachedSource = (url: string): Promise<Buffer> => {
    const cached = sourceCache.get(url)
    if (cached) return cached
    const pendingFetch = fetchSourceImage(url)
    sourceCache.set(url, pendingFetch)
    return pendingFetch
  }
  const worker = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= pending.length) return
      const spec = pending[index]
      let input: Buffer
      try {
        input = await fetchCachedSource(spec.sourceUrl)
      } catch (error) {
        if (!spec.fallbackSourceUrl || spec.fallbackSourceUrl === spec.sourceUrl) throw error
        console.warn(`[catalog-image] 求人画像を取得できないため職種画像を使用: ${spec.id}`)
        input = await fetchCachedSource(spec.fallbackSourceUrl)
      }
      const output = await renderCatalogCreative(input, spec)
      const path = catalogImagePath(spec)
      const blob = await put(path, output, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'image/jpeg',
        token: options.token,
      })
      result.set(spec.id, blob.url)
      console.log(`[catalog-image] generated ${index + 1}/${pending.length}: ${spec.id}`)
    }
  }

  const workerCount = Math.max(1, Math.min(options.concurrency ?? 4, pending.length || 1))
  await Promise.all(Array.from({ length: workerCount }, worker))
  console.log(`[catalog-image] jobs=${specs.length} / cached=${specs.length - pending.length} / generated=${pending.length}`)
  return result
}
