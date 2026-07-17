/**
 * RIDEJOB Meta カタログフィード 生成スクリプト
 *
 * microCMS(jobs) から全件取得 → Meta 商品フィード(TSV) を生成 → Vercel Blob へ publish。
 * GitHub Actions で定期実行する想定（`.github/workflows/catalog-feed.yml`）。
 *
 * 必要 env:
 *   - NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN, MICROCMS_API_KEY  (求人データ)
 *   - BLOB_READ_WRITE_TOKEN  (Vercel Blob。未設定ならローカルにファイル出力)
 *
 * 実行: `npx tsx scripts/generate-catalog-feed.mts`
 *
 * 備考:
 *   - サニタイズ / 職種分類 / HTML→text は旧 GAS/node 版と同一ルール（Meta規約対応）。
 *   - content_ids と一致させるため id = microCMS の求人id（= ridejob.jp/job/[id] のルート）。
 *   - price は名目 1 JPY（価格オーバーレイOFF前提。給与は description と custom_label_3 に格納）。
 *   - 緯度経度(availability_circle) / neighborhoods は Meta 標準カタログで不要のため出力しない。
 */
import { createClient } from 'microcms-js-sdk'
import { put } from '@vercel/blob'
import { readFileSync } from 'node:fs'
import {
  canonicalImageSource,
  type CatalogImageSpec,
  prepareCatalogImages,
} from './lib/catalog-images.mts'
import {
  classifyCatalogJob,
  type CatalogCategory,
} from './lib/catalog-classification.mts'
import {
  catalogHtmlToText,
  sanitizeCatalogText,
} from './lib/catalog-text.mts'
import {
  buildCatalogDescription,
  buildCatalogTitle,
  catalogRoleKey,
  catalogRoleLabel,
  validateCatalogCopy,
  type CatalogCopyInput,
} from './lib/catalog-copy.mts'

// 市区町村→[緯度, 経度]（国土地理院ジオコーディングで事前生成した静的データ）。
// Meta の住所検証は「有効な緯度経度 または 国+市町村」を要求するため、
// 市町村名の解決に依存せず座標で常に有効化する。新しい市区町村が増えたら
// 生成時に警告を出す（データ再生成は scripts/data/catalog-city-geo.json を更新）。
const CITY_GEO: Record<string, [number, number]> = JSON.parse(
  readFileSync(new URL('./data/catalog-city-geo.json', import.meta.url), 'utf-8'),
)

const SERVICE_DOMAIN = process.env.NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN || process.env.MICROCMS_SERVICE_DOMAIN
const API_KEY = process.env.MICROCMS_API_KEY
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN
const FORCE_REGENERATE_IMAGES = process.env.CATALOG_IMAGE_FORCE_REGENERATE === 'true'
const APPROVED_IMAGES_URL = process.env.CATALOG_APPROVED_IMAGES_URL || ''
const APPROVED_IMAGES_TOKEN = process.env.CATALOG_FEED_TOKEN || ''
const ALLOW_GENERIC_IMAGE_FALLBACK = process.env.CATALOG_ALLOW_GENERIC_IMAGE_FALLBACK === 'true'

if (!SERVICE_DOMAIN || !API_KEY) {
  throw new Error('NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN（またはMICROCMS_SERVICE_DOMAIN）とMICROCMS_API_KEYが必要です')
}

const client = createClient({ serviceDomain: SERVICE_DOMAIN, apiKey: API_KEY })

// ===== 型（features/jobs/types.ts と整合。スクリプト自己完結のため最小定義） =====
type Ref = { id?: string; name?: string; region?: string }
type Job = {
  id: string
  title?: string
  jobName?: string
  companyName?: string
  prefecture?: Ref
  municipality?: Ref
  imageUrl?: string
  images?: { url: string }[]
  jobCategory?: Ref
  salaryMin?: number
  salaryMax?: number
  wageType?: string[]
  employmentType?: string[]
  publishedAt?: string
  createdAt?: string
  addressZip?: string
  addressPrefMuni?: string
  addressLine?: string
  descriptionWork?: string
  descriptionAppeal?: string
  descriptionPerson?: string
  salaryNote?: string
  descriptionBenefits?: string
  workHours?: string
  holidays?: string
  access?: string
  descriptionOther?: string
}

