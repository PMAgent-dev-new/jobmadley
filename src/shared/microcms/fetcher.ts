import type { MicroCMSQueries } from "microcms-js-sdk"
import { microcmsClient, microcmsClient2 } from "@/shared/microcms/client"
import type { MicroCMSListResponse } from "./types"

type ClientKey = "primary" | "media"

const clientFor = (key: ClientKey) => (key === "media" ? microcmsClient2 : microcmsClient)

const logFailure = (context: string, detail: Record<string, unknown>, error: unknown): void => {
  console.error(`[microCMS:${context}] ${detail.message ?? "request failed"}`, { ...detail, error })
}

// ISR を有効化するためのキャッシュ指定。
// Next 16 では fetch の既定が no-store（未キャッシュ）で、未キャッシュ fetch を検出すると
// Next はルート全体を動的レンダリングに切り替える。その結果、動的 API を使わない求人詳細
// （/job/[id]）まで毎回 SSR され、revalidate=3600 が無効化されていた。
// microCMS 取得を revalidate 付きでキャッシュすることで、こうしたページを ISR（静的）に戻す。
// プレビュー（draftKey 付き）は常に最新を取得するため no-store のままにする。
const REVALIDATE_SECONDS = 3600

const buildRequestInit = (queries?: MicroCMSQueries): RequestInit => {
  const hasDraftKey = Boolean(queries && (queries as Record<string, unknown>).draftKey)
  if (hasDraftKey) return { cache: "no-store" }
  return { next: { revalidate: REVALIDATE_SECONDS } } as RequestInit
}

export interface FetchListParams<TQueries extends MicroCMSQueries = MicroCMSQueries> {
  endpoint: string
  queries?: TQueries
  context: string
  client?: ClientKey
}

export const fetchList = async <T>({
  endpoint,
  queries,
  context,
  client = "primary",
}: FetchListParams): Promise<MicroCMSListResponse<T>> => {
  try {
    return await clientFor(client).get<MicroCMSListResponse<T>>({
      endpoint,
      queries,
      customRequestInit: buildRequestInit(queries),
    })
  } catch (error) {
    logFailure(context, { endpoint, queries }, error)
    throw error
  }
}

export interface FetchDetailParams<TQueries extends MicroCMSQueries = MicroCMSQueries> {
  endpoint: string
  contentId: string
  queries?: TQueries
  context: string
  client?: ClientKey
}

export const fetchDetail = async <T>({
  endpoint,
  contentId,
  queries,
  context,
  client = "primary",
}: FetchDetailParams): Promise<T> => {
  try {
    return await clientFor(client).get<T>({
      endpoint,
      contentId,
      queries,
      customRequestInit: buildRequestInit(queries),
    })
  } catch (error) {
    logFailure(context, { endpoint, contentId, queries }, error)
    throw error
  }
}

// 失敗時に null を返す詳細取得（IDで引いて存在しないこともある場合）
export const fetchDetailOrNull = async <T>(params: FetchDetailParams): Promise<T | null> => {
  try {
    return await fetchDetail<T>(params)
  } catch {
    return null
  }
}

// === 求人検索フィルタービルダー ===
// 重複していたフィルタ組み立てを集約

export interface JobFilterInput {
  prefectureId?: string
  municipalityId?: string
  tagIds?: string[]
  jobCategoryId?: string
}

export const buildJobFilters = ({
  prefectureId,
  municipalityId,
  tagIds = [],
  jobCategoryId,
}: JobFilterInput): string | undefined => {
  const parts: string[] = []
  if (prefectureId) parts.push(`prefecture[equals]${prefectureId}`)
  if (municipalityId) parts.push(`municipality[equals]${municipalityId}`)
  if (tagIds.length > 0) {
    tagIds.forEach((id) => parts.push(`tags[contains]${id}`))
  }
  if (jobCategoryId) parts.push(`jobCategory[equals]${jobCategoryId}`)
  return parts.length > 0 ? parts.join("[and]") : undefined
}
