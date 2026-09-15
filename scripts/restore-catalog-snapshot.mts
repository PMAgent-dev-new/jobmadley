import { createHash } from 'node:crypto'
import { catalogStorageFromEnv } from './lib/catalog-storage.mts'

const storage = catalogStorageFromEnv({ required: true })!
if (process.env.CATALOG_RESTORE_CONFIRMED !== 'true') {
  throw new Error('復元する場合は CATALOG_RESTORE_CONFIRMED=true を明示してください')
}
const filenames = [
  'ridejob-feed-review.tsv',
  'ridejob-feed-quality.json',
  'ridejob-image-generation-queue.json',
  'publish-state.json',
  // Metaが読む一次フィードは最後に戻す。
  'ridejob-feed.tsv',
]

type ManifestFile = {
  filename?: string
  pathname?: string
  url?: string
  sha256?: string
  bytes?: number
}

const pointer = await storage.find('catalog/snapshots/latest.json')
if (!pointer) throw new Error('スナップショット世代マニフェストがありません')
const manifestBytes = await storage.read('catalog/snapshots/latest.json')
const manifest = JSON.parse(manifestBytes.toString('utf-8')) as {
  version?: number
  generation?: string
  files?: ManifestFile[]
  absent_files?: string[]
}
if (manifest.version !== 1 || !manifest.generation || !manifest.files || !manifest.absent_files) {
  throw new Error('スナップショット世代マニフェストが不正です')
}
const byFilename = new Map(manifest.files.map((file) => [file.filename, file]))
for (const filename of filenames) {
  const hasFile = byFilename.has(filename)
  const isAbsent = manifest.absent_files.includes(filename)
  if (hasFile === isAbsent) {
    throw new Error(`スナップショットの存在情報が不正です: ${filename}`)
  }
}
console.log(`[catalog-restore] generation=${manifest.generation}`)

const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const contentType = (filename: string) => filename.endsWith('.tsv')
  ? 'text/tab-separated-values; charset=utf-8'
  : 'application/json; charset=utf-8'

const verified = new Map<string, Buffer>()

// 復元元を全件検証し終えるまでライブ側を1件も変更しない。
for (const filename of filenames) {
  const source = byFilename.get(filename)
  if (!source) continue
  const expectedPath = `catalog/snapshots/generations/${manifest.generation}/${filename}`
  if (
    source.pathname !== expectedPath
    || source.url !== storage.publicUrl(expectedPath)
    || !source.sha256
    || !Number.isFinite(source.bytes)
  ) {
    throw new Error(`スナップショット情報が不正です: ${filename}`)
  }
  const expected = await storage.read(expectedPath)
  if (hash(expected) !== source.sha256 || expected.byteLength !== source.bytes) {
    throw new Error(`復元元スナップショットのハッシュが一致しません: ${filename}`)
  }
  verified.set(filename, expected)
}

async function assertAbsent(pathname: string): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (!await storage.find(pathname)) return
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
  throw new Error(`削除したStorageオブジェクトが残っています: ${pathname}`)
}

async function waitForRestoredObject(
  pathname: string,
  expectedHash: string,
  expectedBytes: number,
  filename: string,
): Promise<Buffer> {
  let actualHash = ''
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const actual = await storage.readPublic(pathname)
      actualHash = hash(actual)
      if (actualHash === expectedHash && actual.byteLength === expectedBytes) return actual
    } catch {
      // CDN反映待ちとして再試行する。
    }
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 15_000))
  }
  throw new Error(`復元後のハッシュが一致しません: ${filename} expected=${expectedHash} actual=${actualHash}`)
}

for (const filename of filenames) {
  const pathname = `catalog/${filename}`
  const source = byFilename.get(filename)
  if (!source) {
    if (await storage.find(pathname)) await storage.remove([pathname])
    await assertAbsent(pathname)
    console.log(`[catalog-restore] verified absent: ${filename}`)
    continue
  }
  const expected = verified.get(filename)
  if (!expected || !source.sha256 || !Number.isFinite(source.bytes)) {
    throw new Error(`検証済み復元元がありません: ${filename}`)
  }
  await storage.put(pathname, expected, {
    upsert: true,
    contentType: contentType(filename),
    cacheControl: 0,
  })
  const actual = await waitForRestoredObject(pathname, source.sha256, source.bytes!, filename)
  console.log(`[catalog-restore] verified: ${filename} bytes=${actual.byteLength}`)
}
