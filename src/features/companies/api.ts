import { cache } from "react"
import { unstable_cache } from "next/cache"
import { getAllJobsForCompanyPages } from "@/features/jobs/api"
import type { Job } from "@/features/jobs/types"
import { companySlugForJob } from "./data"

/**
 * 全求人を1回だけ取り、slug ごとに振り分けた索引を作る。
 *
 * 企業ページは39枚あるので、ページごとに microCMS を叩くとビルド1回で39×十数コールになる。
 * ハブ（getHubMatrix）と同じく unstable_cache で束ね、全ページ・sitemap・generateMetadata が
 * 同じ結果を共有する。TTLもハブ側と揃えて1時間。
 */
const getCompanyJobIndex = unstable_cache(
  async (): Promise<Record<string, Job[]>> => {
    const jobs = await getAllJobsForCompanyPages()
    const index: Record<string, Job[]> = {}
    for (const job of jobs) {
      const slug = companySlugForJob(job)
      if (!slug) continue
      ;(index[slug] ??= []).push(job)
    }
    warnIfTooBigToCache(index)
    return index
  },
  ["company-job-index"],
  { revalidate: 3600 },
)

/** unstable_cache の上限。超えると保存に失敗し、毎リクエスト全件取得へ静かに落ちる。 */
const DATA_CACHE_LIMIT_BYTES = 2 * 1024 * 1024

/**
 * 保存できないサイズになったことに気づけるようにする。
 * 一度これを踏んでおり（参照フィールドを丸ごと取って2.2MB）、症状がページ表示ではなく
 * microCMS のコール数にしか出ないため、取得側で明示的に警告を出す。
 */
const warnIfTooBigToCache = (index: Record<string, Job[]>) => {
  const bytes = Buffer.byteLength(JSON.stringify(index))
  if (bytes <= DATA_CACHE_LIMIT_BYTES * 0.8) return
  console.warn(
    `[company-job-index] キャッシュ上限に接近: ${bytes} bytes / ${DATA_CACHE_LIMIT_BYTES}。` +
      `getAllJobsForCompanyPages の fields を絞るか、索引の持ち方を見直すこと。`,
  )
}

/** generateMetadata とページ本体で同じ企業求人を二重取得しない。 */
export const getFeaturedCompanyJobs = cache(async (slug: string): Promise<Job[]> => {
  const index = await getCompanyJobIndex()
  return index[slug] ?? []
})
