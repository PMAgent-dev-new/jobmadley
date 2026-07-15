import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsPaged, getJobsForStats } from "@/features/jobs/api"
import { generateHubMetadata } from "@/shared/lib/metadata"
import {
  HUB_MIN_JOBS,
  HUB_PAGE_SIZE,
  hubUrl,
  hubLead,
  hubTitle,
  searchUrl,
  getHubData,
  prefCatCount,
  withSlug,
  computeHubStats,
  buildHubSummary,
  buildHubFaqs,
  getHubContent,
} from "@/features/hub/lib/hub"

// オンデマンドISR（generateStaticParams=[] で動的セグメントをISR化）。ページングは廃止し
// 上位 HUB_PAGE_SIZE 件＋「すべて見る」→/search に集約。求人はsitemapで全件クロール可。
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { prefecture: string }[] {
  return []
}

interface Props {
  params: Promise<{ prefecture: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { prefecture } = await params
  const { prefectures, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  if (!pref) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const count = matrix.byPrefecture[pref.id] ?? 0
  const base = hubUrl.prefecture(pref.slug!)
  const content = await getHubContent(base)
  return generateHubMetadata({
    title: `${hubTitle.prefecture(pref.region)}｜${count}件`,
    description: content?.lead || hubLead.prefecture(pref.region, count),
    canonicalPath: base,
  })
}

export default async function Page({ params }: Props) {
  const { prefecture } = await params
  const { prefectures, categories, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  if (!pref) notFound()

  const { contents: jobs, totalCount } = await getJobsPaged({
    prefectureId: pref.id,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
  })

  // この県で求人がある職種ハブへのリンク（件数しきい値以上）
  const catsInKen = withSlug(categories)
    .filter((c) => prefCatCount(matrix, pref.id, c.id) >= HUB_MIN_JOBS)
    .map((c) => ({
      label: `${pref.region}の${c.name}（${prefCatCount(matrix, pref.id, c.id)}件）`,
      href: hubUrl.prefectureCategory(pref.slug!, c.slug),
    }))

  const base = hubUrl.prefecture(pref.slug!)
  const statsJobs = totalCount > jobs.length
    ? await getJobsForStats({ prefectureId: pref.id })
    : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }
  const jobLinks = statsJobs.slice(0, 200).map((j) => ({ id: j.id, name: j.jobName ?? j.title ?? "求人" }))
  const content = await getHubContent(base)

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: `${pref.region}の求人` },
      ]}
      h1={`${pref.region}のドライバー・整備士求人`}
      lead={content?.lead || hubLead.prefecture(pref.region, totalCount)}
      bodyHtml={content?.body}
      summaryLabel={pref.region}
      summary={buildHubSummary(pref.region, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      jobLinks={jobLinks}
      faqs={buildHubFaqs({ region: pref.region, stats })}
      moreHref={searchUrl({ prefectureId: pref.id })}
      related={[{ title: `${pref.region}の職種から探す`, links: catsInKen }]}
    />
  )
}
