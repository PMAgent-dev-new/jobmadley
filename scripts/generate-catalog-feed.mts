/**
 * RIDEJOB Meta カタログフィード 生成スクリプト
 *
 * microCMS(jobs) と掲載中のハローワーク整備士求人を全件取得
 * → Meta 商品フィード(TSV) を生成 → PM AgentのSupabase Storageへ publish。
 * GitHub Actions で定期実行する想定（`.github/workflows/catalog-feed.yml`）。
 *
 * 必要 env:
 *   - NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN, MICROCMS_API_KEY  (求人データ)
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY（未設定ならローカルにファイル出力）
 *   - CATALOG_STORAGE_BUCKET（任意。既定: meta-catalog）
 *
 * 実行: `npx tsx scripts/generate-catalog-feed.mts`
 *
 * 備考:
 *   - サニタイズ / 職種分類 / HTML→text は旧 GAS/node 版と同一ルール（Meta規約対応）。
 *   - id は遷移先URLの求人IDと一致させる。ハローワーク求人は raw source_id を使う。
 *   - price は名目 1 JPY（価格オーバーレイOFF前提。給与は description と custom_label_3 に格納）。
 *   - 緯度経度(availability_circle) / neighborhoods は Meta 標準カタログで不要のため出力しない。
 */
import { buildCatalogLink, isCatalogLinkRoutedCorrectly } from './lib/catalog-link.mts'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from 'microcms-js-sdk'
import { readFileSync } from 'node:fs'
import {
  canonicalImageSource,
  catalogImagePath,
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
  HELLOWORK_DISCLOSURE,
  validateCatalogCopy,
  type CatalogCopyInput,
} from './lib/catalog-copy.mts'
import {
  assertExternalSourcePublishable,
  fetchAllExternalMechanicJobs,
  type ExternalCatalogJob,
} from './lib/catalog-external-jobs.mts'
import { buildExternalMechanicSourceSvg } from './lib/catalog-external-images.mts'
import {
  withheldExternalJobDescription,
  withheldExternalJobTitle,
} from '../src/features/external-jobs/redact.ts'
import {
  catalogStorageFromEnv,
  type SupabaseCatalogStorage,
} from './lib/catalog-storage.mts'
import {
  compareCatalogInventoryDrop,
  compareCatalogInventoryExact,
  validateCatalogInventoryShape,
  type CatalogInventory,
} from './lib/catalog-inventory.mts'
import { importPublishedMetaCatalog } from './lib/meta-catalog-import.mts'

// 市区町村→[緯度, 経度]（国土地理院ジオコーディングで事前生成した静的データ）。
// Meta の住所検証は「有効な緯度経度 または 国+市町村」を要求するため、
// 市町村名の解決に依存せず座標で常に有効化する。新しい市区町村が増えたら
// 生成時に警告を出す（データ再生成は scripts/data/catalog-city-geo.json を更新）。
const CITY_GEO: Record<string, [number, number]> = JSON.parse(
  readFileSync(new URL('./data/catalog-city-geo.json', import.meta.url), 'utf-8'),
)

const SERVICE_DOMAIN = process.env.NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN || process.env.MICROCMS_SERVICE_DOMAIN
const API_KEY = process.env.MICROCMS_API_KEY
const STORAGE = catalogStorageFromEnv()
const APPROVED_IMAGES_URL = process.env.CATALOG_APPROVED_IMAGES_URL || ''
const APPROVED_IMAGES_TOKEN = process.env.CATALOG_FEED_TOKEN || ''
const ALLOW_GENERIC_IMAGE_FALLBACK = process.env.CATALOG_ALLOW_GENERIC_IMAGE_FALLBACK === 'true'
const SNAPSHOT_BEFORE_PUBLISH = process.env.CATALOG_SNAPSHOT_BEFORE_PUBLISH === 'true'
const PUBLISH_REQUIRED = process.env.CATALOG_PUBLISH_REQUIRED === 'true'
const INITIAL_PUBLISH_CONFIRMED = process.env.CATALOG_INITIAL_PUBLISH_CONFIRMED === 'true'
const EXPECT_EXTERNAL_JOBS = Math.max(0, Number(process.env.CATALOG_EXPECT_EXTERNAL_JOBS) || 0)
const EXPECT_PRODUCTS = Math.max(0, Number(process.env.CATALOG_EXPECT_PRODUCTS) || 0)
const EXPECT_OWNED_PRODUCTS = Math.max(0, Number(process.env.CATALOG_EXPECT_OWNED_PRODUCTS) || 0)
const EXPECT_MECHANIC_PRODUCTS = Math.max(0, Number(process.env.CATALOG_EXPECT_MECHANIC_PRODUCTS) || 0)
const MIN_EXTERNAL_JOBS = Math.max(1, Number(process.env.CATALOG_MIN_EXTERNAL_JOBS) || 5_000)
const MAX_EXTERNAL_DROP_RATIO = Math.min(
  0.9,
  Math.max(0, Number(process.env.CATALOG_MAX_EXTERNAL_DROP_RATIO) || 0.3),
)
const PUBLISH_STATE_PATH = 'catalog/publish-state.json'
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN_WRITE || ''
const META_FEED_ID = process.env.CATALOG_META_FEED_ID || ''
const META_CATALOG_ID = process.env.CATALOG_META_CATALOG_ID || ''
const META_MAX_INVALID_ITEMS = Math.max(0, Number(process.env.CATALOG_META_MAX_INVALID_ITEMS) || 0)

