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
  parsePage,
  pagedUrl,
} from "@/features/hub/lib/hub"

// オンデマンドISR（レート制限回避のためビルド時一括SSGはしない。sitemapで全ハブをクロール可能に）
export const revalidate = 3600

interface Props {
  params: Promise<{ prefecture: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { prefecture } = await params
  const page = parsePage((await searchParams).page)
  const { prefectures, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  if (!pref) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const count = matrix.byPrefecture[pref.id] ?? 0
  const base = hubUrl.prefecture(pref.slug!)
  const meta = generateHubMetadata({
    title: page > 1 ? `${hubTitle.prefecture(pref.region)}（${page}ページ目）` : `${hubTitle.prefecture(pref.region)}｜${count}件`,
    description: hubLead.prefecture(pref.region, count),
    canonicalPath: pagedUrl(base, page),
  })
  if (page > 1) meta.robots = { index: false, follow: true }
  return meta
}

export default async function Page({ params, searchParams }: Props) {
  const { prefecture } = await params
  const page = parsePage((await searchParams).page)
  const { prefectures, categories, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  if (!pref) notFound()

  const { contents: jobs, totalCount } = await getJobsPaged({
    prefectureId: pref.id,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
    offset: (page - 1) * HUB_PAGE_SIZE,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / HUB_PAGE_SIZE))
  const isFirst = page <= 1

  // この県で求人がある職種ハブへのリンク（件数しきい値以上）
  const catsInKen = withSlug(categories)
    .filter((c) => prefCatCount(matrix, pref.id, c.id) >= HUB_MIN_JOBS)
    .map((c) => ({
      label: `${pref.region}の${c.name}（${prefCatCount(matrix, pref.id, c.id)}件）`,
      href: hubUrl.prefectureCategory(pref.slug!, c.slug),
    }))

  const base = hubUrl.prefecture(pref.slug!)
  const statsJobs = isFirst
    ? totalCount > jobs.length
      ? await getJobsForStats({ prefectureId: pref.id })
      : jobs
    : jobs
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
      faqs={isFirst ? buildHubFaqs({ region: pref.region, stats }) : []}
      moreHref={searchUrl({ prefectureId: pref.id })}
      page={page}
      totalPages={totalPages}
      pageHref={(n) => pagedUrl(base, n)}
      related={[{ title: `${pref.region}の職種から探す`, links: catsInKen }]}
    />
  )
}
