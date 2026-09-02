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
import { externalHubKey as hubKeyOf, HUB_MIN_EXTERNAL_JOBS as MIN_EXTERNAL } from "@/features/hub/lib/hub-qualify"
import type { ExternalJob } from "./types"

const SUPABASE_URL = process.env.SUPABASE_URL || "https://urvkgyohtqfxmymaivth.supabase.co"
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVydmtneW9odHFmeG15bWFpdnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1OTU1NzUsImV4cCI6MjEwMDE3MTU3NX0.NhE3dVLHaWbYRILQ5PW4p-CmGkr3ELUj_IXX6QIjxvs"

const VIEW = "external_public_jobs"
// 詳細項目は別ビュー。本体が status=active のものだけを返す（掲載終了は自動で消える）。
const DETAIL_VIEW = "external_public_job_details"
const REVALIDATE = 3600

/**
 * 画面で使う列だけを取得する。取得元を示す列（source_name / source_url / hw_office）は
 * 表示しない方針のため、そもそも取りに行かない。取得するとレンダリング結果に含まれず
 * ともRSCペイロードへ載り、ページのソースから読めてしまう。
 *
 * company_name はここでは取得するが、mapRow で **返さない**（2026-08-07 三木さん決定＝
 * 転載求人は社名を伏せる）。取得が必要なのは、社名が company_name 欄だけでなく
 * 勤務地・仕事内容・求人タイトルの本文中にも現れるため（実測: 勤務地12.5% / 仕事内容1.2% /
 * タイトル0.3%）。伏せ字にするには元の社名が要る。使ったあとは捨てるのでブラウザには出ない。
 * 応募の社内通知にだけ実名が要るため、それは getExternalCompanyName がサーバー側で別取得する。
 */
const SELECT_COLUMNS = [
  "source", "source_id", "title", "title_full", "company_name", "prefecture", "municipality_name", "address",
  "job_category", "employment_type", "salary_kind", "salary_min", "salary_max",
  "salary_raw", "work_hours", "description",
].join(",")

/**
 * 社名の識別子部分（法人格と空白を除いた中核）。「株式会社 トッキュウ」→「トッキュウ」。
 * 1文字だと誤爆する（例「東」）ので2文字未満は伏せ字の対象にしない。
 */
const companyCore = (name?: string): string => {
  const c = (name ?? "")
    .replace(/(株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|（株）|\(有\)|（有）)/g, "")
    .replace(/[\s　]/g, "")
  return c.length >= 2 ? c : ""
}

/** 本文中に現れる社名を伏せる。表記ゆれ（社名内の空白）に対応するため空白を挟んだ形も消す。 */
const redact = (text: string | undefined, name?: string): string | undefined => {
  if (!text) return text
  let out = text
  const full = (name ?? "").trim()
  const core = companyCore(name)
  for (const n of [full, core].filter((x) => x.length >= 2)) {
    const pat = n.split("").map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s　]*")
    out = out.replace(new RegExp(pat, "g"), "非公開")
  }
  return out.replace(/(非公開[\s　]*){2,}/g, "非公開")
}

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
  // 社名は伏せ字処理に使うだけで、返り値には含めない（＝RSCペイロードにも載らない）。
  const company = str(r.company_name)
  const pref = str(r.prefecture)
  const muni = str(r.municipality_name)
  return {
    source: String(r.source ?? ""),
    sourceId: String(r.source_id ?? ""),
    sourceName: String(r.source_name ?? ""),
    sourceUrl: str(r.source_url),
    hwOffice: str(r.hw_office),
    // 一覧ページ由来の title は転載元が20字で切り詰めており、30,716件中10,771件(35.1%)が
    // ちょうど20字で意味が途中で切れていた（「…タクシー運転手／６０歳以」）。
    // 詳細ページの h1 から取り直した title_full があればそちらを使う。
    // 未取得の求人では NULL なので従来の title に落ちる（段階的バックフィル中のため）。
    title: redact(str(r.title_full) || str(r.title), company),
    companyName: undefined,
    prefecture: pref,
    municipalityName: muni,
    // 生の住所は出さない。12.9%が番地まで載っており、検索すれば掲載企業が特定できるため
    // （社名を伏せる意味が無くなる）。市区町村までに丸める。municipality_name の付与率は98.7%で、
    // 未付与のときだけ都道府県まで。
    address: muni ? `${pref ?? ""}${muni}` : pref,
    jobCategory: str(r.job_category),
    employmentType: str(r.employment_type),
    salaryKind: str(r.salary_kind),
    salaryMin: num(r.salary_min),
    salaryMax: num(r.salary_max),
    salaryRaw: str(r.salary_raw),
    workHours: str(r.work_hours),
    description: redact(str(r.description), company),
    receivedAt: str(r.received_at),
    expiresAt: str(r.expires_at),
    lastSeen: str(r.last_seen),
  }
}

