import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsPaged, getJobsForStats } from "@/features/jobs/api"
import { generateHubMetadata } from "@/shared/lib/metadata"
import {
  HUB_MIN_JOBS,
  HUB_LIST_LIMIT,
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
} from "@/features/hub/lib/hub"

// オンデマンドISR（レート制限回避のためビルド時一括SSGはしない。sitemapで全ハブをクロール可能に）
export const revalidate = 3600

interface Props {
  params: Promise<{ prefecture: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { prefecture } = await params
  const { prefectures, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  if (!pref) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const count = matrix.byPrefecture[pref.id] ?? 0
  return generateHubMetadata({
    title: `${hubTitle.prefecture(pref.region)}｜${count}件`,
    description: hubLead.prefecture(pref.region, count),
    canonicalPath: hubUrl.prefecture(pref.slug!),
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
    limit: HUB_LIST_LIMIT,
  })

  // この県で求人がある職種ハブへのリンク（件数しきい値以上）
  const catsInKen = withSlug(categories)
    .filter((c) => prefCatCount(matrix, pref.id, c.id) >= HUB_MIN_JOBS)
    .map((c) => ({
      label: `${pref.region}の${c.name}（${prefCatCount(matrix, pref.id, c.id)}件）`,
      href: hubUrl.prefectureCategory(pref.slug!, c.slug),
    }))

  const statsJobs = totalCount > jobs.length ? await getJobsForStats({ prefectureId: pref.id }) : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: `${pref.region}の求人` },
      ]}
      h1={`${pref.region}のドライバー・整備士求人`}
      lead={hubLead.prefecture(pref.region, totalCount)}
      summaryLabel={pref.region}
      summary={buildHubSummary(pref.region, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      faqs={buildHubFaqs({ region: pref.region, stats: { ...stats, count: totalCount } })}
      moreHref={searchUrl({ prefectureId: pref.id })}
      related={[{ title: `${pref.region}の職種から探す`, links: catsInKen }]}
    />
  )
}