if (!SERVICE_DOMAIN || !API_KEY) {
  throw new Error('NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN（またはMICROCMS_SERVICE_DOMAIN）とMICROCMS_API_KEYが必要です')
}
if (PUBLISH_REQUIRED && !STORAGE) {
  throw new Error('CATALOG_PUBLISH_REQUIRED=true ですがSupabase Storageの認証情報がありません')
}
if (PUBLISH_REQUIRED && !SNAPSHOT_BEFORE_PUBLISH) {
  throw new Error('CATALOG_PUBLISH_REQUIRED=true の公開ではスナップショットが必須です')
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
  catalogOrigin?: 'ridejob' | 'hellowork'
  catalogAvailability?: 'in stock' | 'out of stock'
  catalogDisclosure?: string
  externalData?: ExternalCatalogJob
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
    // 外部整備士の自由記述だけを除外し、既存の自社求人は従来の勤務時間を維持する。
    workHours: job.catalogOrigin === 'hellowork' ? undefined : job.workHours,
    holidays: job.holidays,
    disclosure: job.catalogDisclosure,
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
  if (job.catalogOrigin === 'hellowork' && job.externalData) {
    return {
      spec: {
        id: job.id,
        sourceUrl: '',
        sourceSvg: buildExternalMechanicSourceSvg(job.externalData),
        category,
        roleLabel: catalogRoleLabel(copyInput),
        title: buildCatalogTitle(copyInput),
        company: '掲載企業非公開',
        salary: salaryLabel(job),
        location: `${region}${locality}`.trim(),
        employmentType: job.employmentType?.[0] ?? '',
      },
      sourceKind: '求人データ別生成画像',
      referenceSourceUrl: '',
    }
  }
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
  'product_tags[0]', 'product_tags[1]', 'product_tags[2]',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4',
] as const
const warnedMissingGeo = new Set<string>()

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

function externalToCatalogJob(job: ExternalCatalogJob): Job {
  // 登録社名だけでなく、本文に店舗ブランドや勤務先の別名が含まれる。
  // 公開フィードは構造化済みの職種・地域・雇用形態だけで概要を作り、
  // 企業を特定できる原文は載せない。画像特徴の判定は externalData の内部値を使う。
  const publicTitle = withheldExternalJobTitle(job.jobCategory)
  const publicDescription = withheldExternalJobDescription({
    category: job.jobCategory,
    prefecture: job.prefecture,
    municipality: job.municipality,
    employmentType: job.employmentType,
  })
  return {
    id: job.sourceId,
    title: publicTitle,
    jobName: publicTitle,
    // 企業名は公開フィードへ出さない。
    companyName: undefined,
    prefecture: { region: job.prefecture, name: job.prefecture },
    municipality: job.municipality ? { name: job.municipality } : undefined,
    addressPrefMuni: `${job.prefecture}${job.municipality || ''}`,
    jobCategory: { name: job.jobCategory },
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    wageType: job.salaryKind ? [job.salaryKind] : undefined,
    employmentType: job.employmentType ? [job.employmentType] : undefined,
    descriptionWork: publicDescription,
    // 勤務時間の自由記述には企業名・店舗名が含まれる場合があるため、
    // 外部整備士の公開値には保持しない。画像特徴の判定だけは externalData 内で行う。
    workHours: undefined,
    catalogOrigin: 'hellowork',
    catalogAvailability: 'in stock',
    catalogDisclosure: HELLOWORK_DISCLOSURE,
    externalData: job,
  }
}

