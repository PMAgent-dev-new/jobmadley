/**
 * 外部媒体（ハローワーク）転載求人の取得。Supabase job-db の公開ビュー
 * `external_public_jobs`（RLS: anon は status='active' のみ read）を PostgREST 経由で読む。
 *
 * 取得はすべてサーバーコンポーネントから行うため、キーはブラウザに出ない（NEXT_PUBLIC_ は付けない）。
 * この anon key は「公開キー」（RLS が安全境界）で、microCMS キーや service_role とは性質が異なり、
 * 公開データ（掲載中の求人）への read しか許可されない。env（SUPABASE_URL / SUPABASE_ANON_KEY）優先・
 * フォールバックを置くことで Vercel env 未設定でもデプロイ直後から動作する。env で上書き推奨。
 */
import { unstable_cache } from "next/cache"
import type { ExternalJob } from "./types"

const SUPABASE_URL = process.env.SUPABASE_URL || "https://urvkgyohtqfxmymaivth.supabase.co"
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVydmtneW9odHFmeG15bWFpdnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1OTU1NzUsImV4cCI6MjEwMDE3MTU3NX0.NhE3dVLHaWbYRILQ5PW4p-CmGkr3ELUj_IXX6QIjxvs"

const VIEW = "external_public_jobs"
const REVALIDATE = 3600

/**
 * 画面で使う列だけを取得する。取得元を示す列（source_name / source_url / hw_office）は
 * 表示しない方針のため、そもそも取りに行かない。取得するとレンダリング結果に含まれず
 * ともRSCペイロードへ載り、ページのソースから読めてしまう。
 */
const SELECT_COLUMNS = [
  "source", "source_id", "title", "company_name", "prefecture", "municipality_name", "address",
  "job_category", "employment_type", "salary_kind", "salary_min", "salary_max",
  "salary_raw", "work_hours", "description",
].join(",")

/**
 * 自社ハブの職種 slug → 外部の job_category 名。複数の外部カテゴリを1ハブに合流させる
 * （例: truck-driver には「トラック」と「配送・宅配」を集約）。ここに無い slug は外部求人を出さない。
 * 送迎ドライバー・その他ドライバーは自社に対応ハブが無いため初期スコープ外（将来カテゴリ新設で回収）。
 */
const HUB_SLUG_TO_EXTERNAL_CATEGORIES: Record<string, string[]> = {
  "taxi-driver": ["タクシー運転手"],
  "hire-driver": ["ハイヤー・役員運転手"],
  "bus-driver": ["バス運転手"],
  "truck-driver": ["トラックドライバー"],
  // 整備士系（2026-07-21 取得範囲に追加）
  "car-mechanic": ["自動車整備士"],
  "bike-mechanic": ["バイク整備士"],
  // 送迎・配送（2026-07-21 カテゴリ新設）。配送は truck-driver への合流をやめ独立させた
  // （「配送ドライバー求人」はトラックとは別の検索需要。分割してもトラックは48県すべて掲載基準を維持）。
  "shuttle-driver": ["送迎ドライバー"],
  "delivery-driver": ["配送・宅配ドライバー"],
}

export const hasExternalJobsForCategory = (hubCatSlug?: string): boolean =>
  !!hubCatSlug && hubCatSlug in HUB_SLUG_TO_EXTERNAL_CATEGORIES

/** 外部 job_category 名 → 自社ハブ職種 slug（詳細ページのクロスセル先解決用）。 */
const EXTERNAL_CATEGORY_TO_HUB: Record<string, string> = {
  タクシー運転手: "taxi-driver",
  "ハイヤー・役員運転手": "hire-driver",
  バス運転手: "bus-driver",
  トラックドライバー: "truck-driver",
  "配送・宅配ドライバー": "delivery-driver",
  自動車整備士: "car-mechanic",
  バイク整備士: "bike-mechanic",
  送迎ドライバー: "shuttle-driver",
}
export const hubSlugForExternalCategory = (cat?: string): string | undefined =>
  cat ? EXTERNAL_CATEGORY_TO_HUB[cat] : undefined

// 応募IDの接頭辞ユーティリティは client からも読むため apply-id.ts に分離（キーの混入防止）。
export { externalApplyId, parseExternalApplyId, isExternalJobId } from "./apply-id"

/** PostgREST の行（snake_case）→ ExternalJob（camelCase）。 */
function mapRow(r: Record<string, unknown>): ExternalJob {
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? undefined : Number(v))
  const str = (v: unknown) => (typeof v === "string" ? v : undefined)
  return {
    source: String(r.source ?? ""),
    sourceId: String(r.source_id ?? ""),
    sourceName: String(r.source_name ?? ""),
    sourceUrl: str(r.source_url),
    hwOffice: str(r.hw_office),
    title: str(r.title),
    companyName: str(r.company_name),
    prefecture: str(r.prefecture),
    municipalityName: str(r.municipality_name),
    address: str(r.address),
    jobCategory: str(r.job_category),
    employmentType: str(r.employment_type),
    salaryKind: str(r.salary_kind),
    salaryMin: num(r.salary_min),
    salaryMax: num(r.salary_max),
    salaryRaw: str(r.salary_raw),
    workHours: str(r.work_hours),
    description: str(r.description),
    receivedAt: str(r.received_at),
    expiresAt: str(r.expires_at),
    lastSeen: str(r.last_seen),
  }
}

