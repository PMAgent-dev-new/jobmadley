import { buildJobFilters, fetchDetail, fetchList } from "@/shared/microcms/fetcher"
import type { Job, JobDetail } from "./types"

// =====================
// 単一求人取得
// =====================

export type GetJobOptions = {
  draftKey?: string
}

/** 単一の求人を ID で取得（depth=2 で参照情報も展開） */
export const getJob = async (jobId: string, options: GetJobOptions = {}): Promise<JobDetail> => {
  const queries: Record<string, string | number> = { depth: 2 }
  if (options.draftKey) queries.draftKey = options.draftKey
  return fetchDetail<JobDetail>({
    endpoint: "jobs",
    contentId: jobId,
    queries,
    context: "getJob",
  })
}

// =====================
// 求人一覧取得
// =====================

interface GetJobsParams {
  /** 都道府県 ID で絞り込み (optional) */
  prefectureId?: string
  /** 市区町村 ID で絞り込み (optional) */
  municipalityId?: string
  /** タグ ID 配列で絞り込み (optional, 複数可) */
  tagIds?: string[]
  /** 職種 ID で絞り込み (optional) */
  jobCategoryId?: string
  /** フリーワード検索 (optional) */
  keyword?: string
  /** 取得件数 (default: 100) */
  limit?: number
  /** 並び順 (microCMS orders 文字列, optional) */
  orders?: string
}

const buildJobQueries = (
  params: GetJobsParams & { offset?: number; limit: number; depth?: number },
): Record<string, string | number> => {
  const { prefectureId, municipalityId, tagIds, jobCategoryId, keyword, limit, orders, offset, depth } = params
  const filters = buildJobFilters({ prefectureId, municipalityId, tagIds, jobCategoryId })
  const queries: Record<string, string | number> = { limit }
  if (depth !== undefined) queries.depth = depth
  if (offset !== undefined) queries.offset = offset
  if (keyword) queries.q = keyword
  if (orders) queries.orders = orders
  if (filters) queries.filters = filters
  return queries
}

/** 求人一覧を microCMS から取得 */
export const getJobs = async (params: GetJobsParams): Promise<Job[]> => {
  const { limit = 100 } = params
  const data = await fetchList<Job>({
    endpoint: "jobs",
    queries: buildJobQueries({ ...params, limit, depth: 1 }),
    context: "getJobs",
  })
  return data.contents
}

/** 求人数だけを取得（limit=0） */
export const getJobCount = async ({
  prefectureId,
  municipalityId,
  keyword,
}: Pick<GetJobsParams, "prefectureId" | "municipalityId" | "keyword">): Promise<number> => {
  const data = await fetchList<Job>({
    endpoint: "jobs",
    queries: buildJobQueries({ prefectureId, municipalityId, keyword, limit: 0 }),
    context: "getJobCount",
  })
  return data.totalCount
}

/**
 * 都道府県別の求人件数を一括集計する。
 * トップページで47都道府県ぶん getJobCount を個別発火すると1リクエストで
 * microCMS を約50コール消費しレート制限に達する（超過時は件数0表示に縮退する実バグ）ため、
 * fields を絞った全件ページング（数コール）＋サーバー集計に置き換える。
 */
export const getJobCountsByPrefecture = async (): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {}
  const limit = 100
  let offset = 0

  while (true) {
    const data = await fetchList<Job>({
      endpoint: "jobs",
      queries: { limit, offset, fields: "id,prefecture.id" },
      context: "getJobCountsByPrefecture",
    })
    for (const job of data.contents) {
      const prefId = job.prefecture?.id
      if (prefId) counts[prefId] = (counts[prefId] ?? 0) + 1
    }
    offset += data.limit
    if (offset >= data.totalCount) break
  }

  return counts
}

/**
 * ハブの傾向集計用に、条件に一致する求人「全件」を軽量フィールドで取得する。
 * 表示用の getJobsPaged(60件) では大きいハブで集計が不正確になるため、集計は全件ベースで行う。
 */
export const getJobsForStats = async (params: {
  prefectureId?: string
  jobCategoryId?: string
}): Promise<Job[]> => {
  const filters = buildJobFilters(params)
  const jobs: Job[] = []
  const limit = 100
  let offset = 0
  while (true) {
    const data = await fetchList<Job>({
      endpoint: "jobs",
      queries: {
        limit,
        offset,
        depth: 1,
        fields: "id,salaryMin,salaryMax,employmentType,companyName,tags",
        ...(filters ? { filters } : {}),
      },
      context: "getJobsForStats",
    })
    jobs.push(...data.contents)
    offset += data.limit
    if (offset >= data.totalCount) break
  }
  return jobs
}

/** 地域×職種の求人件数マトリクス。ハブページの生成対象選別（薄いページ除外）に使う。 */
export interface JobCountMatrix {
  /** prefectureId -> 件数 */
  byPrefecture: Record<string, number>
  /** jobCategoryId -> 件数 */
  byCategory: Record<string, number>
  /** `${prefectureId}:${jobCategoryId}` -> 件数 */
  byPrefectureCategory: Record<string, number>
}

/**
 * 求人全件を fields 絞りで1回ページング取得し、都道府県別・職種別・県×職種別を同時集計する。
 * getJobCount の個別連打（レート制限で件数0縮退）を避けるための一括集計。
 */
export const getJobCountMatrix = async (): Promise<JobCountMatrix> => {
  const byPrefecture: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  const byPrefectureCategory: Record<string, number> = {}
  const limit = 100
  let offset = 0

  while (true) {
    const data = await fetchList<Job>({
      endpoint: "jobs",
      queries: { limit, offset, fields: "id,prefecture.id,jobCategory.id" },
      context: "getJobCountMatrix",
    })
    for (const job of data.contents) {
      const p = job.prefecture?.id
      const c = job.jobCategory?.id
      if (p) byPrefecture[p] = (byPrefecture[p] ?? 0) + 1
      if (c) byCategory[c] = (byCategory[c] ?? 0) + 1
      if (p && c) {
        const key = `${p}:${c}`
        byPrefectureCategory[key] = (byPrefectureCategory[key] ?? 0) + 1
      }
    }
    offset += data.limit
    if (offset >= data.totalCount) break
  }

  return { byPrefecture, byCategory, byPrefectureCategory }
}

/** ページネーション用: limit と offset を指定して求人を取得 */
export const getJobsPaged = async (
  params: GetJobsParams & { offset?: number },
): Promise<{ contents: Job[]; totalCount: number }> => {
  const { limit = 10, offset = 0 } = params
  const data = await fetchList<Job>({
    endpoint: "jobs",
    queries: buildJobQueries({ ...params, limit, offset, depth: 1 }),
    context: "getJobsPaged",
  })
  return { contents: data.contents, totalCount: data.totalCount }
}
