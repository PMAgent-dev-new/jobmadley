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
 *   - price は名目 100 JPY（価格オーバーレイOFF前提。給与は description と custom_label_3 に格納）。
 *   - 緯度経度(availability_circle) / neighborhoods は Meta 標準カタログで不要のため出力しない。
 */
import { createClient } from 'microcms-js-sdk'
import { put } from '@vercel/blob'

const SERVICE_DOMAIN = process.env.NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN
const API_KEY = process.env.MICROCMS_API_KEY
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN

if (!SERVICE_DOMAIN || !API_KEY) {
  throw new Error('NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN と MICROCMS_API_KEY が必要です')
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

// ===== サニタイズ（旧 GAS/node 版と同一ルール） =====
const BENEFIT_CTX =
  /手当|支給|扶養|児童|お子|子ども|こども|子供|定年|再雇用|経験|勤続|運転(歴|経験)|免許|普通車|大型|二種|入社\d|歴\d|実務\d|キャリア\d|年以上の(経験|実務|キャリア|勤務)/

type Rule = { re: RegExp; action: 'drop' | 'replace'; unless?: RegExp }
const RULES: Rule[] = [
  { re: /(男性|女性|男子|女子)\s*(のみ|限定|歓迎|募集)|男女問わず|性別不問/g, action: 'drop' },
  { re: /[0-9０-９]{1,3}\s*歳\s*(以上|以下|未満|まで)(の方|の人|歓迎|対象|応募|採用|限定)?/g, action: 'drop', unless: BENEFIT_CTX },
  { re: /[〜~ー－\-–—]\s*[0-9０-９]{1,3}\s*歳/g, action: 'drop', unless: BENEFIT_CTX },
  { re: /(年齢|応募資格)[:：]?[^。\n]{0,10}?[0-9０-９]{1,3}\s*歳/g, action: 'drop', unless: BENEFIT_CTX },
  { re: /(若手|シニア|ミドル)\s*(のみ|限定|歓迎)/g, action: 'drop' },
  { re: /(日本人|外国人|帰化)\s*(のみ|限定)/g, action: 'drop' },
  { re: /(既婚|未婚|独身)\s*(のみ|限定|歓迎)/g, action: 'drop' },
  { re: /(絶対|必ず|確実に儲か|No\.?1|日本一|業界一|最高峰|誰でも稼げる|高収入確約|青天井|天井なし)/gi, action: 'replace' },
]

function sanitize(text: string): { clean: string; flags: string[] } {
  const flags: string[] = []
  let sentences = String(text || '').split(/(?<=[。\n！？])|(?=・)/)
  sentences = sentences.filter((s) => {
    for (const r of RULES) {
      if (r.action !== 'drop') continue
      r.re.lastIndex = 0
      if (r.re.test(s)) {
        r.re.lastIndex = 0
        if (r.unless && r.unless.test(s)) continue
        flags.push('[DROP] ' + s.trim().slice(0, 40))
        return false
      }
    }
    return true
  })
  let out = sentences.join('')
  for (const rr of RULES) {
    if (rr.action === 'replace') out = out.replace(rr.re, (m) => { flags.push('[REPL] ' + m); return '' })
  }
  // 空白は畳むが改行は保持する（説明文の段落構造を残すため）
  const clean = out
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { clean, flags }
}

function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n・')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x?[0-9a-f]+;/gi, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE00}-\u{FE0F}\u{200D}\u{2122}\u{2139}\u{E000}-\u{F8FF}]/gu, '')
    .replace(/[■□◆◇★☆▼▲▽△●◎※→⇒⇨➡←↑↓✓✔✕✖❌⭕]+/g, '')
    .replace(/[・･‣◦]{2,}/g, '・') // 連打（装飾）のみ単一化。単独の・は箇条書き/並記として保持
    .replace(/[!！]{2,}/g, '！').replace(/[?？]{2,}/g, '？')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200F\uFEFF]/g, '')
    .replace(/[＆&]/g, 'と').replace(/[<>＜＞]/g, '')
    .replace(/https?:\/\/[^\s　、。)）」』]+/g, '')
    .replace(/(?:[A-Za-z0-9\-]+\.)+(?:co\.jp|jp|com|net|org)(?:\/[^\s　、。]*)?/g, '')
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '')
    .replace(/(?:☎|TEL|Tel|tel|電話番号?|お問[合い]わせ先?)\s*[:：]?\s*/g, '')
    .replace(/0120[-－\s]?\d{2,3}[-－\s]?\d{3,4}/g, '')
    .replace(/0\d{1,4}[-－(（\s]?\d{1,4}[-－)）\s]?\d{3,4}/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const hasResidualPictograph = (s: string): boolean => /\p{Extended_Pictographic}/u.test(s || '')

// ===== 職種分類（product_tags[0] / custom_label_0。旧版と同一値: taxi/hire/dispatch/mechanic/other） =====
function classify(title: string, desc: string): string {
  const t = String(title || '')
  if (/タクシー\s*(ドライバー|乗務員|運転手)|乗務員/.test(t)) return 'taxi'
  if (/ハイヤー/.test(t)) return 'hire'
  if (/運行管理|配車(係|オペレーター|担当)/.test(t)) return 'dispatch'
  if (/整備士|メカニック|整備|板金|フロントスタッフ|サービス(エンジニア|スタッフ)/.test(t)) return 'mechanic'
  if (/タクシー\s*(ドライバー|乗務員|運転手)/.test(String(desc || ''))) return 'taxi'
  return 'other'
}

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
  const summary = [salaryLabel(job), job.employmentType?.[0] ?? '', `${region}${locality}`.trim()]
    .filter(Boolean)
    .join('｜')
  const sections: Array<[string, string | undefined]> = [
    ['', job.descriptionWork], // 先頭は見出し無し（「仕事内容」ラベルは冗長のため出さない）
    ['アピールポイント', job.descriptionAppeal],
    ['求める人物像', job.descriptionPerson],
    ['給与', job.salaryNote],
    ['待遇・福利厚生', job.descriptionBenefits],
    ['勤務時間', job.workHours],
    ['休日・休暇', job.holidays],
    ['アクセス', job.access],
    ['その他', job.descriptionOther],
  ]
  const parts: string[] = []
  if (summary) parts.push(summary)
  for (const [label, body] of sections) {
    if (!body || !body.trim()) continue
    const text = htmlToText(body)
    if (!text) continue
    parts.push(label ? `【${label}】\n${text}` : text)
  }
  if (parts.length === (summary ? 1 : 0)) {
    const fallback = htmlToText(job.descriptionWork ?? job.descriptionAppeal ?? job.title ?? '')
    if (fallback) parts.push(fallback)
  }
  return parts.join('\n\n')
}