async function rawQuery(
  params: Record<string, string>,
  wantCount = false,
): Promise<{ rows: Record<string, unknown>[]; count: number }> {
  const qs = new URLSearchParams(params).toString()
  const url = `${SUPABASE_URL}/rest/v1/${VIEW}?${qs}`
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }
  if (wantCount) headers.Prefer = "count=exact"
  try {
    const res = await fetch(url, { headers, next: { revalidate: REVALIDATE } })
    if (!res.ok) return { rows: [], count: 0 }
    const data = (await res.json()) as Record<string, unknown>[]
    let count = data.length
    if (wantCount) {
      // Content-Range: "0-19/1077"
      const cr = res.headers.get("content-range")
      const total = cr?.split("/")?.[1]
      if (total && total !== "*") count = Number(total)
    }
    return { rows: data, count }
  } catch {
    // 障害時は外部求人セクションを出さない（自社ページは無傷）。
    return { rows: [], count: 0 }
  }
}

async function query(
  params: Record<string, string>,
  wantCount = false,
): Promise<{ rows: ExternalJob[]; count: number }> {
  const { rows, count } = await rawQuery(params, wantCount)
  return { rows: rows.map(mapRow), count }
}

/** ハブ（県×職種）向けの外部求人と総件数。県は prefectures.region（例「東京都」）＝外部 prefecture と一致。 */
export const getExternalJobsForHub = async (params: {
  prefectureRegion: string
  hubCatSlug: string
  limit?: number
}): Promise<{ jobs: ExternalJob[]; count: number }> => {
  const cats = HUB_SLUG_TO_EXTERNAL_CATEGORIES[params.hubCatSlug]
  if (!cats || !params.prefectureRegion) return { jobs: [], count: 0 }
  const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
  const { rows, count } = await query(
    {
      select: SELECT_COLUMNS,
      prefecture: `eq.${params.prefectureRegion}`,
      job_category: `in.${inList}`,
      order: "last_seen.desc",
      limit: String(params.limit ?? 24),
    },
    true,
  )
  return { jobs: rows, count }
}

/** 市区町村×職種ハブ向け。県＋市区町村名で絞る（HACK1: 整備士バーティカルの粒度）。 */
export const getExternalJobsForMuniHub = async (params: {
  prefectureRegion: string
  municipalityName: string
  hubCatSlug: string
  limit?: number
}): Promise<{ jobs: ExternalJob[]; count: number }> => {
  const cats = HUB_SLUG_TO_EXTERNAL_CATEGORIES[params.hubCatSlug]
  if (!cats || !params.prefectureRegion || !params.municipalityName) return { jobs: [], count: 0 }
  const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
  const { rows, count } = await query(
    {
      select: SELECT_COLUMNS,
      prefecture: `eq.${params.prefectureRegion}`,
      municipality_name: `eq.${params.municipalityName}`,
      job_category: `in.${inList}`,
      order: "received_date.desc.nullslast",
      limit: String(params.limit ?? 24),
    },
    true,
  )
  return { jobs: rows, count }
}

/** 職種のみハブ（全国）向け。 */
export const getExternalJobsForCategory = async (params: {
  hubCatSlug: string
  limit?: number
}): Promise<{ jobs: ExternalJob[]; count: number }> => {
  const cats = HUB_SLUG_TO_EXTERNAL_CATEGORIES[params.hubCatSlug]
  if (!cats) return { jobs: [], count: 0 }
  const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
  const { rows, count } = await query(
    {
      select: SELECT_COLUMNS,
      job_category: `in.${inList}`,
      order: "last_seen.desc",
      limit: String(params.limit ?? 24),
    },
    true,
  )
  return { jobs: rows, count }
}

/**
 * 外部求人だけでハブを「生成対象」に昇格させる最小件数。
 * 自社求人の HUB_MIN_JOBS(=5) と役割は同じだが、外部は在庫が桁違いに厚いので
 * 薄いページを増やさないよう高めに置く（20件＝107ハブ／対象在庫の97%をカバー）。
 */
export const HUB_MIN_EXTERNAL_JOBS = 20

/** 件数マトリクスのキー。prefecture は prefectures.region（例「東京都」）。 */
export const externalHubKey = (prefectureRegion: string, hubCatSlug: string): string =>
  `${prefectureRegion}|${hubCatSlug}`