const hasResidualPictograph = (s: string): boolean => /\p{Extended_Pictographic}/u.test(s || '')

// ===== 給与 =====
const WAGE_UNIT_MAP: Record<string, 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'> = {
  '時給': 'HOUR', '日給': 'DAY', '週給': 'WEEK', '月給': 'MONTH', '年収': 'YEAR', '年俸': 'YEAR',
}
const wageUnit = (values?: string[]): 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' =>
  (values?.[0] && WAGE_UNIT_MAP[values[0].trim()]) || 'MONTH'

function toMonthlyJPY(min?: number, max?: number, unit?: string): number {
  const v = Number(min) || Number(max) || 0
  if (!v) return 0
  if (unit === 'HOUR') return Math.round(v * 160)
  if (unit === 'DAY') return Math.round(v * 20)
  if (unit === 'WEEK') return Math.round(v * 4)
  if (unit === 'YEAR') return Math.round(v / 12)
  return v
}

/** 月給換算から給与帯（custom_label_3）。絞り込み/予算配分用 */
function salaryBand(job: Job): string {
  const monthly = toMonthlyJPY(job.salaryMin, job.salaryMax, wageUnit(job.wageType))
  if (!monthly) return ''
  const man = monthly / 10000
  if (man < 25) return '〜25万'
  if (man < 30) return '25〜30万'
  if (man < 35) return '30〜35万'
  if (man < 40) return '35〜40万'
  if (man < 50) return '40〜50万'
  return '50万〜'
}

const clip = (s: string, n: number): string => { const v = String(s || ''); return v.length > n ? v.slice(0, n) : v }

// ===== 住所 =====
// addressPrefMuni は「秋田県 秋田市 御所野下堤」のように空白区切りで町名まで含む。
// 都道府県は2〜3文字+接尾辞に固定（非貪欲だと「京都府」が「京都」で切れるため）。
function parseAddressPrefMuni(s?: string): { region?: string; locality?: string } {
  if (!s) return {}
  const m = s.replace(/\s+/g, '').match(/^(.{2,3}[都道府県])((?:.+?郡)?.+?[市区町村])?/)
  if (!m) return {}
  return { region: m[1], locality: m[2] }
}

/** addressPrefMuni から都道府県・市区町村を除いた残り（町名） */
function extractTown(prefMuni: string | undefined, region: string, locality: string): string {
  let s = String(prefMuni || '').replace(/\s+/g, '')
  if (!s) return ''
  const orig = s
  const reg = region.replace(/\s+/g, '')
  const loc = locality.replace(/\s+/g, '')
  if (reg && s.startsWith(reg)) s = s.slice(reg.length)
  if (loc && s.startsWith(loc)) s = s.slice(loc.length)
  return s === orig ? '' : s // 何も削れない=表記が想定外→不明として空
}

// Meta は日付として解釈できる street_address（例: 2001-1-15）を住所不備として弾く
const DATE_LIKE_STREET = /^(19|20)\d{2}([-/]\d{1,2}){1,2}$/

// microCMS 側の汚染: 番地が JS の Date 文字列に化けた行が多数ある
// （例: "Tue Jun 01 1030 17:11:57 GMT+0918 (日本標準時)"。インポート時に番地が日付へ誤変換されたもの）。
// 番地は復元不能なため捨て、町名のみを street とする。
const JS_DATE_JUNK = /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{3,4}|GMT[+-]\d{4}/

// 日付として解釈されうる番地（先頭4桁が年に見える 1030-6-1 / 2001-1-15 / 2007-20 等）と極端に短い番地。
// これらは単体だと Meta の住所検証に落ちるため町名を前置する。3桁以下始まりの通常番地は従来どおり触らない。
const NEEDS_TOWN = /^\d{4}([-/]\d{1,2}){1,2}$|^\d{1,2}$/

/** street は原則 addressLine のみ（既存商品の再検証を発生させない）。
 * 問題を起こす番地（日付様・極短）に限り町名を前置し、それでも日付様なら空にする。 */
