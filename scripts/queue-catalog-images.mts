import { readFile } from 'node:fs/promises'

type QueueJob = {
  job_id: string
  title: string
  category?: string
  location?: string
  salary?: string
  appeal?: string
  company?: string
  employment_type?: string
  source_url?: string
  source_image_url?: string
  reason?: string
}

const endpoint = process.env.CATALOG_GENERATE_API_URL || ''
const token = process.env.CATALOG_GENERATE_TOKEN || ''
const quality = process.env.CATALOG_IMAGE_GENERATION_QUALITY || 'medium'
const totalLimit = Math.max(1, Math.min(Number(process.env.CATALOG_IMAGE_GENERATION_LIMIT) || 10, 50))
// The generation API processes jobs sequentially and has a 300-second runtime cap.
// Keep the default request to one image so a slow batch cannot discard later results.
const batchSize = Math.max(1, Math.min(Number(process.env.CATALOG_IMAGE_GENERATION_BATCH_SIZE) || 1, 10))

if (!endpoint) {
  console.log('[catalog-image-queue] CATALOG_GENERATE_API_URL未設定のため生成APIへの投入をスキップ')
  process.exit(0)
}

const payload = JSON.parse(
  await readFile('catalog-image-generation-queue.json', 'utf-8'),
) as { jobs?: QueueJob[] }
const jobs = (payload.jobs || []).slice(0, totalLimit)
if (!jobs.length) {
  console.log('[catalog-image-queue] 生成・承認待ち求人はありません')
  process.exit(0)
}

const batches: QueueJob[][] = []
for (let index = 0; index < jobs.length; index += batchSize) {
  batches.push(jobs.slice(index, index + batchSize))
}

let generated = 0
let skipped = 0
let errored = 0
let totalCost = 0
for (const batch of batches) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jobs: batch,
      quality,
      force: false,
      limit: batch.length,
    }),
    signal: AbortSignal.timeout(300_000),
  })
  if (!response.ok) {
    throw new Error(`画像生成APIが失敗しました: HTTP ${response.status} ${await response.text()}`)
  }
  const result = await response.json() as {
    generated?: number
    skipped?: number
    errored?: number
    total_cost?: number
  }
  generated += result.generated || 0
  skipped += result.skipped || 0
  errored += result.errored || 0
  totalCost += result.total_cost || 0
}

console.log(
  `[catalog-image-queue] processed=${jobs.length} / generated=${generated} / skipped=${skipped} / errored=${errored} / estimated_cost=$${totalCost.toFixed(4)}`,
)
if (errored > 0) process.exitCode = 1
