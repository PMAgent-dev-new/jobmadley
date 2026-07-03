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
  catContent,
  parsePage,
  pagedUrl,
  groupForCatSlug,
} from "@/features/hub/lib/hub"

// オンデマンドISR（レート制限回避のためビルド時一括SSGはしない。sitemapで全ハブをクロール可能に）
export const revalidate = 3600

interface Props {
  params: Promise<{ jobCategory: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { jobCategory } = await params
  const page = parsePage((await searchParams).page)
  const { categories, matrix } = await getHubData()
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!cat) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const count = matrix.byCategory[cat.id] ?? 0
  const base = hubUrl.category(cat.slug!)
  const meta = generateHubMetadata({
    title: page > 1 ? `${hubTitle.category(cat.name)}（${page}ページ目）` : `${hubTitle.category(cat.name)}｜${count}件`,
    description: hubLead.category(cat.name, count),
    canonicalPath: pagedUrl(base, page),
  })
  if (page > 1) meta.robots = { index: false, follow: true }
  return meta
}

export default async function Page({ params, searchParams }: Props) {
  const { jobCategory } = await params
  const page = parsePage((await searchParams).page)
  const { prefectures, categories, matrix } = await getHubData()
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!cat) notFound()

  const { contents: jobs, totalCount } = await getJobsPaged({
    jobCategoryId: cat.id,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
    offset: (page - 1) * HUB_PAGE_SIZE,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / HUB_PAGE_SIZE))
  const isFirst = page <= 1

  // この職種の求人がある都道府県ハブ（県×職種）へのリンク（件数しきい値以上・多い順）
  const kensForCat = withSlug(prefectures)
    .map((p) => ({ p, n: prefCatCount(matrix, p.id, cat.id) }))
    .filter((x) => x.n >= HUB_MIN_JOBS)
    .sort((a, b) => b.n - a.n)
    .map(({ p, n }) => ({
      label: `${p.region}の${cat.name}（${n}件）`,
      href: hubUrl.prefectureCategory(p.slug, cat.slug!),
    }))

  const base = hubUrl.category(cat.slug!)
  const statsJobs = isFirst
    ? totalCount > jobs.length
      ? await getJobsForStats({ jobCategoryId: cat.id })
      : jobs
    : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }
  const cc = catContent[cat.slug!]
  const group = groupForCatSlug(cat.slug!)

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: `${cat.name}の求人` },
      ]}
      h1={`${cat.name}の求人・転職（全国）`}
      lead={hubLead.category(cat.name, totalCount)}
      summaryLabel={`${cat.name}（全国）`}
      summary={buildHubSummary(`全国の${cat.name}`, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      categoryContent={isFirst && cc ? { catName: cat.name, ...cc } : undefined}
      faqs={isFirst ? buildHubFaqs({ catName: cat.name, catSlug: cat.slug!, stats }) : []}
      moreHref={searchUrl({ jobCategoryId: cat.id })}
      page={page}
      totalPages={totalPages}
      pageHref={(n) => pagedUrl(base, n)}
      related={[
        ...(group
          ? [{ title: `${group.name}の求人を見る`, links: [{ label: `${group.name}の求人一覧（全国）`, href: hubUrl.group(group.slug) }] }]
          : []),
        { title: `地域から${cat.name}を探す`, links: kensForCat },
      ]}
    />
  )
}