function buildStreetAddress(job: Job, region: string, locality: string): string {
  let line = (job.addressLine || '').trim()
  if (JS_DATE_JUNK.test(line)) line = ''
  if (!NEEDS_TOWN.test(line)) return line // 従来どおり＝変更なし
  const town = extractTown(job.addressPrefMuni, region, locality)
  if (!town) return '' // 町名が無く保護できない番地は出さない（空streetは許容される）
  const street = `${town}${line}`.trim()
  return DATE_LIKE_STREET.test(street) ? '' : street
}

/** 郵便番号: 数字以外を除去し、先頭ゼロ欠落（microCMSが数値扱いで5-6桁化）を7桁に復元 */
function formatPostal(zip?: string): string {
  const digits = String(zip || '').replace(/\D/g, '')
  if (!digits) return ''
  const padded = digits.length >= 5 && digits.length < 7 ? digits.padStart(7, '0') : digits
  return padded.length === 7 ? `${padded.slice(0, 3)}-${padded.slice(3)}` : ''
}

// ===== 説明テキスト（読みやすさ整形） =====
// 1行目=要点サマリー（給与｜雇用形態｜勤務地）→ 空行 → 仕事内容本文（見出しラベル無し）
// → 以降のセクションは【見出し】+改行。記号はMeta規定に沿い【】・｜のみ（装飾記号はhtmlToTextで除去済）。
function salaryLabel(job: Job): string {
  const unitRaw = job.wageType?.[0]?.trim() || ''
  const unit = WAGE_UNIT_MAP[unitRaw] ? unitRaw : '月給'
  const fmt = (v: number) =>
    v >= 100000 ? `${Math.round(v / 1000) / 10}万円` : `${v.toLocaleString('ja-JP')}円`
  const min = Number(job.salaryMin) || 0
  const max = Number(job.salaryMax) || 0
  if (!min && !max) return ''
  if (min && max && min !== max) return `${unit}${fmt(min)}〜${fmt(max)}`
  return `${unit}${fmt(min || max)}`
}

function buildDescriptionText(job: Job, region: string, locality: string): string {
  const category = classifyCatalogJob(job)
  return buildCatalogDescription(toCatalogCopyInput(job, category, region, locality))
}

function toCatalogCopyInput(
  job: Job,
  category: CatalogCategory,
  region: string,
  locality: string,
): CatalogCopyInput {
  return {
    category,
    sourceTitle: job.jobName ?? job.title ?? '',
    sourceCategory: job.jobCategory?.name ?? '',
    companyName: job.companyName,
    salary: salaryLabel(job),
    employmentType: job.employmentType?.[0] ?? '',
    region,
    locality,
    descriptionWork: job.descriptionWork,
    descriptionAppeal: job.descriptionAppeal,
    descriptionPerson: job.descriptionPerson,
    descriptionBenefits: job.descriptionBenefits,
    workHours: job.workHours,
    holidays: job.holidays,
  }
}

// ===== 画像 =====
// 遷移先画像を参照して生成・承認された求人別写真を使い、正確な条件を下部パネルに表示する。
// 承認画像がない場合は安全な職種写真へ縮退するが、最終画像は求人条件ごとに生成する。
const SAFE_DRIVER_IMAGE_SOURCE = 'https://ridejob.jp/images/taxi.png'
const SAFE_MECHANIC_IMAGE_SOURCE =
  'https://images.microcms-assets.io/assets/d8be402905d044ddbce7c2cde4918238/767a5eca263545c29beda317671745f0/1756890266438.jpg'

function fallbackImageSource(category: CatalogCategory): string {
  if (category === 'mechanic') return canonicalImageSource(SAFE_MECHANIC_IMAGE_SOURCE)
  if (category === 'taxi' || category === 'hire' || category === 'dispatch') {
    return canonicalImageSource(SAFE_DRIVER_IMAGE_SOURCE)
  }
  return ''
}

function jobImageSource(job: Job): string {
  const source = canonicalImageSource(job.images?.[0]?.url || job.imageUrl || '')
  if (!source || /\/OGP\.png|default|placeholder/i.test(source)) return ''
  return source
}

type CatalogImagePlan = {
  spec: CatalogImageSpec
  sourceKind: string
  referenceSourceUrl: string
}

