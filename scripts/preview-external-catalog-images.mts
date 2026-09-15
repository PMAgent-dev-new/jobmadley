import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { fetchAllExternalMechanicJobs } from './lib/catalog-external-jobs.mts'
import { buildExternalMechanicSourceSvg, externalImageProfile } from './lib/catalog-external-images.mts'
import { renderCatalogCreative, type CatalogImageSpec } from './lib/catalog-images.mts'
import { buildCatalogTitle } from './lib/catalog-copy.mts'

const outputDir = process.env.CATALOG_PREVIEW_DIR || '/tmp/ridejob-catalog-preview'
const sampleCount = Math.max(12, Math.min(Number(process.env.CATALOG_PREVIEW_COUNT) || 100, 300))
const contactCount = 12
const columns = 4
const tileSize = 270

const external = await fetchAllExternalMechanicJobs()
if (!external.jobs.length) throw new Error('プレビュー対象の外部整備士求人がありません')
await mkdir(outputDir, { recursive: true })

const step = Math.max(1, Math.floor(external.jobs.length / sampleCount))
const samples = external.jobs.filter((_, index) => index % step === 0).slice(0, sampleCount)
const outputs: Buffer[] = []
const sizes: number[] = []

const salaryLabel = (kind: string, min?: number, max?: number): string => {
  const format = (value: number) => value >= 100_000
    ? `${Math.round(value / 1_000) / 10}万円`
    : `${value.toLocaleString('ja-JP')}円`
  if (min && max && min !== max) return `${kind}${format(min)}〜${format(max)}`
  if (min || max) return `${kind}${format(min || max || 0)}`
  return '給与は詳細ページへ'
}

for (const job of samples) {
  const spec: CatalogImageSpec = {
    id: job.sourceId,
    sourceUrl: '',
    sourceSvg: buildExternalMechanicSourceSvg(job),
    category: 'mechanic',
    roleLabel: externalImageProfile(job).sceneLabel,
    title: buildCatalogTitle({
      category: 'mechanic',
      sourceTitle: job.title,
      sourceCategory: job.jobCategory,
      region: job.prefecture,
      locality: job.municipality,
    }),
    company: '掲載企業非公開',
    salary: salaryLabel(job.salaryKind, job.salaryMin, job.salaryMax),
    location: `${job.prefecture}${job.municipality || ''}`,
    employmentType: job.employmentType,
  }
  const rendered = await renderCatalogCreative(Buffer.from(spec.sourceSvg), spec)
  outputs.push(rendered)
  sizes.push(rendered.byteLength)
}

const contactInputs = await Promise.all(
  outputs.slice(0, contactCount).map((input) => sharp(input).resize(tileSize, tileSize).toBuffer()),
)
const rows = Math.ceil(contactInputs.length / columns)
const contact = await sharp({
  create: {
    width: columns * tileSize,
    height: rows * tileSize,
    channels: 3,
    background: '#ffffff',
  },
}).composite(contactInputs.map((input, index) => ({
  input,
  left: (index % columns) * tileSize,
  top: Math.floor(index / columns) * tileSize,
}))).jpeg({ quality: 88, mozjpeg: true }).toBuffer()

sizes.sort((a, b) => a - b)
const averageBytes = Math.round(sizes.reduce((sum, value) => sum + value, 0) / sizes.length)
const uniqueRenderedImages = new Set(
  outputs.map((output) => createHash('sha256').update(output).digest('hex')),
).size
if (uniqueRenderedImages !== outputs.length) {
  throw new Error(`描画画像が重複しています: sampled=${outputs.length} unique=${uniqueRenderedImages}`)
}
const stats = {
  sampled: sizes.length,
  uniqueRenderedImages,
  totalEligibleBeforeDedupe: external.jobs.length,
  averageBytes,
  p95Bytes: sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.95))],
  minBytes: sizes[0],
  maxBytes: sizes.at(-1),
  projectedBytesBeforeDedupe: averageBytes * external.jobs.length,
}

await writeFile(`${outputDir}/contact-sheet.jpg`, contact)
await writeFile(`${outputDir}/stats.json`, JSON.stringify(stats, null, 2))
console.log(JSON.stringify({ outputDir, ...stats }, null, 2))