/**
 * `ok:false` は「取得に失敗した」。在庫が本当に0件なのか一時障害なのかを
 * 呼び出し側が区別できないと、障害が「在庫ゼロ」と読まれて 404 が1時間キャッシュされる。
 */
async function rawQuery(
  params: Record<string, string>,
  wantCount = false,
  view: string = VIEW,
): Promise<{ rows: Record<string, unknown>[]; count: number; ok: boolean }> {
  const qs = new URLSearchParams(params).toString()
  const url = `${SUPABASE_URL}/rest/v1/${view}?${qs}`
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }
  if (wantCount) headers.Prefer = "count=exact"
  try {
    const res = await fetch(url, { headers, next: { revalidate: REVALIDATE } })
    if (!res.ok) return { rows: [], count: 0, ok: false }
    const data = (await res.json()) as Record<string, unknown>[]
    let count = data.length
    if (wantCount) {
      // Content-Range: "0-19/1077"
      const cr = res.headers.get("content-range")
      const total = cr?.split("/")?.[1]
      if (total && total !== "*") count = Number(total)
    }
    return { rows: data, count, ok: true }
  } catch {
    // 障害時は外部求人セクションを出さない（自社ページは無傷）。
    return { rows: [], count: 0, ok: false }
  }
}

async function query(
  params: Record<string, string>,
  wantCount = false,
): Promise<{ rows: ExternalJob[]; count: number; ok: boolean }> {
  const { rows, count, ok } = await rawQuery(params, wantCount)
  return { rows: rows.map(mapRow), count, ok }
}

/**
 * 並び順は必ず一意に定まるようにする（source_id をタイブレーカーに置く）。
 * last_seen / received_date は取り込みバッチ単位で同値になる行が非常に多く、
 * これだけで order すると PostgREST の offset ページングでページ間の取りこぼしと
 * 重複が発生する（東京都×トラックの「もっと見る」で 248 件中 247 件しか辿れなかった）。
 */
const ORDER_HUB = "last_seen.desc,source_id.asc"
const ORDER_MUNI = "received_date.desc.nullslast,source_id.asc"

/**
 * 外部求人セクションの1画面あたりの表示件数。「もっと見る」もこの単位で追加する。
 * ハブは4列グリッドなので4の倍数にしておく。
 */
export const EXTERNAL_PAGE_SIZE = 24

/** offset を PostgREST パラメータへ。0/未指定のときは付けない（既存クエリのキャッシュキーを変えないため）。 */
const offsetParam = (offset?: number): Record<string, string> =>
  offset && offset > 0 ? { offset: String(offset) } : {}

/** ハブ（県×職種）向けの外部求人と総件数。県は prefectures.region（例「東京都」）＝外部 prefecture と一致。 */
export const getExternalJobsForHub = async (params: {
  prefectureRegion: string
  hubCatSlug: string
  limit?: number
  offset?: number
}): Promise<{ jobs: ExternalJob[]; count: number }> => {
  const cats = HUB_SLUG_TO_EXTERNAL_CATEGORIES[params.hubCatSlug]
  if (!cats || !params.prefectureRegion) return { jobs: [], count: 0 }
  const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
  const { rows, count } = await query(
    {
      select: SELECT_COLUMNS,
      prefecture: `eq.${params.prefectureRegion}`,
      job_category: `in.${inList}`,
      order: ORDER_HUB,
      limit: String(params.limit ?? EXTERNAL_PAGE_SIZE),
      ...offsetParam(params.offset),
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
  offset?: number
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
      order: ORDER_MUNI,
      limit: String(params.limit ?? EXTERNAL_PAGE_SIZE),
      ...offsetParam(params.offset),
    },
    true,
  )
  return { jobs: rows, count }
}