function buildCatalogImagePlan(job: Job, approvedImages: Map<string, string>): CatalogImagePlan | null {
  const category = classifyCatalogJob(job)
  if (category === 'other') return null
  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const region = job.prefecture?.region ?? parsed.region ?? ''
  const locality = job.municipality?.name ?? parsed.locality ?? ''
  const copyInput = toCatalogCopyInput(job, category, region, locality)
  const fallbackSourceUrl = fallbackImageSource(category)
  const approvedSourceUrl = approvedImages.get(job.id) || ''
  const referenceSourceUrl = jobImageSource(job)
  const sourceUrl = approvedSourceUrl || referenceSourceUrl || (ALLOW_GENERIC_IMAGE_FALLBACK ? fallbackSourceUrl : '')
  if (!sourceUrl) return null

  return {
    spec: {
      id: job.id,
      sourceUrl,
      fallbackSourceUrl: approvedSourceUrl && referenceSourceUrl
        ? referenceSourceUrl
        : (ALLOW_GENERIC_IMAGE_FALLBACK ? fallbackSourceUrl : undefined),
      category,
      roleLabel: catalogRoleLabel(copyInput),
      title: buildCatalogTitle(copyInput),
      company: job.companyName || '勤務先企業',
      salary: salaryLabel(job),
      location: `${region}${locality}`.trim(),
      employmentType: job.employmentType?.[0] ?? '',
    },
    sourceKind: approvedSourceUrl
      ? '承認済み求人別生成画像'
      : referenceSourceUrl
        ? '求人詳細ページ画像'
        : '汎用職種画像（緊急縮退）',
    referenceSourceUrl,
  }
}

async function fetchApprovedImages(): Promise<Map<string, string>> {
  if (!APPROVED_IMAGES_URL) return new Map()
  try {
    const url = new URL(APPROVED_IMAGES_URL)
    url.searchParams.set('format', 'json')
    if (APPROVED_IMAGES_TOKEN) url.searchParams.set('token', APPROVED_IMAGES_TOKEN)
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json() as { items?: Array<{ job_id?: string; image_url?: string }> }
    const images = new Map<string, string>()
    for (const item of payload.items || []) {
      const id = String(item.job_id || '').trim()
      const imageUrl = canonicalImageSource(item.image_url || '')
      if (id && imageUrl) images.set(id, imageUrl)
    }
    console.log(`[catalog-image] approved=${images.size}`)
    return images
  } catch (error) {
    console.warn(`[catalog-image] 承認済み画像APIを取得できないため求人詳細ページ画像を使用: ${error instanceof Error ? error.message : 'unknown error'}`)
    return new Map()
  }
}

// ===== フィード列 =====
const HEADERS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand',
  'address.city', 'address.country', 'address.postal_code', 'address.region', 'address.street_address',
  'address.latitude', 'address.longitude',
  'product_tags[0]', 'product_tags[1]',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
] as const

// ===== 全件取得 =====
async function fetchAllJobs(): Promise<Job[]> {
  const all: Job[] = []
  const limit = 100
  let offset = 0
  for (;;) {
    const res = await client.getList<Job>({ endpoint: 'jobs', queries: { limit, offset, depth: 1 } })
    all.push(...res.contents)
    offset += limit
    if (offset >= res.totalCount) break
  }
  return all
}

