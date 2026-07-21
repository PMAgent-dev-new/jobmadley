/**
 * 外部媒体（ハローワーク）転載求人の取得。Supabase job-db の公開ビュー
 * `external_public_jobs`（RLS: anon は status='active' のみ read）を PostgREST 経由で読む。
 *
 * 取得はすべてサーバーコンポーネントから行うため、キーはブラウザに出ない（NEXT_PUBLIC_ は付けない）。
 * この anon key は「公開キー」（RLS が安全境界）で、microCMS キーや service_role とは性質が異なり、
 * 公開データ（掲載中の求人）への read しか許可されない。env（SUPABASE_URL / SUPABASE_ANON_KEY）優先・
 * フォールバックを置くことで Vercel env 未設定でもデプロイ直後から動作する。env で上書き推奨。
 */
import type { ExternalJob } from "./types"

const SUPABASE_URL = process.env.SUPABASE_URL || "https://urvkgyohtqfxmymaivth.supabase.co"
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVydmtneW9odHFmeG15bWFpdnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1OTU1NzUsImV4cCI6MjEwMDE3MTU3NX0.NhE3dVLHaWbYRILQ5PW4p-CmGkr3ELUj_IXX6QIjxvs"

const VIEW = "external_public_jobs"
const REVALIDATE = 3600

/**
 * 自社ハブの職種 slug → 外部の job_category 名。複数の外部カテゴリを1ハブに合流させる
 * （例: truck-driver には「トラック」と「配送・宅配」を集約）。ここに無い slug は外部求人を出さない。
 * 送迎ドライバー・その他ドライバーは自社に対応ハブが無いため初期スコープ外（将来カテゴリ新設で回収）。
 */
const HUB_SLUG_TO_EXTERNAL_CATEGORIES: Record<string, string[]> = {
  "taxi-driver": ["タクシー運転手"],
  "hire-driver": ["ハイヤー・役員運転手"],
  "bus-driver": ["バス運転手"],
  "truck-driver": ["トラックドライバー", "配送・宅配ドライバー"],
}

export const hasExternalJobsForCategory = (hubCatSlug?: string): boolean =>
  !!hubCatSlug && hubCatSlug in HUB_SLUG_TO_EXTERNAL_CATEGORIES

/** 外部 job_category 名 → 自社ハブ職種 slug（詳細ページのクロスセル先解決用）。 */
const EXTERNAL_CATEGORY_TO_HUB: Record<string, string> = {
  タクシー運転手: "taxi-driver",
  "ハイヤー・役員運転手": "hire-driver",
  バス運転手: "bus-driver",
  トラックドライバー: "truck-driver",
  "配送・宅配ドライバー": "truck-driver",
}
export const hubSlugForExternalCategory = (cat?: string): string | undefined =>
  cat ? EXTERNAL_CATEGORY_TO_HUB[cat] : undefined

/** PostgREST の行（snake_case）→ ExternalJob（camelCase）。 */
function mapRow(r: Record<string, unknown>): ExternalJob {
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? undefined : Number(v))
  const str = (v: unknown) => (typeof v === "string" ? v : undefined)
  return {
    source: String(r.source ?? ""),
    sourceId: String(r.source_id ?? ""),
    sourceName: String(r.source_name ?? "ハローワークインターネットサービス"),
    sourceUrl: str(r.source_url),
    hwOffice: str(r.hw_office),
    title: str(r.title),
    companyName: str(r.company_name),
    prefecture: str(r.prefecture),
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

async function query(
  params: Record<string, string>,
  wantCount = false,
): Promise<{ rows: ExternalJob[]; count: number }> {
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
    return { rows: data.map(mapRow), count }
  } catch {
    // 障害時は外部求人セクションを出さない（自社ページは無傷）。
    return { rows: [], count: 0 }
  }
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
      prefecture: `eq.${params.prefectureRegion}`,
      job_category: `in.${inList}`,
      order: "last_seen.desc",
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
    { job_category: `in.${inList}`, order: "last_seen.desc", limit: String(params.limit ?? 24) },
    true,
  )
  return { jobs: rows, count }
}

/** 外部求人1件（詳細ページ用）。存在しなければ null。 */
export const getExternalJob = async (
  source: string,
  sourceId: string,
): Promise<ExternalJob | null> => {
  const { rows } = await query({
    source: `eq.${source}`,
    source_id: `eq.${sourceId}`,
    limit: "1",
  })
  return rows[0] ?? null
}
