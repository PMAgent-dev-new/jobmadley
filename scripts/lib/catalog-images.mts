import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { SupabaseCatalogStorage } from './catalog-storage.mts'

// 画像は不変URLで保存する。描画ロジックを変える場合はこの版を上げ、旧フィードが
// 参照する画像を上書きしないこと（この実装からupsert=falseを強制）。
const IMAGE_VERSION = 'v5'
const IMAGE_PREFIX = `catalog/images/${IMAGE_VERSION}/`
const OUTPUT_SIZE = 1080
const PHOTO_HEIGHT = 720
const PANEL_HEIGHT = OUTPUT_SIZE - PHOTO_HEIGHT
const MAX_BYTES = 8 * 1024 * 1024

export type CatalogImageSpec = {
  id: string
  sourceUrl: string
  /** 求人データから組み立てたSVG。外部画像を使わず求人ごとに固有化する場合に使用する。 */
  sourceSvg?: string
  fallbackSourceUrl?: string
  category: string
  roleLabel?: string
  title: string
  company?: string
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
    sourceSvg: String(spec.sourceSvg || '').trim() || undefined,
    fallbackSourceUrl: canonicalImageSource(spec.fallbackSourceUrl || '') || undefined,
    category: String(spec.category || '').trim(),
    roleLabel: String(spec.roleLabel || '').trim(),
    title: String(spec.title || '').trim(),
    company: String(spec.company || '').trim(),
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
  const salary = truncateVisual(spec.salary || spec.employmentType || '条件は詳細ページへ', 11)
  // 黄色枠の実効幅350pxへ収まるよう、文字種を考慮した幅からフォントサイズを決める。
  const salaryFontSize = Math.max(28, Math.min(42, Math.floor(350 / Math.max(1, visualWidth(salary)))))
  const company = truncateVisual(spec.company || '勤務先は求人詳細へ', 31)
  const location = truncateVisual(
    [spec.location, spec.employmentType].filter(Boolean).join('　') || '勤務地は詳細ページへ',
    16,
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
      <text x="48" y="45" font-size="29" font-weight="800" fill="#ffffff">${escapeXml(spec.roleLabel || categoryLabel(spec.category))}</text>
      <text x="1032" y="45" text-anchor="end" font-size="28" font-weight="900" font-style="italic" fill="#ffffff">RIDE JOB</text>
      ${titleSvg}
      <text x="48" y="232" font-size="27" font-weight="700" fill="#64748b">${escapeXml(company)}</text>
      <text x="48" y="322" font-size="29" font-weight="700" fill="#334155">${escapeXml(location)}</text>
      <rect x="638" y="255" width="394" height="78" rx="6" fill="#ffdd2d"/>
      <text x="1010" y="310" text-anchor="end" font-size="${salaryFontSize}" font-weight="900" fill="#0b2c69">${escapeXml(salary)}</text>
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
  const generatedVector = Boolean(spec.sourceSvg)
  const quality = generatedVector ? 82 : 90
  const chromaSubsampling = generatedVector ? '4:2:0' : '4:4:4'

  const photo = await sharp(input)
    .rotate()
    .resize(OUTPUT_SIZE, PHOTO_HEIGHT, {
      fit: 'cover',
      position: 'north',
    })
    .jpeg({ quality, chromaSubsampling })
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
    .jpeg({ quality, chromaSubsampling, mozjpeg: true })
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

async function listExistingImages(storage: SupabaseCatalogStorage): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const images = await storage.listDirectory(IMAGE_PREFIX)
  for (const image of images) {
    if (image.isDirectory || !image.pathname.endsWith('.jpg')) continue
    if (!Number.isSafeInteger(image.size) || Number(image.size) < 1_024) {
      throw new Error(`既存カタログ画像のサイズを検証できません: ${image.pathname}`)
    }
    if (image.contentType && image.contentType !== 'image/jpeg') {
      throw new Error(`既存カタログ画像の形式がJPEGではありません: ${image.pathname}`)
    }
    found.set(image.pathname, image.url)
  }
  return found
}

async function assertPublicCatalogImage(
  pathname: string,
  storage: SupabaseCatalogStorage,
  expected?: Buffer,
): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const bytes = await storage.readPublic(pathname)
      if (bytes.byteLength < 1_024 || bytes.byteLength > MAX_BYTES) {
        throw new Error(`公開画像のサイズが不正です: ${bytes.byteLength} bytes`)
      }
      if (expected && !bytes.equals(expected)) {
        throw new Error('アップロード前後の画像ハッシュが一致しません')
      }
      const metadata = await sharp(bytes).metadata()
      if (metadata.format !== 'jpeg' || metadata.width !== OUTPUT_SIZE || metadata.height !== OUTPUT_SIZE) {
        throw new Error(`公開画像の形式または寸法が不正です: ${metadata.format} ${metadata.width}x${metadata.height}`)
      }
      // キャッシュ済み画像はローカルの期待バイト列が無いため、全画素をデコードして破損も検出する。
      if (!expected) await sharp(bytes).stats()
      return
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750))
    }
  }
  throw new Error(
    `公開カタログ画像を検証できません: ${pathname}`,
    { cause: lastError },
  )
}