/** 職種のみハブ（全国）向け。 */
export const getExternalJobsForCategory = async (params: {
  hubCatSlug: string
  limit?: number
  offset?: number
}): Promise<{ jobs: ExternalJob[]; count: number }> => {
  const cats = HUB_SLUG_TO_EXTERNAL_CATEGORIES[params.hubCatSlug]
  if (!cats) return { jobs: [], count: 0 }
  const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
  const { rows, count } = await query(
    {
      select: SELECT_COLUMNS,
      job_category: `in.${inList}`,
      order: ORDER_HUB,
      limit: String(params.limit ?? EXTERNAL_PAGE_SIZE),
      ...offsetParam(params.offset),
    },
    true,
  )
  return { jobs: rows, count }
}

/** 県ハブ（例 /jobs/tokyo）向け。その県の対応職種すべてをまとめて引く。 */
export const getExternalJobsForPrefecture = async (params: {
  prefectureRegion: string
  limit?: number
  offset?: number
}): Promise<{ jobs: ExternalJob[]; count: number }> => {
  // 空文字だと prefecture=eq. で全県が返る。他のハブ用関数と同じくここで止める
  if (!params.prefectureRegion) return { jobs: [], count: 0 }
  const cats = Object.keys(EXTERNAL_CATEGORY_TO_HUB)
  const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
  const { rows, count } = await query(
    {
      select: SELECT_COLUMNS,
      prefecture: `eq.${params.prefectureRegion}`,
      job_category: `in.${inList}`,
      order: ORDER_HUB,
      limit: String(params.limit ?? EXTERNAL_PAGE_SIZE),
      ...offsetParam(params.offset),
    },
    true,
  )
  return { jobs: rows, count }
}

/**
 * 県ハブの外部求人件数。県×職種マトリクスを県で畳む。
 * ⚠️ 職種ハブ（getExternalCategoryCount）では実カウントを使っている。あちらは
 * prefecture が空の行を落とすと title と本文が食い違うため。県ハブは prefecture で
 * 絞る以上、空の行はそもそも対象外なので畳んで問題ない。
 */
export const externalPrefectureTotal = (counts: ExternalHubCounts, prefectureRegion: string): number =>
  Object.entries(counts).reduce(
    (n, [key, v]) => (key.startsWith(`${prefectureRegion}|`) ? n + v : n),
    0,
  )

