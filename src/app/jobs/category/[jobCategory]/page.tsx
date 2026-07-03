import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsPaged } from "@/features/jobs/api"
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
  catContent,
} from "@/features/hub/lib/hub"

// オンデマンドISR（レート制限回避のためビルド時一括SSGはしない。sitemapで全ハブをクロール可能に）
export const revalidate = 3600

interface Props {
  params: Promise<{ jobCategory: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { jobCategory } = await params
  const { categories, matrix } = await getHubData()
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!cat) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const count = matrix.byCategory[cat.id] ?? 0
  return generateHubMetadata({
    title: `${hubTitle.category(cat.name)}｜${count}件`,
    description: hubLead.category(cat.name, count),
    canonicalPath: hubUrl.category(cat.slug!),
  })
}

export default async function Page({ params }: Props) {
  const { jobCategory } = await params
  const { prefectures, categories, matrix } = await getHubData()
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!cat) notFound()

  const { contents: jobs, totalCount } = await getJobsPaged({
    jobCategoryId: cat.id,
    orders: "-publishedAt",
    limit: HUB_LIST_LIMIT,
  })

  // この職種の求人がある都道府県ハブ（県×職種）へのリンク（件数しきい値以上・多い順）
  const kensForCat = withSlug(prefectures)
    .map((p) => ({ p, n: prefCatCount(matrix, p.id, cat.id) }))
    .filter((x) => x.n >= HUB_MIN_JOBS)
    .sort((a, b) => b.n - a.n)
    .map(({ p, n }) => ({
      label: `${p.region}の${cat.name}（${n}件）`,
      href: hubUrl.prefectureCategory(p.slug, cat.slug!),
    }))

  const stats = computeHubStats(jobs)
  const cc = catContent[cat.slug!]

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
      categoryContent={cc ? { catName: cat.name, ...cc } : undefined}
      faqs={buildHubFaqs({ catName: cat.name, catSlug: cat.slug!, stats: { ...stats, count: totalCount } })}
      moreHref={searchUrl({ jobCategoryId: cat.id })}
      related={[{ title: `地域から${cat.name}を探す`, links: kensForCat }]}
    />
  )
}
