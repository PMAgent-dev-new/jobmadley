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
  findGroup,
  getHubContent,
} from "@/features/hub/lib/hub"

// オンデマンドISR（generateStaticParams=[] で動的セグメントをISR化）。ページングは廃止し
// 上位 HUB_PAGE_SIZE 件＋「すべて見る」→/search に集約。求人はsitemapで全件クロール可。
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { group: string }[] {
  return []
}

interface Props {
  params: Promise<{ group: string }>
}

/** グループの catSlugs を実カテゴリID配列へ解決 */
const resolveCatIds = (
  group: { catSlugs: string[] },
  categories: Array<{ id: string; slug?: string }>,
): string[] =>
  group.catSlugs
    .map((s) => categories.find((c) => c.slug === s)?.id)
    .filter((id): id is string => Boolean(id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { group: groupSlug } = await params
  const group = findGroup(groupSlug)
  if (!group) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const { categories, matrix } = await getHubData()
  const catIds = resolveCatIds(group, categories)
  const count = catIds.reduce((s, id) => s + (matrix.byCategory[id] ?? 0), 0)
  const base = hubUrl.group(group.slug)
  const content = await getHubContent(base)
  return generateHubMetadata({
    title: `${group.name}の求人・転職（全国）｜${count}件`,
    description: content?.lead || group.lead,
    canonicalPath: base,
  })
}

export default async function Page({ params }: Props) {
  const { group: groupSlug } = await params
  const group = findGroup(groupSlug)
  if (!group) notFound()

  const { categories, matrix } = await getHubData()
  const catIds = resolveCatIds(group, categories)

  const { contents: jobs, totalCount } = await getJobsByCategoryIds({
    categoryIds: catIds,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
  })
  const base = hubUrl.group(group.slug)

  const statsJobs = totalCount > jobs.length ? await getGroupJobsForStats(catIds) : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }
  const content = await getHubContent(base)

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
      lead={content?.lead || group.lead}
      bodyHtml={content?.body}
      summaryLabel={`${group.name}（全国）`}
      summary={buildHubSummary(`全国の${group.name}`, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      faqs={buildHubFaqs({ catName: group.name, stats })}
      moreHref={searchUrl({})}
      related={[{ title: `${group.name}の職種から探す`, links: catLinks }]}
    />
  )
}
