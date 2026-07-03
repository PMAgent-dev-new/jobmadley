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