// ===== 画像（og:image 相当。1:1 白余白変換） =====
function imageLink(job: Job): string {
  const u = job.images?.[0]?.url || job.imageUrl || ''
  if (!u || /\/OGP\.png|default|placeholder/i.test(u)) return ''
  return u.split('?')[0] + '?fm=jpg&w=1080&h=1080&fit=fill&fill=solid&fill-color=FFFFFF&q=80'
}

// ===== フィード列 =====
const HEADERS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand',
  'address.city', 'address.country', 'address.postal_code', 'address.region', 'address.street_address',
  'product_tags[0]', 'product_tags[1]',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3',
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
function toRow(job: Job): Record<string, string> | null {
  const titleRaw = job.jobName ?? job.title ?? ''
  const cat = classify(titleRaw, job.descriptionWork ?? '')
  if (cat === 'other') return null // ドライバー系以外は広告対象外

  const img = imageLink(job)
  if (!img) return null // 画像なしは配信不可

  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const region = job.prefecture?.region ?? parsed.region ?? ''
  const locality = job.municipality?.name ?? parsed.locality ?? ''

  const descSrc = buildDescriptionText(job, region, locality)
  const desc = sanitize(descSrc)
  const removalRate = 1 - desc.clean.length / Math.max(1, descSrc.length)
  const dropCount = desc.flags.filter((f) => f.startsWith('[DROP]')).length
  if (removalRate > 0.35 || desc.clean.length < 120 || dropCount >= 3 || hasResidualPictograph(desc.clean)) return null

  const titleS = sanitize(`${titleRaw}${locality ? `（${locality}）` : ''}`)

  return {
    id: job.id,
    title: clip(titleS.clean, 65),
    description: clip(desc.clean, 9999),
    availability: 'in stock',
    condition: 'new',
    price: '100 JPY', // 名目（価格オーバーレイOFF前提。給与は description / custom_label_3 に格納）
    link: `https://ridejob.jp/job/${job.id}?utm_content=${job.id}&utm_source=meta&utm_medium=catalog`,
    image_link: img,
    brand: clip(job.companyName || 'RIDEJOB', 100),
    'address.city': locality,
    'address.country': 'Japan',
    'address.postal_code': formatPostal(job.addressZip),
    'address.region': region,
    'address.street_address': buildStreetAddress(job, region, locality),
    'product_tags[0]': cat,
    'product_tags[1]': region,
    'custom_label_0': cat, // 職種（商品セット第一軸）
    'custom_label_1': job.employmentType?.[0] ?? '', // 雇用形態
    'custom_label_2': region, // 都道府県
    'custom_label_3': salaryBand(job), // 給与帯
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
  'id', '職種', '雇用形態', '県', '給与帯', 'タイトル', '会社', '市区町村', '在庫', '画像URL', 'リンク', '説明(先頭120字)',
] as const

function toReviewTSV(rows: Record<string, string>[]): string {
  const esc = (v: string) => String(v ?? '').replace(/[\t\r\n]+/g, ' ')
  const lines = [REVIEW_HEADERS.join('\t')]
  for (const r of rows) {
    lines.push([
      r['id'],
      r['custom_label_0'],
      r['custom_label_1'],
      r['custom_label_2'],
      r['custom_label_3'],
      r['title'],
      r['brand'],
      r['address.city'],
      r['availability'],
      r['image_link'],
      r['link'],
      clip(r['description'], 120),
    ].map(esc).join('\t'))
  }
  return lines.join('\n')
}

// ===== main =====
async function main() {
  const jobs = await fetchAllJobs()
  const rows = jobs.map(toRow).filter((r): r is Record<string, string> => r !== null)
  const tsv = toTSV(rows)
  const reviewTsv = toReviewTSV(rows)
  const excluded = jobs.length - rows.length
  console.log(`[catalog-feed] 取得=${jobs.length}件 / 収録=${rows.length}件 / 除外=${excluded}件`)

  if (BLOB_TOKEN) {
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
  } else {
    const fs = await import('node:fs/promises')
    await fs.writeFile('catalog-feed.tsv', tsv, 'utf-8')
    await fs.writeFile('catalog-feed-review.tsv', reviewTsv, 'utf-8')
    console.log('[catalog-feed] BLOB_READ_WRITE_TOKEN 未設定 → ローカル出力(catalog-feed.tsv / catalog-feed-review.tsv)')
  }
}

main().catch((e) => {
  console.error('[catalog-feed] 失敗:', e)
  process.exit(1)
})