async function putImageWithRetry(path: string, output: Buffer, storage: SupabaseCatalogStorage) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await storage.put(path, output, {
        upsert: false,
        contentType: 'image/jpeg',
        // 求人データと描画版を含む不変パス。長期キャッシュしても内容は変わらない。
        cacheControl: 31_536_000,
      })
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
    }
  }
  throw lastError
}

type PrepareOptions = {
  storage: SupabaseCatalogStorage
  force?: boolean
  concurrency?: number
  failOnError?: boolean
}

/** 求人IDと表示条件ごとに広告画像を一度だけ生成し、Supabase Storageの不変URLを返す。 */
export async function prepareCatalogImages(
  imageSpecs: CatalogImageSpec[],
  options: PrepareOptions,
): Promise<Map<string, string>> {
  const specs = [...new Map(
    imageSpecs
      .map(normalizedSpec)
      .filter((spec) => spec.id && (spec.sourceUrl || spec.sourceSvg))
      .map((spec) => [spec.id, spec]),
  ).values()]
  if (options.force) {
    throw new Error('カタログ画像は不変URLです。再生成にはIMAGE_VERSIONの更新が必要です')
  }
  const existing = await listExistingImages(options.storage)
  const result = new Map<string, string>()
  const pending: CatalogImageSpec[] = []
  const cachedSpecs: Array<{ spec: CatalogImageSpec; path: string; url: string }> = []

  for (const spec of specs) {
    const path = catalogImagePath(spec)
    const cached = existing.get(path)
    if (cached) {
      cachedSpecs.push({ spec, path, url: cached })
    } else pending.push(spec)
  }

  let cachedNext = 0
  const cachedWorker = async () => {
    for (;;) {
      const index = cachedNext
      cachedNext += 1
      if (index >= cachedSpecs.length) return
      const cached = cachedSpecs[index]
      await assertPublicCatalogImage(cached.path, options.storage)
      result.set(cached.spec.id, cached.url)
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(12, cachedSpecs.length || 1) },
    () => cachedWorker(),
  ))

  let next = 0
  let completed = 0
  const failures: Array<{ id: string; reason: string }> = []
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
      try {
        let input: Buffer
        if (spec.sourceSvg) {
          input = Buffer.from(spec.sourceSvg)
        } else {
          try {
            input = await fetchCachedSource(spec.sourceUrl)
          } catch (error) {
            if (!spec.fallbackSourceUrl || spec.fallbackSourceUrl === spec.sourceUrl) throw error
            console.warn(`[catalog-image] 承認画像を取得できないため求人詳細画像を使用: ${spec.id}`)
            input = await fetchCachedSource(spec.fallbackSourceUrl)
          }
        }
        const output = await renderCatalogCreative(input, spec)
        const path = catalogImagePath(spec)
        const blob = await putImageWithRetry(path, output, options.storage)
        // Metaへ渡す前に公開URLから実体を読み戻し、生成バイト列との完全一致を確認する。
        await assertPublicCatalogImage(path, options.storage, output)
        result.set(spec.id, blob.url)
        completed += 1
        if (completed <= 10 || completed % 100 === 0 || completed === pending.length) {
          console.log(`[catalog-image] generated ${completed}/${pending.length}: ${spec.id}`)
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error'
        failures.push({ id: spec.id, reason })
        console.warn(`[catalog-image] 求人別画像を生成できないため配信保留: ${spec.id} (${reason})`)
      }
    }
  }

  const workerCount = Math.max(1, Math.min(options.concurrency ?? 4, pending.length || 1))
  await Promise.all(Array.from({ length: workerCount }, worker))
  console.log(`[catalog-image] jobs=${specs.length} / cached=${specs.length - pending.length} / generated=${completed}`)
  if (failures.length) {
    console.warn(`[catalog-image] held=${failures.length}`)
    if (options.failOnError) {
      throw new Error(`求人別画像の生成失敗: ${failures.slice(0, 5).map((failure) => `${failure.id}: ${failure.reason}`).join(' / ')}`)
    }
  }
  return result
}
