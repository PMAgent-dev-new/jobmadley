import {
  isWithheldCompanyName,
  redactExternalJobText,
  withheldExternalJobDescription,
  withheldExternalJobTitle,
} from '../../src/features/external-jobs/redact.ts'

const PAGE_SIZE = 1_000
const DETAIL_CHUNK_SIZE = 100
const MAX_SYNC_TIMESTAMP_SPREAD_MS = 5 * 60 * 1_000
// 全国同期は日次、カタログは既存の6時間間隔を維持する。全4回が直近の正常な
// 全国同期を使える30時間を上限とし、1回を超えて同期が止まったら公開を中止する。
const DEFAULT_MAX_SOURCE_AGE_HOURS = 30
const DEFAULT_SUPABASE_URL = 'https://urvkgyohtqfxmymaivth.supabase.co'
// Supabase anon key は公開キー。RLS が active 求人の読み取りだけを許可する安全境界。
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVydmtneW9odHFmeG15bWFpdnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1OTU1NzUsImV4cCI6MjEwMDE3MTU3NX0.NhE3dVLHaWbYRILQ5PW4p-CmGkr3ELUj_IXX6QIjxvs'
const ALLOWED_SALARY_KINDS = new Set(['時給', '日給', '週給', '月給', '年収', '年俸'])

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const

function inferPrefecture(...values: Array<string | undefined>): string {
  const blob = values.filter(Boolean).join(' ')
  return PREFECTURES.find((prefecture) => blob.includes(prefecture)) || ''
}

export type ExternalJobDetail = {
  titleFull?: string
  workContent?: string
  employmentForm?: string
  experience?: string
  licenseRequired?: string
  workHoursDetail?: string
  annualHolidays?: string
  holidays?: string
  bonus?: string
  insurance?: string
  training?: string
}

export type ExternalCatalogJob = {
  source: 'hellowork'
  sourceId: string
  sourceName: string
  title: string
  companyName?: string
  prefecture: string
  municipality?: string
  address?: string
  jobCategory: '自動車整備士' | 'バイク整備士'
  employmentType: string
  salaryKind: string
  salaryMin?: number
  salaryMax?: number
  salaryRaw?: string
  workHours?: string
  description: string
  expiresAt: string
  lastSeen: string
  detail?: ExternalJobDetail
}

type RawRow = Record<string, unknown>

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const number = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function tokyoDateParts(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  return { year: get('year'), month: get('month'), day: get('day') }
}

function dateKey(parts: { year: number; month: number; day: number }): number {
  return parts.year * 10_000 + parts.month * 100 + parts.day
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const value = new Date(Date.UTC(year, month - 1, day))
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day
}

