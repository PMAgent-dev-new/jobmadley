import { createHash } from 'node:crypto'
import { catalogStorageFromEnv } from './lib/catalog-storage.mts'
import { parseCatalogTsv } from './lib/catalog-tsv.mts'

const storage = catalogStorageFromEnv({ required: true })!
const primaryPath = 'catalog/ridejob-feed.tsv'
const statePath = 'catalog/publish-state.json'
const rollbackPaths = [
  primaryPath,
  'catalog/ridejob-feed-review.tsv',
  'catalog/ridejob-feed-quality.json',
  'catalog/ridejob-image-generation-queue.json',
] as const

if (process.env.CATALOG_REBASELINE_CONFIRMED !== 'true') {
  throw new Error('既存フィードを基準化する場合は CATALOG_REBASELINE_CONFIRMED=true を明示してください')
}

const [objects, existingState] = await Promise.all([
  Promise.all(rollbackPaths.map((path) => storage.find(path))),
  storage.find(statePath),
])
const primary = objects[0]
if (!primary) throw new Error('基準化する既存の一次フィードがありません')
const missingRollbackObjects = rollbackPaths.filter((_, index) => !objects[index])
if (missingRollbackObjects.length) {
  throw new Error(`復元に必要な既存ファイルが不足しています: ${missingRollbackObjects.join(', ')}`)
}
if (existingState) {
  throw new Error('公開完了マーカーが既に存在します。破損時は基準化で迂回せず復元手順を使用してください')
}

const primaryBytes = await storage.readPublic(primaryPath)
const primaryText = primaryBytes.toString('utf-8')
const rows = parseCatalogTsv(primaryText)
if (rows.length < 2) throw new Error('既存一次フィードに商品行がありません')
const header = rows[0]
const linkIndex = header.indexOf('link')
if (linkIndex < 0) throw new Error('既存一次フィードにlink列がありません')
const invalidWidth = rows.slice(1).findIndex((row) => row.length !== header.length)
if (invalidWidth >= 0) {
  throw new Error(`既存一次フィードの列数が不正です: product_index=${invalidWidth + 1}`)
}
const externalJobs = rows.slice(1).filter((row) =>
  (row[linkIndex] || '').includes('/external-job/hellowork/'),
).length
const sha256 = createHash('sha256').update(primaryBytes).digest('hex')
const state = JSON.stringify({
  version: 1,
  completed_at: new Date().toISOString(),
  external_jobs: externalJobs,
  products: rows.length - 1,
  primary_sha256: sha256,
  primary_bytes: primaryBytes.byteLength,
  baseline: true,
}, null, 2)
const written = await storage.put(statePath, state, {
  upsert: false,
  contentType: 'application/json; charset=utf-8',
  cacheControl: 0,
})
const stateHash = createHash('sha256').update(state).digest('hex')
let verified = false
for (let attempt = 1; attempt <= 5; attempt += 1) {
  try {
    const actual = await storage.readPublic(statePath)
    if (createHash('sha256').update(actual).digest('hex') === stateHash) {
      verified = true
      break
    }
  } catch {
    // CDN反映待ちとして再試行する。
  }
  if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 15_000))
}
if (!verified) {
  // この実行が新設した未検証マーカーだけを取り除き、再試行可能な状態へ戻す。
  await storage.remove([statePath])
  if (await storage.find(statePath)) {
    throw new Error('基準化マーカーの検証と削除確認に失敗しました')
  }
  throw new Error('公開完了マーカーの読戻しハッシュが一致しません')
}
console.log(`[catalog-rebaseline] url=${written.url} products=${rows.length - 1} external_jobs=${externalJobs} sha256=${sha256}`)