export type ExternalHubCounts = Record<string, number>

const COUNT_PAGE = 1000
/** 暴走防止の上限（現状の対象在庫は約1.8万件）。 */
const COUNT_MAX_PAGES = 40

/**
 * 県×職種ごとの外部求人件数マトリクス。sitemap 掲載判定と関連リンクの出し分けに使う。
 *
 * この Supabase では PostgREST の集約関数（count()）が無効（PGRST123）なため、
 * 対象職種の (prefecture, job_category) だけを射影して全件取得し、アプリ側で数える。
 * 1行あたり数十バイト・約1.8万行で、各ページ取得は fetch キャッシュに載る。
 * 失敗時は空を返す＝外部求人ゼロ扱いとなり、自社求人だけの従来挙動に戻る（加算的設計）。
 */
export const getExternalHubCounts = unstable_cache(
  async (): Promise<ExternalHubCounts> => {
    const cats = Object.keys(EXTERNAL_CATEGORY_TO_HUB)
    const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
    const page = (offset: number, wantCount = false) =>
      rawQuery(
        {
          select: "prefecture,job_category",
          job_category: `in.${inList}`,
          order: "source_id.asc",
          limit: String(COUNT_PAGE),
          offset: String(offset),
        },
        wantCount,
      )

    const first = await page(0, true)
    if (first.rows.length === 0) return {}
    const pages = Math.min(Math.ceil(first.count / COUNT_PAGE), COUNT_MAX_PAGES)
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => page((i + 1) * COUNT_PAGE)),
    )

    const counts: ExternalHubCounts = {}
    for (const row of [first, ...rest].flatMap((p) => p.rows)) {
      const slug = EXTERNAL_CATEGORY_TO_HUB[String(row.job_category ?? "")]
      const region = String(row.prefecture ?? "")
      if (!slug || !region) continue
      const key = externalHubKey(region, slug)
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  },
  ["external-hub-counts"],
  { revalidate: REVALIDATE },
)

/** そのハブが「外部求人だけで生成対象になる」か。 */
export const qualifiesByExternalJobs = (
  counts: ExternalHubCounts,
  prefectureRegion: string,
  hubCatSlug: string,
): boolean => (counts[externalHubKey(prefectureRegion, hubCatSlug)] ?? 0) >= HUB_MIN_EXTERNAL_JOBS

// --- 市区町村×職種ハブ（HACK1: 整備士バーティカル。競合の粒度に対抗）-----------------
/** 市区町村ハブの最小件数。薄いページ量産を避けるため県ハブと同じ20を採用。 */
export const HUB_MIN_MUNI_JOBS = 20

/** 市区町村ハブのキー。prefecture=region（例「岡山県」）, municipality=市区町村名（例「倉敷市」）。 */
export const externalMuniHubKey = (
  prefectureRegion: string,
  municipalityName: string,
  hubCatSlug: string,
): string => `${prefectureRegion}|${municipalityName}|${hubCatSlug}`

/**
 * 市区町村×職種の件数マトリクス。generateStaticParams・sitemap・生成判定に使う。
 * (prefecture, municipality_name, job_category) を射影して全件取得しアプリ側で集計。
 */
export const getExternalMuniHubCounts = unstable_cache(
  async (): Promise<ExternalHubCounts> => {
    const cats = Object.keys(EXTERNAL_CATEGORY_TO_HUB)
    const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
    const page = (offset: number, wantCount = false) =>
      rawQuery(
        {
          select: "prefecture,municipality_name,job_category",
          job_category: `in.${inList}`,
          municipality_name: "not.is.null",
          order: "source_id.asc",
          limit: String(COUNT_PAGE),
          offset: String(offset),
        },
        wantCount,
      )
    const first = await page(0, true)
    if (first.rows.length === 0) return {}
    const pages = Math.min(Math.ceil(first.count / COUNT_PAGE), COUNT_MAX_PAGES)
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => page((i + 1) * COUNT_PAGE)),
    )
    const counts: ExternalHubCounts = {}
    for (const row of [first, ...rest].flatMap((p) => p.rows)) {
      const slug = EXTERNAL_CATEGORY_TO_HUB[String(row.job_category ?? "")]
      const region = String(row.prefecture ?? "")
      const muni = String(row.municipality_name ?? "")
      if (!slug || !region || !muni) continue
      const key = externalMuniHubKey(region, muni, slug)
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  },
  ["external-muni-hub-counts"],
  { revalidate: REVALIDATE },
)

/** 外部求人1件（詳細ページ用）。存在しなければ null。 */
export const getExternalJob = async (
  source: string,
  sourceId: string,
): Promise<ExternalJob | null> => {
  const { rows } = await query({
    select: SELECT_COLUMNS,
    source: `eq.${source}`,
    source_id: `eq.${sourceId}`,
    limit: "1",
  })
  return rows[0] ?? null
}