// ===== 1求人 → 1行（対象外は null で除外） =====
function toRow(
  job: Job,
  generatedImages: Map<string, string>,
  imagePlans: Map<string, CatalogImagePlan>,
): Record<string, string> | null {
  const cat = classifyCatalogJob(job)
  if (cat === 'other') return null // ドライバー系以外は広告対象外

  const imagePlan = imagePlans.get(job.id)
  if (!imagePlan) return null
  const img = generatedImages.get(job.id) || (!BLOB_TOKEN ? imagePlan.spec.sourceUrl : '')
  if (!img) return null // 画像なしは配信不可

  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const region = job.prefecture?.region ?? parsed.region ?? ''
  const locality = job.municipality?.name ?? parsed.locality ?? ''
  const geo = CITY_GEO[`${region}${locality}`]
  if (region && locality && !geo) console.warn(`[catalog-feed] 座標未登録の市区町村: ${region}${locality} (catalog-city-geo.json に追加してください)`)

  const descSrc = buildDescriptionText(job, region, locality)
  const desc = sanitizeCatalogText(descSrc)
  if (hasResidualPictograph(desc.clean)) return null

  const titleS = sanitizeCatalogText(buildCatalogTitle(toCatalogCopyInput(job, cat, region, locality)))
  const copyInput = toCatalogCopyInput(job, cat, region, locality)
  const copyIssues = validateCatalogCopy(titleS.clean, desc.clean)
  if (copyIssues.length) {
    console.warn(`[catalog-copy] 配信保留: ${job.id} (${copyIssues.join(', ')})`)
    return null
  }

  return {
    id: job.id,
    title: titleS.clean,
    description: desc.clean,
    availability: 'in stock',
    condition: 'new',
    price: '1 JPY', // 名目（価格オーバーレイOFF前提。給与は description / custom_label_3 に格納）
    link: `https://ridejob.jp/job/${job.id}?utm_content=${job.id}&utm_source=meta&utm_medium=catalog`,
    image_link: img,
    brand: clip(job.companyName || 'RIDEJOB', 100),
    'address.city': locality,
    'address.country': 'Japan',
    'address.postal_code': formatPostal(job.addressZip),
    'address.region': region,
    'address.street_address': buildStreetAddress(job, region, locality),
    'address.latitude': geo ? String(geo[0]) : '',
    'address.longitude': geo ? String(geo[1]) : '',
    'product_tags[0]': cat,
    'product_tags[1]': region,
    'custom_label_0': cat, // 職種（商品セット第一軸）
    'custom_label_1': job.employmentType?.[0] ?? '', // 雇用形態
    'custom_label_2': region, // 都道府県
    'custom_label_3': salaryBand(job), // 給与帯
    'custom_label_4': catalogRoleKey(copyInput), // 職種詳細（商品セット第二軸）
    '_image_source': imagePlan.sourceKind,
    '_reference_image_url': imagePlan.referenceSourceUrl,
    '_source_image_url': imagePlan.spec.sourceUrl,
  }
}