function appendExternalJobs(ownedJobs: Job[], externalJobs: ExternalCatalogJob[]): {
  jobs: Job[]
  excludedAsDuplicate: number
} {
  const seenIds = new Set(ownedJobs.map((job) => job.id))
  const included: Job[] = []

  for (const external of externalJobs) {
    if (seenIds.has(external.sourceId)) {
      throw new Error(`カタログIDが既存求人と衝突しています: ${external.sourceId}`)
    }
    const job = externalToCatalogJob(external)
    seenIds.add(job.id)
    included.push(job)
  }
  return { jobs: [...ownedJobs, ...included], excludedAsDuplicate: 0 }
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
  const localSvgPreview = imagePlan.spec.sourceSvg
    ? `https://ridejob.jp/images/OGP.png?catalog_preview=${encodeURIComponent(job.id)}`
    : ''
  const img = generatedImages.get(job.id) || (!STORAGE ? imagePlan.spec.sourceUrl || localSvgPreview : '')
  if (!img) return null // 画像なしは配信不可

  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const region = job.prefecture?.region ?? parsed.region ?? ''
  const locality = job.municipality?.name ?? parsed.locality ?? ''
  const geo = CITY_GEO[`${region}${locality}`]
  const geoKey = `${region}${locality}`
  if (region && locality && !geo && !warnedMissingGeo.has(geoKey)) {
    warnedMissingGeo.add(geoKey)
    console.warn(`[catalog-feed] 座標未登録の市区町村: ${geoKey} (catalog-city-geo.json に追加してください)`)
  }

  const descSrc = buildDescriptionText(job, region, locality)
  const desc = sanitizeCatalogText(descSrc)
  if (hasResidualPictograph(desc.clean)) return null

  const titleS = sanitizeCatalogText(buildCatalogTitle(toCatalogCopyInput(job, cat, region, locality)))
  const copyInput = toCatalogCopyInput(job, cat, region, locality)
  const copyIssues = validateCatalogCopy(titleS.clean, desc.clean, {
    requiredDisclosure: job.catalogDisclosure,
  })
  if (copyIssues.length) {
    console.warn(`[catalog-copy] 配信保留: ${job.id} (${copyIssues.join(', ')})`)
    return null
  }

  return {
    id: job.id,
    title: titleS.clean,
    description: desc.clean,
    availability: job.catalogAvailability || 'in stock',
    condition: 'new',
    price: '1 JPY', // 名目（価格オーバーレイOFF前提。給与は description / custom_label_3 に格納）
    link: buildCatalogLink(job.id, cat, job.catalogOrigin),
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
    'product_tags[2]': `source:${job.catalogOrigin || 'ridejob'}`,
    'custom_label_0': cat, // 職種（商品セット第一軸）
    'custom_label_1': job.employmentType?.[0] ?? '', // 雇用形態
    'custom_label_2': region, // 都道府県
    'custom_label_3': salaryBand(job), // 給与帯
    'custom_label_4': catalogRoleKey(copyInput), // 職種詳細（商品セット第二軸）
    '_image_source': imagePlan.sourceKind,
    '_reference_image_url': imagePlan.referenceSourceUrl,
    '_source_image_url': imagePlan.spec.sourceUrl,
    '_catalog_origin': job.catalogOrigin || 'ridejob',
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
  'id', 'データソース', '職種', '職種詳細', '雇用形態', '県', '給与帯', 'タイトル', '会社', '市区町村', '在庫',
  '画像生成方式', '遷移先参照画像URL', '生成元画像URL', '画像URL', 'リンク',
  'タイトル文字数', '説明文字数', '説明(先頭120字)',
] as const

function toReviewTSV(rows: Record<string, string>[]): string {
  const esc = (v: string) => String(v ?? '').replace(/[\t\r\n]+/g, ' ')
  const lines = [REVIEW_HEADERS.join('\t')]
  for (const r of rows) {
    lines.push([
      r['id'],
      r['_catalog_origin'],
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

const SNAPSHOT_FILENAMES = [
  'ridejob-feed.tsv',
  'ridejob-feed-review.tsv',
  'ridejob-feed-quality.json',
  'ridejob-image-generation-queue.json',
] as const
const OPTIONAL_SNAPSHOT_FILENAMES = ['publish-state.json'] as const

type CatalogSnapshotManifest = {
  version: 1
  generation: string
  created_at: string
  files: Array<{ filename: string; pathname: string; url: string; sha256: string; bytes: number }>
  absent_files: string[]
}

async function readLatestCatalogSnapshot(
  storage: SupabaseCatalogStorage,
): Promise<CatalogSnapshotManifest> {
  const targetNames = [...SNAPSHOT_FILENAMES, ...OPTIONAL_SNAPSHOT_FILENAMES]
  const targetSet = new Set<string>(targetNames)
  const bytes = await storage.read('catalog/snapshots/latest.json')
  const parsed = JSON.parse(bytes.toString('utf-8')) as Partial<CatalogSnapshotManifest>
  if (
    parsed.version !== 1
    || !parsed.generation
    || !Array.isArray(parsed.files)
    || !Array.isArray(parsed.absent_files)
  ) {
    throw new Error('最新スナップショット世代マニフェストが不正です')
  }
  const seen = new Set<string>()
  for (const file of parsed.files) {
    const expectedPath = `catalog/snapshots/generations/${parsed.generation}/${file.filename}`
    if (
      !targetSet.has(file.filename)
      || seen.has(file.filename)
      || file.pathname !== expectedPath
      || file.url !== storage.publicUrl(expectedPath)
      || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.bytes)
      || file.bytes < 1
    ) {
      throw new Error(`最新スナップショットのファイル情報が不正です: ${file.filename || 'unknown'}`)
    }
    seen.add(file.filename)
  }
  for (const filename of parsed.absent_files) {
    if (!targetSet.has(filename) || seen.has(filename)) {
      throw new Error(`最新スナップショットの不存在情報が不正です: ${filename}`)
    }
    seen.add(filename)
  }
  if (seen.size !== targetNames.length) {
    throw new Error(`最新スナップショットの対象数が不正です: expected=${targetNames.length} actual=${seen.size}`)
  }
  return parsed as CatalogSnapshotManifest
}

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex')

async function fetchPublicBytes(url: string, label: string, attempts = 5): Promise<Buffer> {
  let lastError = ''
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const separator = url.includes('?') ? '&' : '?'
      const response = await fetch(`${url}${separator}catalog_verify=${Date.now()}-${attempt}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown error'
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 15_000))
    }
  }
  throw new Error(`${label}を取得できません: ${lastError}`)
}

async function assertPublishedObject(
  url: string,
  expected: Buffer | string,
  label: string,
): Promise<void> {
  const expectedBuffer = typeof expected === 'string' ? Buffer.from(expected) : expected
  const expectedHash = sha256(expectedBuffer)
  let actualHash = ''
  // 固定URL上書きはCDN反映に時間差があるため、ハッシュ一致まで最大約60秒待つ。
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const actual = await fetchPublicBytes(url, label, 1)
    actualHash = sha256(actual)
    if (actualHash === expectedHash && actual.byteLength === expectedBuffer.byteLength) {
      console.log(`[catalog-feed] verified: ${label} bytes=${actual.byteLength} sha256=${actualHash}`)
      return
    }
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 15_000))
  }
  throw new Error(`${label}の読戻しハッシュが一致しません: expected=${expectedHash} actual=${actualHash}`)
}

async function assertStorageObjectAbsent(
  pathname: string,
  storage: SupabaseCatalogStorage,
): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (!await storage.find(pathname)) return
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
  throw new Error(`削除したStorageオブジェクトが残っています: ${pathname}`)
}

function catalogContentType(filename: string): string {
  return filename.endsWith('.tsv')
    ? 'text/tab-separated-values; charset=utf-8'
    : 'application/json; charset=utf-8'
}

async function snapshotCurrentCatalog(storage: SupabaseCatalogStorage): Promise<CatalogSnapshotManifest> {
  const targets = [...SNAPSHOT_FILENAMES, ...OPTIONAL_SNAPSHOT_FILENAMES]
    .map((filename) => `catalog/${filename}`)
  const objects = await Promise.all(targets.map((pathname) => storage.find(pathname)))
  const byPath = new Map(objects.filter(Boolean).map((object) => [object!.pathname, object!]))
  const requiredPaths = SNAPSHOT_FILENAMES.map((filename) => `catalog/${filename}`)
  const presentRequired = requiredPaths.filter((pathname) => byPath.has(pathname))
  if (presentRequired.length > 0 && presentRequired.length !== requiredPaths.length) {
    throw new Error(`公開前Storageが部分状態です: required=${requiredPaths.length} present=${presentRequired.length}`)
  }
  const createdAt = new Date().toISOString()
  const generation = `${createdAt.replace(/[:.]/g, '-')}-${process.env.GITHUB_RUN_ID || randomUUID().slice(0, 8)}`
  const files: CatalogSnapshotManifest['files'] = []
  const absentFiles: string[] = []
  for (const pathname of targets) {
    const blob = byPath.get(pathname)
    if (!blob) {
      absentFiles.push(pathname.split('/').at(-1) || pathname)
      continue
    }
    const filename = pathname.split('/').at(-1) || 'catalog-file'
    const sourceBytes = await fetchPublicBytes(blob.url, pathname)
    const snapshotPath = `catalog/snapshots/generations/${generation}/${filename}`
    const snapshot = await storage.put(snapshotPath, sourceBytes, {
      upsert: false,
      contentType: catalogContentType(filename),
      cacheControl: 31_536_000,
    })
    await assertPublishedObject(snapshot.url, sourceBytes, `snapshot:${filename}`)
    files.push({
      filename,
      pathname: snapshotPath,
      url: snapshot.url,
      sha256: sha256(sourceBytes),
      bytes: sourceBytes.byteLength,
    })
  }
  const manifest: CatalogSnapshotManifest = {
    version: 1,
    generation,
    created_at: createdAt,
    files,
    absent_files: absentFiles,
  }
  const manifestJson = JSON.stringify(manifest, null, 2)
  const pointer = await storage.put('catalog/snapshots/latest.json', manifestJson, {
    upsert: true,
    contentType: 'application/json; charset=utf-8',
    cacheControl: 0,
  })
  await assertPublishedObject(pointer.url, manifestJson, 'snapshot-manifest')
  console.log(`[catalog-feed] snapshot-generation: ${generation}`)
  return manifest
}

async function restoreCatalogSnapshot(
  manifest: CatalogSnapshotManifest,
  storage: SupabaseCatalogStorage,
): Promise<void> {
  const restoreOrder = [
    'ridejob-feed-review.tsv',
    'ridejob-feed-quality.json',
    'ridejob-image-generation-queue.json',
    // 公開完了マーカーは対応する一次フィードより先に戻す。不整合時は次回公開がfail closedになる。
    'publish-state.json',
    // Metaが読む一次フィードは最後に戻す。
    'ridejob-feed.tsv',
  ]
  const files = new Map(manifest.files.map((file) => [file.filename, file]))
  const verified = new Map<string, Buffer>()

  // 復元元を全件検証し終えるまでライブ側を1件も変更しない。
  for (const filename of restoreOrder) {
    const source = files.get(filename)
    if (!source) {
      if (!manifest.absent_files.includes(filename)) {
        throw new Error(`復元対象がスナップショットにも不存在記録にもありません: ${filename}`)
      }
      continue
    }
    const expected = await fetchPublicBytes(source.url, `snapshot:${filename}`)
    if (sha256(expected) !== source.sha256 || expected.byteLength !== source.bytes) {
      throw new Error(`復元元スナップショットの検証に失敗しました: ${filename}`)
    }
    verified.set(filename, expected)
  }

  for (const filename of restoreOrder) {
    const source = files.get(filename)
    if (!source) {
      if (!manifest.absent_files.includes(filename)) {
        throw new Error(`復元対象の不存在記録がありません: ${filename}`)
      }
      if (await storage.find(`catalog/${filename}`)) {
        await storage.remove([`catalog/${filename}`])
      }
      await assertStorageObjectAbsent(`catalog/${filename}`, storage)
      continue
    }
    const expected = verified.get(filename)
    if (!expected) throw new Error(`検証済み復元元がありません: ${filename}`)
    const restored = await storage.put(`catalog/${filename}`, expected, {
      upsert: true,
      contentType: catalogContentType(filename),
      cacheControl: 0,
    })
    await assertPublishedObject(restored.url, expected, `restored:${filename}`)
  }
}

async function refreshMetaAfterAutomaticRestore(storage: SupabaseCatalogStorage): Promise<void> {
  const result = await importPublishedMetaCatalog({
    storage,
    accessToken: META_ACCESS_TOKEN,
    feedId: META_FEED_ID,
    catalogId: META_CATALOG_ID,
    maxInvalidItems: META_MAX_INVALID_ITEMS,
  })
  console.log(
    `[catalog-feed] Meta復元反映を確認: upload_id=${result.id}`
    + ` detected=${result.num_detected_items}`
    + ` persisted=${result.num_persisted_items}`
    + ` invalid=${result.num_invalid_items}`,
  )
}

async function pruneOldSnapshotGenerations(
  storage: SupabaseCatalogStorage,
  keep = 3,
): Promise<void> {
  const root = 'catalog/snapshots/generations'
  const generations = (await storage.listDirectory(root))
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.pathname.split('/').at(-1) || '')
    .filter(Boolean)
    .sort()
    .reverse()
  const obsolete = generations.slice(keep)
  let removed = 0
  for (const generation of obsolete) {
    const objects = (await storage.listDirectory(`${root}/${generation}`))
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.pathname)
    await storage.remove(objects)
    removed += objects.length
  }
  if (obsolete.length) {
    console.log(`[catalog-feed] pruned snapshot generations=${obsolete.length} objects=${removed}`)
  }
}

type ExternalMechanicCategoryCounts = {
  car_mechanic: number
  bike_mechanic: number
}

type PublishHighWater = {
  inventory: CatalogInventory
  externalCategories: ExternalMechanicCategoryCounts
}

function countExternalMechanicCategories(jobs: ExternalCatalogJob[]): ExternalMechanicCategoryCounts {
  return {
    car_mechanic: jobs.filter((job) => job.jobCategory === '自動車整備士').length,
    bike_mechanic: jobs.filter((job) => job.jobCategory === 'バイク整備士').length,
  }
}

async function assertExternalInventoryIsSane(
  current: number,
  currentCategories: ExternalMechanicCategoryCounts,
  storage?: SupabaseCatalogStorage,
): Promise<void> {
  if (current < MIN_EXTERNAL_JOBS) {
    throw new Error(`外部求人が安全下限を下回りました: current=${current} minimum=${MIN_EXTERNAL_JOBS}`)
  }
  if (EXPECT_EXTERNAL_JOBS > 0 && current !== EXPECT_EXTERNAL_JOBS) {
    throw new Error(`外部求人数が初回公開の期待値と一致しません: expected=${EXPECT_EXTERNAL_JOBS} current=${current}`)
  }
  if (!storage) return
  const [stateObject, feedObject] = await Promise.all([
    storage.find(PUBLISH_STATE_PATH),
    storage.find('catalog/ridejob-feed.tsv'),
  ])
  if (!stateObject && !feedObject) {
    throw new Error('空の公開先には復元可能な基準フィードがありません。先にrebaselineを実行してください')
  }
  if (!stateObject || !feedObject) {
    throw new Error('公開完了マーカーと一次フィードの一方だけが存在するため公開を中止します')
  }
  let prior = 0
  let priorCategories: ExternalMechanicCategoryCounts | null = null
  try {
    const stateBytes = await fetchPublicBytes(stateObject.url, PUBLISH_STATE_PATH)
    const state = JSON.parse(stateBytes.toString('utf-8')) as {
      version?: number
      external_jobs?: number
      primary_sha256?: string
      primary_bytes?: number
      baseline?: boolean
      external_category_counts?: Partial<ExternalMechanicCategoryCounts>
      external_high_water?: number
      external_category_high_water?: Partial<ExternalMechanicCategoryCounts>
    }
    prior = Number(state.external_jobs)
    if (
      state.version !== 1
      || !Number.isFinite(prior)
      || prior < 0
      || !state.primary_sha256
      || !Number.isFinite(state.primary_bytes)
    ) {
      throw new Error('公開完了マーカーが不正です')
    }
    const storedExternalHighWater = Number(state.external_high_water ?? prior)
    if (!Number.isSafeInteger(storedExternalHighWater) || storedExternalHighWater < prior) {
      throw new Error('公開完了マーカーの外部求人高水位が不正です')
    }
    prior = storedExternalHighWater
    const livePrimary = await fetchPublicBytes(feedObject.url, 'catalog/ridejob-feed.tsv')
    if (sha256(livePrimary) !== state.primary_sha256 || livePrimary.byteLength !== state.primary_bytes) {
      const mismatch = new Error('公開完了マーカーと一次フィードのハッシュが一致しません')
      console.error('[catalog-feed] 前回公開の途中終了を検知したため直前スナップショットへ自動復元します')
      try {
        const latest = await readLatestCatalogSnapshot(storage)
        await restoreCatalogSnapshot(latest, storage)
        await refreshMetaAfterAutomaticRestore(storage)
      } catch (recoveryError) {
        throw new AggregateError([mismatch, recoveryError], '前回公開の不整合を自動復元できませんでした')
      }
      throw new Error('前回公開の不整合を自動復元しました。今回の公開は中止し、次回再実行します')
    }
    // rebaseline は既存フィードを「復元可能な開始地点」として登録するだけで、
    // 外部求人を公開済みにする承認ではない。次の通常cronが初回公開を代行しないよう、
    // baseline=true の間は明示承認と直前実測件数の完全一致を必須にする。
    if (state.baseline === true) {
      if (!INITIAL_PUBLISH_CONFIRMED || EXPECT_EXTERNAL_JOBS <= 0) {
        throw new Error('基準化後の外部求人初回公開には明示承認と期待件数が必要です')
      }
      if (current !== EXPECT_EXTERNAL_JOBS) {
        throw new Error(
          `基準化後の外部求人数が初回公開の期待値と一致しません: expected=${EXPECT_EXTERNAL_JOBS} current=${current}`,
        )
      }
    } else {
      const currentCar = Number(state.external_category_counts?.car_mechanic)
      const currentBike = Number(state.external_category_counts?.bike_mechanic)
      const car = Number(state.external_category_high_water?.car_mechanic ?? currentCar)
      const bike = Number(state.external_category_high_water?.bike_mechanic ?? currentBike)
      if (!Number.isSafeInteger(car) || car < 0 || !Number.isSafeInteger(bike) || bike < 0) {
        throw new Error('公開完了マーカーの整備士カテゴリ別件数が不正です')
      }
      if (car < currentCar || bike < currentBike) {
        throw new Error('公開完了マーカーの整備士カテゴリ別高水位が不正です')
      }
      priorCategories = { car_mechanic: car, bike_mechanic: bike }
    }
  } catch (error) {
    throw new Error(`前回の外部求人数を検証できません: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  const minimumFromPrior = Math.floor(prior * (1 - MAX_EXTERNAL_DROP_RATIO))
  if (current <= minimumFromPrior) {
    throw new Error(
      `外部求人が前回比で急減しました: previous=${prior} current=${current}`
      + ` max_drop_ratio=${MAX_EXTERNAL_DROP_RATIO}`,
    )
  }
  if (priorCategories) {
    for (const category of ['car_mechanic', 'bike_mechanic'] as const) {
      const previous = priorCategories[category]
      const currentCategory = currentCategories[category]
      const minimum = Math.floor(previous * (1 - MAX_EXTERNAL_DROP_RATIO))
      if (previous > 0 && currentCategory <= minimum) {
        throw new Error(
          `外部求人がカテゴリ単位で急減しました: category=${category}`
          + ` previous=${previous} current=${currentCategory} max_drop_ratio=${MAX_EXTERNAL_DROP_RATIO}`,
        )
      }
    }
  }
}

function expectedCatalogInventory(): CatalogInventory | null {
  const expected = {
    products: EXPECT_PRODUCTS,
    externalProducts: EXPECT_EXTERNAL_JOBS,
    ownedProducts: EXPECT_OWNED_PRODUCTS,
    mechanicProducts: EXPECT_MECHANIC_PRODUCTS,
  }
  return Object.values(expected).every((value) => value > 0) ? expected : null
}

async function assertCatalogInventoryIsSane(
  current: CatalogInventory,
  storage?: SupabaseCatalogStorage,
): Promise<void> {
  const shapeIssues = validateCatalogInventoryShape(current)
  if (shapeIssues.length) throw new Error(`カタログ在庫構成が不正です: ${shapeIssues.join(' / ')}`)

  const expected = expectedCatalogInventory()
  if (INITIAL_PUBLISH_CONFIRMED) {
    if (!expected) {
      throw new Error('初回公開には全商品・外部求人・自社求人・整備士商品の期待件数が必要です')
    }
    const exactIssues = compareCatalogInventoryExact(current, expected)
    if (exactIssues.length) throw new Error(`初回公開の全件収録ゲートに失敗しました: ${exactIssues.join(' / ')}`)
  }
  if (!storage) return

  const stateObject = await storage.find(PUBLISH_STATE_PATH)
  if (!stateObject) return
  let state: {
    baseline?: boolean
    products?: number
    external_jobs?: number
    owned_products?: number
    mechanic_products?: number
    inventory_high_water?: Partial<CatalogInventory>
  }
  try {
    state = JSON.parse((await fetchPublicBytes(stateObject.url, PUBLISH_STATE_PATH)).toString('utf-8'))
  } catch (error) {
    throw new Error(`前回のカタログ在庫を検証できません: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  if (state.baseline === true) {
    if (!INITIAL_PUBLISH_CONFIRMED || !expected) {
      throw new Error('基準化後の初回公開には明示承認と4種類の期待件数が必要です')
    }
    return
  }
  const previous: CatalogInventory = {
    products: Number(state.inventory_high_water?.products ?? state.products),
    externalProducts: Number(state.inventory_high_water?.externalProducts ?? state.external_jobs),
    ownedProducts: Number(state.inventory_high_water?.ownedProducts ?? state.owned_products),
    mechanicProducts: Number(state.inventory_high_water?.mechanicProducts ?? state.mechanic_products),
  }
  // 高水位は各系列を独立に保持するため、合計=内訳という現在在庫向けの制約は課さない。
  const previousIssues = Object.entries(previous).flatMap(([key, value]) =>
    Number.isSafeInteger(value) && value >= 0 ? [] : [`${key}の高水位が不正です: ${String(value)}`],
  )
  if (previousIssues.length) {
    throw new Error(`前回のカタログ在庫マーカーが不正です: ${previousIssues.join(' / ')}`)
  }
  const dropIssues = compareCatalogInventoryDrop(current, previous, MAX_EXTERNAL_DROP_RATIO)
  if (dropIssues.length) throw new Error(`カタログ在庫の急減ゲートに失敗しました: ${dropIssues.join(' / ')}`)
}

async function readPublishHighWater(storage: SupabaseCatalogStorage): Promise<PublishHighWater | null> {
  const stateObject = await storage.find(PUBLISH_STATE_PATH)
  if (!stateObject) return null
  const state = JSON.parse(
    (await fetchPublicBytes(stateObject.url, PUBLISH_STATE_PATH)).toString('utf-8'),
  ) as {
    products?: number
    external_jobs?: number
    owned_products?: number
    mechanic_products?: number
    external_category_counts?: Partial<ExternalMechanicCategoryCounts>
    external_high_water?: number
    external_category_high_water?: Partial<ExternalMechanicCategoryCounts>
    inventory_high_water?: Partial<CatalogInventory>
  }
  const inventory: CatalogInventory = {
    products: Math.max(Number(state.products) || 0, Number(state.inventory_high_water?.products) || 0),
    externalProducts: Math.max(
      Number(state.external_jobs) || 0,
      Number(state.external_high_water) || 0,
      Number(state.inventory_high_water?.externalProducts) || 0,
    ),
    ownedProducts: Math.max(Number(state.owned_products) || 0, Number(state.inventory_high_water?.ownedProducts) || 0),
    mechanicProducts: Math.max(
      Number(state.mechanic_products) || 0,
      Number(state.inventory_high_water?.mechanicProducts) || 0,
    ),
  }
  const externalCategories = {
    car_mechanic: Math.max(
      Number(state.external_category_counts?.car_mechanic) || 0,
      Number(state.external_category_high_water?.car_mechanic) || 0,
    ),
    bike_mechanic: Math.max(
      Number(state.external_category_counts?.bike_mechanic) || 0,
      Number(state.external_category_high_water?.bike_mechanic) || 0,
    ),
  }
  return { inventory, externalCategories }
}

// ===== main =====
async function main() {
  const ownedJobs = await fetchAllJobs()
  const externalResult = await fetchAllExternalMechanicJobs()
  assertExternalSourcePublishable(externalResult.sourceFresh, externalResult.oldestLastSeen)
  const externalCategoryCounts = countExternalMechanicCategories(externalResult.jobs)
  await assertExternalInventoryIsSane(
    externalResult.jobs.length,
    externalCategoryCounts,
    STORAGE,
  )
  const combined = appendExternalJobs(ownedJobs, externalResult.jobs)
  const jobs = combined.jobs
  console.log(
    `[catalog-external] fetched=${externalResult.fetched} / eligible=${externalResult.jobs.length}`
    + ` / duplicate=${combined.excludedAsDuplicate} / expired=${externalResult.expired}`
    + ` / invalid=${externalResult.invalid} / fresh=${externalResult.sourceFresh}`,
  )
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
  const uniqueImagePaths = new Set(plans.map((plan) => catalogImagePath(plan.spec)))
  if (uniqueImagePaths.size !== plans.length) {
    throw new Error(`求人別画像パスが重複しています: jobs=${plans.length} unique=${uniqueImagePaths.size}`)
  }
  const imagePlans = new Map(plans.map((plan) => [plan.spec.id, plan]))
  const candidatePlanById = new Map(candidatePlans.map((plan) => [plan.spec.id, plan]))
  const imageGenerationQueue = jobs.flatMap((job) => {
    // 外部求人は求人データから決定論的に生成するため、AI画像の承認キューへ送らない。
    if (job.catalogOrigin === 'hellowork') return []
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
  const generatedImages = STORAGE
    ? await prepareCatalogImages(plans.map((plan) => plan.spec), {
      storage: STORAGE,
      concurrency: 4,
      failOnError: true,
    })
    : new Map<string, string>()
  if (STORAGE) {
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
  if (!STORAGE) {
    console.warn('[catalog-image] Supabase Storage認証情報未設定のため、ローカル実行は生成元URLを使用します')
  }
  if (imageGenerationQueue.length) {
    console.warn(`[catalog-image] 求人別画像の生成・承認待ち=${imageGenerationQueue.length}件`)
  }

  const rows = jobs
    .map((job) => toRow(job, generatedImages, imagePlans))
    .filter((r): r is Record<string, string> => r !== null)
  const expectedExternalRows = jobs.filter((job) => job.catalogOrigin === 'hellowork').length
  const actualExternalRows = rows.filter((row) => row['_catalog_origin'] === 'hellowork').length
  if (actualExternalRows !== expectedExternalRows) {
    throw new Error(
      `外部求人の全件収録ゲートに失敗しました: expected=${expectedExternalRows} actual=${actualExternalRows}`,
    )
  }
  if (rows.some((row) => row['custom_label_4'] === 'other')) {
    throw new Error('配信対象求人に詳細職種 other が含まれています')
  }
  // 遷移先の振り分けを全行検査する（整備士だけ /entry/mechanic?job_id=、他職種は従来の /job/{id}）。
  // 崩れていたら publish しない。遷移先が黙って変わる事故を防ぐカナリア（catalog-link.mts）。
  const misrouted = rows.filter((row) => !isCatalogLinkRoutedCorrectly(
    row['id'],
    row['custom_label_0'],
    row['link'],
    row['_catalog_origin'] === 'hellowork' ? 'hellowork' : 'ridejob',
  ))
  if (misrouted.length) {
    const sample = misrouted[0]
    throw new Error(`遷移先の振り分けが崩れた行が ${misrouted.length} 件あります（例: ${sample['id']} / ${sample['custom_label_0']} / ${sample['link']}）`)
  }
  const linkRouting = {
    entry_mechanic: rows.filter((row) => row['link'].startsWith('https://ridejob.jp/entry/mechanic?')).length,
    job_detail: rows.filter((row) => row['link'].startsWith('https://ridejob.jp/job/')).length,
    external_hellowork_detail: rows.filter((row) => row['link'].startsWith('https://ridejob.jp/external-job/hellowork/')).length,
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
  const ownedProducts = rows.filter((row) => row['_catalog_origin'] === 'ridejob').length
  const mechanicProducts = primaryCategoryCounts['mechanic'] || 0
  await assertCatalogInventoryIsSane({
    products: rows.length,
    externalProducts: actualExternalRows,
    ownedProducts,
    mechanicProducts,
  }, STORAGE)
  const qualityReport = JSON.stringify({
    generated_at: new Date().toISOString(),
    fetched_jobs: jobs.length,
    owned_jobs_fetched: ownedJobs.length,
    external_hellowork: {
      fetched: externalResult.fetched,
      eligible_before_dedupe: externalResult.jobs.length,
      included_after_dedupe: rows.filter((row) => row['_catalog_origin'] === 'hellowork').length,
      excluded_as_owned_or_external_duplicate: combined.excludedAsDuplicate,
      expired: externalResult.expired,
      invalid: externalResult.invalid,
      invalid_reasons: externalResult.invalidReasons,
      invalid_samples: externalResult.invalidSamples,
      with_details: externalResult.details,
      source_fresh: externalResult.sourceFresh,
      newest_last_seen: externalResult.newestLastSeen,
      oldest_last_seen: externalResult.oldestLastSeen,
      stale_behavior: 'publish aborted; previous verified feed retained',
      catalog_id_rule: 'raw source_id from /external-job/hellowork/{source_id}',
    },
    included_products: rows.length,
    excluded_products: excluded,
    image_source_counts: imageSourceCounts,
    unique_image_path_count: uniqueImagePaths.size,
    image_generation_queue_count: imageGenerationQueue.length,
    duplicate_reference_source_count: duplicateReferenceSources.size,
    link_routing: linkRouting,
    classification_counts: {
      primary: primaryCategoryCounts,
      detailed: detailedRoleCounts,
    },
    copy_rules: {
      title_max_length: 42,
      description_min_length: 100,
      description_max_length: 700,
      agency_disclosure_required_for_owned_jobs: true,
      source_disclosure_required_for_hellowork_jobs: true,
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

  if (STORAGE) {
    const fs = await import('node:fs/promises')
    await fs.writeFile('catalog-image-generation-queue.json', imageQueueReport, 'utf-8')
    const previousHighWater = await readPublishHighWater(STORAGE)
    const snapshot = SNAPSHOT_BEFORE_PUBLISH ? await snapshotCurrentCatalog(STORAGE) : undefined
    const feedOptions = {
      upsert: true,
      contentType: 'text/tab-separated-values; charset=utf-8',
      cacheControl: 0,
    }
    try {
      const review = await STORAGE.put('catalog/ridejob-feed-review.tsv', reviewTsv, feedOptions) // Sheets確認用（軽量）
      console.log(`[catalog-feed] published(review): ${review.url}`)
      await assertPublishedObject(review.url, reviewTsv, 'ridejob-feed-review.tsv')
      const jsonOptions = {
        upsert: true,
        contentType: 'application/json; charset=utf-8',
        cacheControl: 0,
      }
      const quality = await STORAGE.put('catalog/ridejob-feed-quality.json', qualityReport, jsonOptions)
      console.log(`[catalog-feed] published(quality): ${quality.url}`)
      await assertPublishedObject(quality.url, qualityReport, 'ridejob-feed-quality.json')
      const queue = await STORAGE.put(
        'catalog/ridejob-image-generation-queue.json',
        imageQueueReport,
        jsonOptions,
      )
      console.log(`[catalog-feed] published(image-queue): ${queue.url}`)
      await assertPublishedObject(queue.url, imageQueueReport, 'ridejob-image-generation-queue.json')
      // Metaが読む一次フィードは最後に切り替える。
      const { url } = await STORAGE.put('catalog/ridejob-feed.tsv', tsv, feedOptions)
      console.log(`[catalog-feed] published: ${url}`)
      await assertPublishedObject(url, tsv, 'ridejob-feed.tsv')
      await pruneOldSnapshotGenerations(STORAGE)
      // 初回公開済み判定は、一次フィードの読戻し成功後にだけ更新する。
      // ハッシュも保存し、途中終了や復元失敗でマーカーと実体がずれた場合は次回をfail closedにする。
      const publishState = JSON.stringify({
        version: 1,
        completed_at: new Date().toISOString(),
        external_jobs: actualExternalRows,
        external_high_water: Math.max(actualExternalRows, previousHighWater?.inventory.externalProducts || 0),
        external_category_counts: externalCategoryCounts,
        external_category_high_water: {
          car_mechanic: Math.max(
            externalCategoryCounts.car_mechanic,
            previousHighWater?.externalCategories.car_mechanic || 0,
          ),
          bike_mechanic: Math.max(
            externalCategoryCounts.bike_mechanic,
            previousHighWater?.externalCategories.bike_mechanic || 0,
          ),
        },
        products: rows.length,
        owned_products: ownedProducts,
        mechanic_products: mechanicProducts,
        inventory_high_water: {
          products: Math.max(rows.length, previousHighWater?.inventory.products || 0),
          externalProducts: Math.max(actualExternalRows, previousHighWater?.inventory.externalProducts || 0),
          ownedProducts: Math.max(ownedProducts, previousHighWater?.inventory.ownedProducts || 0),
          mechanicProducts: Math.max(mechanicProducts, previousHighWater?.inventory.mechanicProducts || 0),
        },
        primary_sha256: sha256(tsv),
        primary_bytes: Buffer.byteLength(tsv),
      }, null, 2)
      const state = await STORAGE.put(PUBLISH_STATE_PATH, publishState, {
        ...jsonOptions,
        contentType: 'application/json; charset=utf-8',
      })
      await assertPublishedObject(state.url, publishState, 'publish-state.json')
    } catch (publishError) {
      if (!snapshot) throw publishError
      console.error('[catalog-feed] 公開検証に失敗したため直前スナップショットへ自動復元します')
      try {
        await restoreCatalogSnapshot(snapshot, STORAGE)
        await refreshMetaAfterAutomaticRestore(STORAGE)
      } catch (restoreError) {
        throw new AggregateError([publishError, restoreError], '公開失敗後の自動復元にも失敗しました')
      }
      throw publishError
    }
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
    console.log('[catalog-feed] Supabase Storage認証情報未設定 → ローカル出力(catalog-feed.tsv / catalog-feed-review.tsv / catalog-feed-quality.json / catalog-image-generation-queue.json)')
  }
}

main().catch((e) => {
  console.error('[catalog-feed] 失敗:', e)
  process.exit(1)
})