/** 「9月30日」の年を last_seen を基準に補い、JSTで期限切れか判定する。 */
export function isHelloworkExpired(expiresAt: string, lastSeen: string, now = new Date()): boolean {
  const matched = text(expiresAt).match(/^(\d{1,2})月(\d{1,2})日$/)
  const seen = new Date(lastSeen)
  if (!matched || Number.isNaN(seen.getTime())) return true
  const seenParts = tokyoDateParts(seen)
  const month = Number(matched[1])
  const day = Number(matched[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return true
  let year = seenParts.year
  // 年末に取得した1〜5月期限は翌年、年初に残った8〜12月期限は前年として扱う。
  if (month <= 5 && seenParts.month >= 10) year += 1
  if (month >= 8 && seenParts.month <= 3) year -= 1
  if (!isValidCalendarDate(year, month, day)) return true
  return dateKey({ year, month, day }) < dateKey(tokyoDateParts(now))
}

export function sourceAgeHours(lastSeen: string, now = new Date()): number {
  const seen = new Date(lastSeen)
  if (Number.isNaN(seen.getTime())) return Number.POSITIVE_INFINITY
  // 5分を超える未来時刻は同期系の時計・データ異常として扱う。
  if (seen.getTime() - now.getTime() > 5 * 60 * 1_000) return Number.POSITIVE_INFINITY
  return Math.max(0, (now.getTime() - seen.getTime()) / 3_600_000)
}

export function isExternalSourceFresh(
  jobs: ExternalCatalogJob[],
  now = new Date(),
  maxAgeHours = DEFAULT_MAX_SOURCE_AGE_HOURS,
): boolean {
  if (!jobs.length) return false
  const timestamps = jobs.map((job) => new Date(job.lastSeen).getTime()).filter(Number.isFinite)
  if (timestamps.length !== jobs.length) return false
  // 一部だけ同期された状態を「新鮮」と誤判定しないよう、全対象のうち最古をゲートに使う。
  const oldest = Math.min(...timestamps)
  const newest = Math.max(...timestamps)
  // 正常な全国同期では全 active 行を同じバッチ時刻で確定する。新旧時刻が混在する場合は、
  // どちらも30時間以内でも部分同期とみなして公開しない。
  if (newest - oldest > MAX_SYNC_TIMESTAMP_SPREAD_MS) return false
  return sourceAgeHours(new Date(oldest).toISOString(), now) <= maxAgeHours
}

/**
 * カタログ公開は全国同期が完了した新鮮な集合だけを受け付ける。
 * 古い／部分同期の集合を公開すると、取得できなかった求人まで掲載終了として
 * フィードから落ちるため、失敗終了して直前の正常フィードを維持する。
 */
export function assertExternalSourcePublishable(
  sourceFresh: boolean,
  oldestLastSeen: string,
): void {
  if (!sourceFresh) {
    throw new Error(
      `ハローワーク全国同期が未完了または古いため公開を中止します: oldest=${oldestLastSeen || 'unknown'}`,
    )
  }
}

function supabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
  return { url: url.replace(/\/$/, ''), anonKey }
}

async function queryRows(
  view: string,
  params: Record<string, string>,
  options: { wantCount?: boolean } = {},
): Promise<{ rows: RawRow[]; count: number }> {
  const { url, anonKey } = supabaseConfig()
  const endpoint = `${url}/rest/v1/${view}?${new URLSearchParams(params)}`
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }
  if (options.wantCount) headers.Prefer = 'count=exact'
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(45_000) })
      if (!response.ok) {
        const error = new Error(`${view} の取得に失敗しました: HTTP ${response.status}`)
        if (response.status < 500 && response.status !== 429) throw error
        lastError = error
      } else {
        const rows = await response.json() as RawRow[]
        const total = response.headers.get('content-range')?.split('/')[1]
        if (options.wantCount && (!total || total === '*' || !Number.isSafeInteger(Number(total)))) {
          throw new Error(`${view} の全件数を確認できません（Content-Range欠落）`)
        }
        return { rows, count: total && total !== '*' ? Number(total) : rows.length }
      }
    } catch (error) {
      lastError = error
      if (error instanceof Error && /HTTP 4\d\d/.test(error.message) && !/HTTP 429/.test(error.message)) {
        throw error
      }
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750))
  }
  throw new Error(`${view} の取得に3回失敗しました`, { cause: lastError })
}

async function fetchBaseRows(): Promise<RawRow[]> {
  const select = [
    'source', 'source_id', 'source_name', 'title', 'company_name', 'prefecture',
    'municipality_name', 'address', 'job_category', 'employment_type', 'salary_kind',
    'salary_min', 'salary_max', 'salary_raw', 'work_hours', 'description', 'expires_at', 'last_seen',
  ].join(',')
  const common = {
    select,
    source: 'eq.hellowork',
    job_category: 'in.("自動車整備士","バイク整備士")',
    order: 'source_id.asc',
    limit: String(PAGE_SIZE),
  }
  const first = await queryRows('external_public_jobs', { ...common, offset: '0' }, { wantCount: true })
  const rows = [...first.rows]
  for (let offset = PAGE_SIZE; offset < first.count; offset += PAGE_SIZE) {
    const page = await queryRows('external_public_jobs', { ...common, offset: String(offset) })
    rows.push(...page.rows)
  }
  if (rows.length !== first.count) {
    throw new Error(`外部整備士求人の取得件数が不一致です: expected=${first.count} actual=${rows.length}`)
  }
  return rows
}

