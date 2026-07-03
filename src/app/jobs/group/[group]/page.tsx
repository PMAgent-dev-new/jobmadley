import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsByCategoryIds, getGroupJobsForStats } from "@/features/jobs/api"
import { generateHubMetadata } from "@/shared/lib/metadata"
import {
  HUB_PAGE_SIZE,
  hubUrl,
  searchUrl,
  getHubData,
  computeHubStats,
  buildHubSummary,
  buildHubFaqs,
  parsePage,
  pagedUrl,
  findGroup,
} from "@/features/hub/lib/hub"

// オンデマンドISR（sitemapで全ハブをクロール可能に）
export const revalidate = 3600

interface Props {
  params: Promise<{ group: string }>
  searchParams: Promise<{ page?: string }>
}

/** グループの catSlugs を実カテゴリID配列へ解決 */
const resolveCatIds = (
  group: { catSlugs: string[] },
  categories: Array<{ id: string; slug?: string }>,
): string[] =>
  group.catSlugs
    .map((s) => categories.find((c) => c.slug === s)?.id)
    .filter((id): id is string => Boolean(id))

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { group: groupSlug } = await params
  const page = parsePage((await searchParams).page)
  const group = findGroup(groupSlug)
  if (!group) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const { categories, matrix } = await getHubData()
  const catIds = resolveCatIds(group, categories)
  const count = catIds.reduce((s, id) => s + (matrix.byCategory[id] ?? 0), 0)
  const base = hubUrl.group(group.slug)
  const meta = generateHubMetadata({
    title: page > 1 ? `${group.name}の求人・転職（全国）（${page}ページ目）` : `${group.name}の求人・転職（全国）｜${count}件`,
    description: group.lead,
    canonicalPath: pagedUrl(base, page),
  })
  if (page > 1) meta.robots = { index: false, follow: true }
  return meta
}

export default async function Page({ params, searchParams }: Props) {
  const { group: groupSlug } = await params
  const page = parsePage((await searchParams).page)
  const group = findGroup(groupSlug)
  if (!group) notFound()

  const { categories, matrix } = await getHubData()
  const catIds = resolveCatIds(group, categories)

  const { contents: jobs, totalCount } = await getJobsByCategoryIds({
    categoryIds: catIds,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
    offset: (page - 1) * HUB_PAGE_SIZE,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / HUB_PAGE_SIZE))
  const isFirst = page <= 1
  const base = hubUrl.group(group.slug)

  const stats = { ...computeHubStats(isFirst ? await getGroupJobsForStats(catIds) : jobs), count: totalCount }

  // 含まれる職種の全国ハブへのリンク（件数の多い順）
  const catLinks = group.catSlugs
    .map((slug) => categories.find((c) => c.slug === slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c && c.slug))
    .map((c) => ({ c, n: matrix.byCategory[c.id] ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .map(({ c, n }) => ({ label: `${c.name}（${n}件）`, href: hubUrl.category(c.slug!) }))

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: `${group.name}の求人` },
      ]}
      h1={`${group.name}の求人・転職（全国）`}
      lead={group.lead}
      summaryLabel={`${group.name}（全国）`}
      summary={buildHubSummary(`全国の${group.name}`, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      faqs={isFirst ? buildHubFaqs({ catName: group.name, stats }) : []}
      moreHref={searchUrl({})}
      page={page}
      totalPages={totalPages}
      pageHref={(n) => pagedUrl(base, n)}
      related={[{ title: `${group.name}の職種から探す`, links: catLinks }]}
    />
  )
}