/** 職種グループハブ（例 /jobs/group/driver）向け。複数の職種slugをまとめて引く。 */
export const getExternalJobsForCategories = async (params: {
  hubCatSlugs: string[]
  limit?: number
  offset?: number
}): Promise<{ jobs: ExternalJob[]; count: number }> => {
  const cats = [
    ...new Set(params.hubCatSlugs.flatMap((s) => HUB_SLUG_TO_EXTERNAL_CATEGORIES[s] ?? [])),
  ]
  if (cats.length === 0) return { jobs: [], count: 0 }
  const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
  const { rows, count } = await query(
    {
      select: SELECT_COLUMNS,
      job_category: `in.${inList}`,
      order: ORDER_HUB,
      limit: String(params.limit ?? EXTERNAL_PAGE_SIZE),
      ...offsetParam(params.offset),
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
/** @see hub-qualify.ts（しきい値の出所） */
export const HUB_MIN_EXTERNAL_JOBS = MIN_EXTERNAL

/** 件数マトリクスのキー。prefecture は prefectures.region（例「東京都」）。 */
/** @see hub-qualify.ts（キーの出所。ここは互換のための再エクスポート） */
export const externalHubKey = hubKeyOf

export type ExternalHubCounts = Record<string, number>

const COUNT_PAGE = 1000
/**
 * 暴走防止の上限。対象8カテゴリの在庫は 2026-08-14 実測で 31,001 行（上限の 39%）。
 * ⚠️ ここに達すると件数が静かに過少になるだけでなく、同じマトリクスを見る
 * qualifiesByExternalJobs 経由でハブ生成とサイトマップからページが黙って落ちる。
 * 週次ロードで在庫は増えるので、到達したら警告を出して気づけるようにしてある。
 */
const COUNT_MAX_PAGES = 80

/** 上限に達したら黙って切り捨てず必ず記録する（気づけない過少集計が一番こわい）。 */
/**
 * 件数集計のページングを、部分失敗を握り潰さずに取り切る。
 *
 * rawQuery は失敗時に例外ではなく {rows: [], ok: false} を返す。集計側がこれを
 * そのまま flatMap すると「取得できなかったページ＝0件」として集計され、
 * しかも unstable_cache が **壊れた集計値を1時間キャッシュする**。
 * order は source_id.asc で、ハローワーク求人番号は都道府県ブロック順に並ぶため、
 * 1ページ落ちると欠落が県単位に固まる（鳥取の掲載件数が 201→29 のように化ける）。
 * この件数は hubQualifies / hubLinkCount 経由で sitemap 収録と親ハブからの内部リンクも
 * 決めているので、地域ハブ全体の土台が日替わりで揺れることになる。
 *
 * 対策は2段構え。まず失敗ページだけを1回だけ引き直す（実障害の大半は一時的な失敗）。
 * それでも欠けるならキャッシュに載せず throw する。呼び出し側は従来どおり空で
 * 縮退するが、**壊れた値が1時間残らない**ので次のリクエストで自己回復する。
 */
async function fetchAllPages(
  page: (offset: number, wantCount?: boolean) => Promise<{ rows: Record<string, unknown>[]; count: number; ok: boolean }>,
  label: string,
): Promise<Record<string, unknown>[] | null> {
  const first = await page(0, true)
  if (!first.ok) return null
  if (first.rows.length === 0) return []

  const offsets = Array.from({ length: pageCount(first.count) - 1 }, (_, i) => (i + 1) * COUNT_PAGE)
  const results = await Promise.all(offsets.map((o) => page(o)))

  // 失敗したページだけを1回だけ引き直す（実障害の大半は一時的な失敗のため）
  const failedIdx = results.flatMap((r, i) => (r.ok ? [] : [i]))
  if (failedIdx.length > 0) {
    console.warn(
      `[external-jobs] ${label}: ${failedIdx.length}/${offsets.length} ページ取得失敗。引き直します`,
    )
    const retried = await Promise.all(failedIdx.map((i) => page(offsets[i])))
    retried.forEach((r, k) => {
      results[failedIdx[k]] = r
    })
    if (results.some((r) => !r.ok)) {
      console.error(`[external-jobs] ${label}: 引き直しても欠けるため集計をキャッシュしません`)
      return null
    }
  }
  return [first, ...results].flatMap((r) => r.rows)
}

const pageCount = (total: number): number => {
  const needed = Math.ceil(total / COUNT_PAGE)
  if (needed > COUNT_MAX_PAGES) {
    console.warn(
      `[external-jobs] 在庫 ${total} 件が取得上限 ${COUNT_MAX_PAGES * COUNT_PAGE} 件を超えました。` +
        `件数が過少になり、ハブがサイトマップから落ちます。COUNT_MAX_PAGES を引き上げてください。`,
    )
  }
  return Math.min(needed, COUNT_MAX_PAGES)
}

/**
 * 県×職種ごとの外部求人件数マトリクス。sitemap 掲載判定と関連リンクの出し分けに使う。
 *
 * この Supabase では PostgREST の集約関数（count()）が無効（PGRST123）なため、
 * 対象職種の (prefecture, job_category) だけを射影して全件取得し、アプリ側で数える。
 * 1行あたり数十バイト・約1.8万行で、各ページ取得は fetch キャッシュに載る。
 * 失敗時は空を返す＝外部求人ゼロ扱いとなり、自社求人だけの従来挙動に戻る（加算的設計）。
 */
const fetchExternalHubCounts = unstable_cache(
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

    const rows = await fetchAllPages(page, "県×職種の件数")
    if (rows === null) throw new Error("external hub counts: partial fetch failure")

    const counts: ExternalHubCounts = {}
    for (const row of rows) {
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

/**
 * 部分失敗のときは throw させ、unstable_cache に壊れた値を残さない。
 * 呼び出し側（ハブ・sitemap）は従来どおり空で縮退するが、その縮退は
 * このリクエスト限りで、次のリクエストは引き直しから始まる。
 */
export const getExternalHubCounts = async (): Promise<ExternalHubCounts> => {
  try {
    return await fetchExternalHubCounts()
  } catch {
    return {}
  }
}

/**
 * 条件（働き方）ハブ向け。title か description に該当語を含む求人を引く。
 *
 * ルート配送のような働き方は job_category をまたぐ（配送・宅配3,260件＋トラック472件）ため、
 * 職種での絞り込みでは受け皿にならない。PostgREST の or フィルタで本文検索する。
 */
const featureFilter = (match: string[]): string =>
  `(${match.flatMap((m) => [`title.ilike.*${m}*`, `description.ilike.*${m}*`]).join(",")})`

export const getExternalJobsByFeature = async (params: {
  match: string[]
  limit?: number
  offset?: number
}): Promise<{ jobs: ExternalJob[]; count: number; ok: boolean }> => {
  if (params.match.length === 0) return { jobs: [], count: 0, ok: true }
  const { rows, count, ok } = await query(
    {
      select: SELECT_COLUMNS,
      or: featureFilter(params.match),
      order: ORDER_HUB,
      limit: String(params.limit ?? EXTERNAL_PAGE_SIZE),
      ...offsetParam(params.offset),
    },
    true,
  )
  return { jobs: rows, count, ok }
}

/** 条件ハブの件数。title と本文で数字が食い違わないよう、表示と同じ条件で数える。 */
export const getExternalFeatureCount = unstable_cache(
  async (match: string[]): Promise<number> => {
    if (match.length === 0) return 0
    const { count } = await query(
      { select: "source_id", or: featureFilter(match), limit: "1" },
      true,
    )
    return count
  },
  ["external-feature-count"],
  { revalidate: REVALIDATE },
)

/**
 * 職種ハブ（全国）の外部求人件数。
 *
 * ⚠️ 県×職種マトリクス（getExternalHubCounts）を畳んで代用してはいけない。
 * あちらは prefecture が空の行を落とすため実数より少なく出て、
 * title と本文の「掲載件数」が食い違う（トラックで 7,380 と 9,166 になった）。
 * 件数は本文と同じ実カウントを使い、unstable_cache で二重取得を避ける。
 */
export const getExternalCategoryCount = unstable_cache(
  async (hubCatSlugs: string[]): Promise<number> => {
    const cats = [
      ...new Set(hubCatSlugs.flatMap((s) => HUB_SLUG_TO_EXTERNAL_CATEGORIES[s] ?? [])),
    ]
    if (cats.length === 0) return 0
    const inList = `(${cats.map((c) => `"${c}"`).join(",")})`
    const { count } = await query(
      { select: "source_id", job_category: `in.${inList}`, limit: "1" },
      true,
    )
    return count
  },
  ["external-category-count"],
  { revalidate: REVALIDATE },
)

/** そのハブが「外部求人だけで生成対象になる」か。 */
export const qualifiesByExternalJobs = (
  counts: ExternalHubCounts,
  prefectureRegion: string,
  hubCatSlug: string,
): boolean => (counts[externalHubKey(prefectureRegion, hubCatSlug)] ?? 0) >= HUB_MIN_EXTERNAL_JOBS

// --- 市区町村×職種ハブ（HACK1: 整備士バーティカル。競合の粒度に対抗）-----------------
/** 市区町村ハブの「新規生成」最小件数。薄いページ量産を避けるため県ハブと同じ20を採用。 */
export const HUB_MIN_MUNI_JOBS = 20

/**
 * 公開済み（固有本文あり）市区町村ハブの「維持」最小件数＝ヒステリシスの下限。
 *
 * 生成と同じ閾値で 404/noindex にすると、ハローワーク求人が「受理月の翌々月末」で
 * 一斉失効する月次のノコギリ波のたびに、インデックス済みハブが消えて評価を失う。
 * 実測(2026-08): 生成条件(>=20)を満たす168件のうち70件(42%)が20〜24件の危険域で、
 * 月次変動(実測 -18%)で大半が閾値を割る状態だった。
 *
 * そこで「作るのは20件以上・一度公開したら5件以上ある限り維持」の二段構えにする。
 * ★適用対象は固有本文を持つ curated な市区町村ハブ（getMunicipalityContentEntries）に限定する。
 * 全組み合わせに適用すると、5〜19件帯の1,443組が新たに200/indexになり
 * scaled content abuse のフットプリントになるため。
 */
export const HUB_KEEP_MUNI_JOBS = 5

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
const fetchExternalMuniHubCounts = unstable_cache(
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
    const rows = await fetchAllPages(page, "市区町村×職種の件数")
    if (rows === null) throw new Error("external muni hub counts: partial fetch failure")

    const counts: ExternalHubCounts = {}
    for (const row of rows) {
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

/** 県×職種と同じ理由で、部分失敗はキャッシュに残さず、その場だけ空で縮退する。 */
export const getExternalMuniHubCounts = async (): Promise<ExternalHubCounts> => {
  try {
    return await fetchExternalMuniHubCounts()
  } catch {
    return {}
  }
}

/** 外部求人1件（詳細ページ用）。存在しなければ null。 */
/**
 * 詳細ページの表示項目（Phase 1 / 2026-08-07）。ラベルと順序をここで定義する。
 * 公開ビュー external_public_job_details が返す列だけを並べており、
 * 担当者・地図・会社所在地・法人番号・事業内容・会社の特長はそもそも存在しない
 * （取り込み段階で落としているため、表示制御ではなくデータとして持っていない）。
 * 勤務地はここに無い: 詳細ページの住所は番地まで載っていて企業を特定できるため、
 * 本体レコードの prefecture / municipality_name から市区町村までに丸めて出す。
 */
export const EXTERNAL_DETAIL_GROUPS: Array<{ group: string; items: Array<[string, string]> }> = [
  { group: "仕事内容", items: [
    ["work_content", "仕事の内容"], ["employment_form", "雇用形態"], ["job_class", "求人区分"],
    ["contract_period", "雇用期間"], ["trial_period", "試用期間"], ["recruit_reason", "募集の理由"],
  ] },
  { group: "応募条件", items: [
    ["experience", "必要な経験等"], ["education", "学歴"], ["license_required", "必要な免許・資格"],
    ["driver_license", "普通自動車運転免許"], ["age_limit", "年齢"],
  ] },
  { group: "勤務条件", items: [
    ["work_hours_detail", "就業時間"], ["overtime", "時間外労働"], ["break_time", "休憩時間"],
    ["annual_holidays", "年間休日"], ["holidays", "休日"], ["monthly_workdays", "月平均労働日数"],
    ["paid_leave", "年次有給休暇"], ["nearest_station", "最寄り駅"],
    ["car_commute", "マイカー通勤"], ["relocation", "転勤"],
  ] },
  { group: "待遇・福利厚生", items: [
    ["salary_detail", "賃金"], ["raise_", "昇給"], ["bonus", "賞与"],
    ["commute_allowance", "通勤手当"], ["insurance", "加入保険"],
    ["retirement_plan", "退職金制度"], ["retirement_age", "定年制"], ["rehire", "再雇用制度"],
    ["training", "研修制度"], ["smoking_policy", "受動喫煙対策"],
  ] },
  { group: "職場", items: [["employee_count", "従業員数"]] },
  { group: "選考", items: [["selection_method", "選考方法"], ["application_docs", "応募書類"]] },
]

const DETAIL_COLUMNS = EXTERNAL_DETAIL_GROUPS.flatMap((g) => g.items.map(([c]) => c)).join(",")

/** 詳細ページの項目を取得。未取得の求人では null（従来の表示に落ちるだけ）。 */
export const getExternalJobDetail = async (
  source: string,
  sourceId: string,
): Promise<Record<string, string> | null> => {
  const { rows } = await rawQuery(
    {
      select: DETAIL_COLUMNS,
      source: `eq.${source}`,
      source_id: `eq.${sourceId}`,
      limit: "1",
    },
    false,
    DETAIL_VIEW,
  )
  const r = rows[0]
  if (!r) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) if (typeof v === "string" && v.trim()) out[k] = v
  return Object.keys(out).length ? out : null
}

/**
 * 応募の社内通知用に、伏せていない社名だけをサーバー側で引く。
 * ⚠ この戻り値をクライアントコンポーネントの props に渡さないこと。渡すとRSCペイロードに載り、
 *   表示していなくてもページのソースから読めてしまう（source_name で実際に起きた事故と同型）。
 *   呼び出してよいのは Route Handler / Server Action の内側だけ。
 */
export const getExternalCompanyName = async (
  source: string,
  sourceId: string,
): Promise<string | undefined> => {
  const { rows } = await rawQuery({
    select: "company_name",
    source: `eq.${source}`,
    source_id: `eq.${sourceId}`,
    limit: "1",
  })
  const v = rows[0]?.company_name
  return typeof v === "string" && v ? v : undefined
}

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