// ===== TSV =====
// 改行を含むフィールド（description）は RFC4180 準拠のダブルクォートで包む。
// Meta の CSV/TSV 取り込みは引用符付きフィールド内の改行をサポート。
function toTSV(rows: Record<string, string>[]): string {
  const esc = (v: string) => {
    let s = String(v ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
    if (/[\n"]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [HEADERS.join('\t')]
  for (const r of rows) lines.push(HEADERS.map((h) => esc(r[h])).join('\t'))
  return lines.join('\n')
}

// ===== 確認用（軽量）フィード =====
// Meta配信には使わない。人が Google Sheets の IMPORTDATA で中身を確認するための軽量版。
// 本フィードは説明文を全文含み8MB超→IMPORTDATAのサイズ上限で読めないため、
// 説明を先頭120字に切り、確認に必要な列だけを日本語ヘッダで出力（1MB未満）。
const REVIEW_HEADERS = [
  'id', '職種', '職種詳細', '雇用形態', '県', '給与帯', 'タイトル', '会社', '市区町村', '在庫',
  '画像生成方式', '遷移先参照画像URL', '生成元画像URL', '画像URL', 'リンク',
  'タイトル文字数', '説明文字数', '説明(先頭120字)',
] as const

function toReviewTSV(rows: Record<string, string>[]): string {
  const esc = (v: string) => String(v ?? '').replace(/[\t\r\n]+/g, ' ')
  const lines = [REVIEW_HEADERS.join('\t')]
  for (const r of rows) {
    lines.push([
      r['id'],
      r['custom_label_0'],
      r['custom_label_4'],
      r['custom_label_1'],
      r['custom_label_2'],
      r['custom_label_3'],
      r['title'],
      r['brand'],
      r['address.city'],
      r['availability'],
      r['_image_source'],
      r['_reference_image_url'],
      r['_source_image_url'],
      r['image_link'],
      r['link'],
      String(r['title'].length),
      String(r['description'].length),
      clip(r['description'], 120),
    ].map(esc).join('\t'))
  }
  return lines.join('\n')
}

function toImageGenerationQueueItem(job: Job, category: CatalogCategory, reason: string) {
  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const region = job.prefecture?.region ?? parsed.region ?? ''
  const locality = job.municipality?.name ?? parsed.locality ?? ''
  return {
    job_id: job.id,
    title: buildCatalogTitle(toCatalogCopyInput(job, category, region, locality)),
    category: catalogRoleLabel({
      category,
      sourceTitle: job.jobName ?? job.title ?? '',
      sourceCategory: job.jobCategory?.name ?? '',
    }),
    location: `${region}${locality}`.trim(),
    salary: salaryLabel(job),
    appeal: catalogHtmlToText(job.descriptionAppeal || '').slice(0, 600),
    company: job.companyName || '',
    employment_type: job.employmentType?.[0] ?? '',
    source_url: `https://ridejob.jp/job/${job.id}`,
    source_image_url: jobImageSource(job),
    reason,
  }
}

// ===== main =====
async function main() {
  const jobs = await fetchAllJobs()
  const approvedImages = await fetchApprovedImages()
  const candidatePlans = jobs
    .map((job) => buildCatalogImagePlan(job, approvedImages))
    .filter((plan): plan is CatalogImagePlan => plan !== null)
  const referenceSourceCounts = new Map<string, number>()
  for (const plan of candidatePlans) {
    if (plan.sourceKind !== '求人詳細ページ画像') continue
    referenceSourceCounts.set(plan.spec.sourceUrl, (referenceSourceCounts.get(plan.spec.sourceUrl) || 0) + 1)
  }
  const duplicateReferenceSources = new Set(
    [...referenceSourceCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([source]) => source),
  )
  // 求人ページ自身が同じ画像を使っている場合は、ページとの整合性を優先して一旦配信対象に残す。
  // 同時に生成キューへ送り、承認済み求人別画像へ段階的に置き換える。
  const plans = candidatePlans
  const imagePlans = new Map(plans.map((plan) => [plan.spec.id, plan]))
  const candidatePlanById = new Map(candidatePlans.map((plan) => [plan.spec.id, plan]))
  const imageGenerationQueue = jobs.flatMap((job) => {
    const category = classifyCatalogJob(job)
    if (category === 'other') return []
    const candidate = candidatePlanById.get(job.id)
    const reason = !candidate
      ? 'missing_job_specific_image'
      : candidate.sourceKind === '求人詳細ページ画像'
      && duplicateReferenceSources.has(candidate.spec.sourceUrl)
      ? 'duplicate_reference_image'
      : candidate.sourceKind === '汎用職種画像（緊急縮退）'
        ? 'generic_fallback_image'
        : ''
    if (!reason) return []
    return [toImageGenerationQueueItem(job, category, reason)]
  })
  const generatedImages = BLOB_TOKEN
    ? await prepareCatalogImages(plans.map((plan) => plan.spec), {
        token: BLOB_TOKEN,
        force: FORCE_REGENERATE_IMAGES,
        concurrency: 4,
      })
    : new Map<string, string>()
  if (BLOB_TOKEN) {
    const queuedIds = new Set(imageGenerationQueue.map((item) => item.job_id))
    const jobsById = new Map(jobs.map((job) => [job.id, job]))
    for (const plan of plans) {
      if (generatedImages.has(plan.spec.id) || queuedIds.has(plan.spec.id)) continue
      const job = jobsById.get(plan.spec.id)
      if (!job) continue
      imageGenerationQueue.push(toImageGenerationQueueItem(job, classifyCatalogJob(job), 'image_fetch_or_render_failed'))
      queuedIds.add(job.id)
    }
  }
  if (!BLOB_TOKEN) {
    console.warn('[catalog-image] BLOB_READ_WRITE_TOKEN未設定のため、ローカル実行は生成元URLを使用します')
  }
  if (imageGenerationQueue.length) {
    console.warn(`[catalog-image] 求人別画像の生成・承認待ち=${imageGenerationQueue.length}件`)
  }

  const rows = jobs
    .map((job) => toRow(job, generatedImages, imagePlans))
    .filter((r): r is Record<string, string> => r !== null)
  if (rows.some((row) => row['custom_label_4'] === 'other')) {
    throw new Error('配信対象求人に詳細職種 other が含まれています')
  }
  const tsv = toTSV(rows)
  const reviewTsv = toReviewTSV(rows)
  const excluded = jobs.length - rows.length
  const imageSourceCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row['_image_source']] = (counts[row['_image_source']] || 0) + 1
    return counts
  }, {})
  const primaryCategoryCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const category = row['custom_label_0']
    counts[category] = (counts[category] || 0) + 1
    return counts
  }, {})
  const detailedRoleCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const role = row['custom_label_4']
    counts[role] = (counts[role] || 0) + 1
    return counts
  }, {})
  const qualityReport = JSON.stringify({
    generated_at: new Date().toISOString(),
    fetched_jobs: jobs.length,
    included_products: rows.length,
    excluded_products: excluded,
    image_source_counts: imageSourceCounts,
    image_generation_queue_count: imageGenerationQueue.length,
    duplicate_reference_source_count: duplicateReferenceSources.size,
    classification_counts: {
      primary: primaryCategoryCounts,
      detailed: detailedRoleCounts,
    },
    copy_rules: {
      title_max_length: 42,
      description_min_length: 100,
      description_max_length: 700,
      agency_disclosure_required: true,
      ambiguous_employer_voice_allowed: false,
      universal_guarantee_copy_allowed: false,
    },
    generic_image_fallback_enabled: ALLOW_GENERIC_IMAGE_FALLBACK,
  }, null, 2)
  const imageQueueReport = JSON.stringify({
    generated_at: new Date().toISOString(),
    jobs: imageGenerationQueue,
  }, null, 2)
  if (!ALLOW_GENERIC_IMAGE_FALLBACK && rows.some((row) => row['_image_source'].startsWith('汎用職種画像'))) {
    throw new Error('求人固有でない汎用職種画像がフィードに含まれています')
  }
  console.log(`[catalog-feed] 取得=${jobs.length}件 / 収録=${rows.length}件 / 除外=${excluded}件`)

  if (BLOB_TOKEN) {
    const fs = await import('node:fs/promises')
    await fs.writeFile('catalog-image-generation-queue.json', imageQueueReport, 'utf-8')
    const blobOpts = {
      access: 'public' as const,
      addRandomSuffix: false, // 固定URL
      allowOverwrite: true,
      contentType: 'text/tab-separated-values; charset=utf-8',
      token: BLOB_TOKEN,
    }
    const { url } = await put('catalog/ridejob-feed.tsv', tsv, blobOpts) // Metaデータソース用
    console.log(`[catalog-feed] published: ${url}`)
    const review = await put('catalog/ridejob-feed-review.tsv', reviewTsv, blobOpts) // Sheets確認用（軽量）
    console.log(`[catalog-feed] published(review): ${review.url}`)
    const jsonOpts = {
      access: 'public' as const,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json; charset=utf-8',
      token: BLOB_TOKEN,
    }
    const quality = await put('catalog/ridejob-feed-quality.json', qualityReport, jsonOpts)
    console.log(`[catalog-feed] published(quality): ${quality.url}`)
    const queue = await put(
      'catalog/ridejob-image-generation-queue.json',
      imageQueueReport,
      jsonOpts,
    )
    console.log(`[catalog-feed] published(image-queue): ${queue.url}`)
  } else {
    const fs = await import('node:fs/promises')
    await fs.writeFile('catalog-feed.tsv', tsv, 'utf-8')
    await fs.writeFile('catalog-feed-review.tsv', reviewTsv, 'utf-8')
    await fs.writeFile('catalog-feed-quality.json', qualityReport, 'utf-8')
    await fs.writeFile(
      'catalog-image-generation-queue.json',
      imageQueueReport,
      'utf-8',
    )
    console.log('[catalog-feed] BLOB_READ_WRITE_TOKEN 未設定 → ローカル出力(catalog-feed.tsv / catalog-feed-review.tsv / catalog-feed-quality.json / catalog-image-generation-queue.json)')
  }
}

main().catch((e) => {
  console.error('[catalog-feed] 失敗:', e)
  process.exit(1)
})