async function fetchDetailRows(sourceIds: string[]): Promise<Map<string, ExternalJobDetail>> {
  const details = new Map<string, ExternalJobDetail>()
  const chunks = Array.from(
    { length: Math.ceil(sourceIds.length / DETAIL_CHUNK_SIZE) },
    (_, index) => sourceIds.slice(index * DETAIL_CHUNK_SIZE, (index + 1) * DETAIL_CHUNK_SIZE),
  )
  const select = [
    'source_id', 'title_full', 'work_content', 'employment_form', 'experience',
    'license_required', 'work_hours_detail', 'annual_holidays', 'holidays',
    'bonus', 'insurance', 'training',
  ].join(',')

  let next = 0
  const worker = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= chunks.length) return
      const ids = chunks[index]
      const inList = `(${ids.map((id) => `"${id}"`).join(',')})`
      const result = await queryRows('external_public_job_details', {
        select,
        source: 'eq.hellowork',
        source_id: `in.${inList}`,
        order: 'source_id.asc',
        limit: String(DETAIL_CHUNK_SIZE),
      })
      for (const row of result.rows) {
        const sourceId = text(row.source_id)
        if (!sourceId) continue
        details.set(sourceId, {
          titleFull: text(row.title_full) || undefined,
          workContent: text(row.work_content) || undefined,
          employmentForm: text(row.employment_form) || undefined,
          experience: text(row.experience) || undefined,
          licenseRequired: text(row.license_required) || undefined,
          workHoursDetail: text(row.work_hours_detail) || undefined,
          annualHolidays: text(row.annual_holidays) || undefined,
          holidays: text(row.holidays) || undefined,
          bonus: text(row.bonus) || undefined,
          insurance: text(row.insurance) || undefined,
          training: text(row.training) || undefined,
        })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, chunks.length) }, () => worker()))
  return details
}

export async function fetchAllExternalMechanicJobs(now = new Date()): Promise<{
  jobs: ExternalCatalogJob[]
  fetched: number
  expired: number
  invalid: number
  invalidReasons: Record<string, number>
  invalidSamples: Array<{ sourceId: string; reasons: string[] }>
  details: number
  sourceFresh: boolean
  newestLastSeen?: string
  oldestLastSeen?: string
}> {
  const rows = await fetchBaseRows()
  const sourceIds = rows.map((row) => text(row.source_id)).filter(Boolean)
  const detailById = await fetchDetailRows(sourceIds)
  let expired = 0
  let invalid = 0
  const invalidReasons: Record<string, number> = {}
  const invalidSamples: Array<{ sourceId: string; reasons: string[] }> = []
  const jobs: ExternalCatalogJob[] = []

  for (const row of rows) {
    const sourceId = text(row.source_id)
    const category = text(row.job_category)
    const lastSeen = text(row.last_seen)
    const expiresAt = text(row.expires_at)
    const detail = detailById.get(sourceId)
    const companyName = text(row.company_name) || undefined
    const companyWithheld = isWithheldCompanyName(companyName)
    const title = companyWithheld
      ? withheldExternalJobTitle(category)
      : redactExternalJobText(
          detail?.titleFull || text(row.title),
          companyName,
          { corpFallback: true },
        ) || ''
    const description = companyWithheld
      ? withheldExternalJobDescription({
          category,
          prefecture: text(row.prefecture),
          municipality: text(row.municipality_name),
          employmentType: text(row.employment_type),
        })
      : redactExternalJobText(
          detail?.workContent || text(row.description),
          companyName,
        ) || ''
    const prefecture = text(row.prefecture) || inferPrefecture(
      text(row.address),
      title,
      description,
      detail?.workContent,
    )
    const hasSalary = Boolean(text(row.salary_raw) || number(row.salary_min) || number(row.salary_max))
    const reasons: string[] = []
    if (!/^\d{5}-\d{8}$/.test(sourceId)) reasons.push('invalid_source_id')
    // 社名は公開しないが、本文から確実に伏せるための照合元として必須。
    // 取得失敗時は匿名化を推測せず、この求人だけ公開対象外にする。
    if (!companyName) reasons.push('missing_company')
    if (!title) reasons.push('missing_title')
    if (!prefecture) reasons.push('missing_prefecture')
    if (!text(row.municipality_name)) reasons.push('missing_municipality')
    if (!text(row.employment_type)) reasons.push('missing_employment_type')
    if (!text(row.salary_kind)) reasons.push('missing_salary_kind')
    else if (!ALLOWED_SALARY_KINDS.has(text(row.salary_kind))) reasons.push('invalid_salary_kind')
    if (!description) reasons.push('missing_description')
    if (!expiresAt) reasons.push('missing_expires_at')
    if (!lastSeen) reasons.push('missing_last_seen')
    if (!hasSalary) reasons.push('missing_salary')
    if (category !== '自動車整備士' && category !== 'バイク整備士') reasons.push('invalid_category')
    if (reasons.length) {
      invalid += 1
      for (const reason of reasons) invalidReasons[reason] = (invalidReasons[reason] || 0) + 1
      if (invalidSamples.length < 20) invalidSamples.push({ sourceId, reasons })
      continue
    }
    if (isHelloworkExpired(expiresAt, lastSeen, now)) {
      expired += 1
      continue
    }
    jobs.push({
      source: 'hellowork',
      sourceId,
      sourceName: text(row.source_name) || 'ハローワークインターネットサービス',
      title,
      companyName,
      prefecture,
      municipality: text(row.municipality_name) || undefined,
      address: text(row.address) || undefined,
      jobCategory: category,
      employmentType: text(row.employment_type),
      salaryKind: text(row.salary_kind),
      salaryMin: number(row.salary_min),
      salaryMax: number(row.salary_max),
      salaryRaw: text(row.salary_raw) || undefined,
      workHours: text(row.work_hours) || undefined,
      description,
      expiresAt,
      lastSeen,
      // 事業所名非公開の求人は詳細本文から実名を照合できないため、安全な概要だけを使う。
      detail: !companyWithheld && detail ? {
        titleFull: redactExternalJobText(detail.titleFull, companyName, { corpFallback: true }),
        workContent: redactExternalJobText(detail.workContent, companyName),
        employmentForm: redactExternalJobText(detail.employmentForm, companyName),
        experience: redactExternalJobText(detail.experience, companyName),
        licenseRequired: redactExternalJobText(detail.licenseRequired, companyName),
        workHoursDetail: redactExternalJobText(detail.workHoursDetail, companyName),
        annualHolidays: redactExternalJobText(detail.annualHolidays, companyName),
        holidays: redactExternalJobText(detail.holidays, companyName),
        bonus: redactExternalJobText(detail.bonus, companyName),
        insurance: redactExternalJobText(detail.insurance, companyName),
        training: redactExternalJobText(detail.training, companyName),
      } : undefined,
    })
  }

  const newest = jobs
    .map((job) => job.lastSeen)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  const oldest = jobs
    .map((job) => job.lastSeen)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  return {
    jobs,
    fetched: rows.length,
    expired,
    invalid,
    invalidReasons,
    invalidSamples,
    details: jobs.filter((job) => job.detail).length,
    sourceFresh: isExternalSourceFresh(jobs, now),
    newestLastSeen: newest,
    oldestLastSeen: oldest,
  }
}
