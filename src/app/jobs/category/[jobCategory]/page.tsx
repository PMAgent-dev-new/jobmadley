import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsPaged, getJobsForStats } from "@/features/jobs/api"
import { getMediaArticlesByKeyword } from "@/features/media/api"
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
  groupForCatSlug,
  getHubContent,
  hubArticleKeyword,
  hubCategorySynonym,
  catNameWithSynonym,
} from "@/features/hub/lib/hub"

// オンデマンドISR（generateStaticParams=[] で動的セグメントをISR化）。ページングは廃止し
// 上位 HUB_PAGE_SIZE 件＋「すべて見る」→/search に集約。求人はsitemapで全件クロール可。
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { jobCategory: string }[] {
  return []
}

interface Props {
  params: Promise<{ jobCategory: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { jobCategory } = await params
  const { categories, matrix } = await getHubData()
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!cat) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const count = matrix.byCategory[cat.id] ?? 0
  const base = hubUrl.category(cat.slug!)
  const content = await getHubContent(base)
  const synonym = hubCategorySynonym(cat.slug ?? undefined)
  return generateHubMetadata({
    title: `${hubTitle.category(cat.name, synonym)}｜${count}件`,
    description: content?.lead || hubLead.category(cat.name, count, synonym),
    canonicalPath: base,
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
    limit: HUB_PAGE_SIZE,
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

  const base = hubUrl.category(cat.slug!)
  const statsJobs = totalCount > jobs.length
    ? await getJobsForStats({ jobCategoryId: cat.id })
    : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }
  const jobLinks = statsJobs.slice(0, 200).map((j) => ({ id: j.id, name: j.jobName ?? j.title ?? "求人" }))
  const cc = catContent[cat.slug!]
  const group = groupForCatSlug(cat.slug!)
  const content = await getHubContent(base)

  // ハブ→メディア相互リンク（P1-1）
  const articleKeyword = hubArticleKeyword(cat.slug)
  const relatedArticles = articleKeyword
    ? (await getMediaArticlesByKeyword(articleKeyword)).map((a) => ({
        title: a.title,
        href: `https://ridejob.jp/media/blog/${a.slug ?? a.id}`,
        image: a.eyecatch?.url,
        date: a.publishedAt?.slice(0, 10),
      }))
    : []

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: `${cat.name}の求人` },
      ]}
      h1={`${catNameWithSynonym(cat.name, hubCategorySynonym(cat.slug ?? undefined))}の求人・転職（全国）`}
      lead={content?.lead || hubLead.category(cat.name, totalCount, hubCategorySynonym(cat.slug ?? undefined))}
      bodyHtml={content?.body}
      summaryLabel={`${cat.name}（全国）`}
      summary={buildHubSummary(`全国の${cat.name}`, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      jobLinks={jobLinks}
      categoryContent={cc ? { catName: cat.name, ...cc } : undefined}
      faqs={buildHubFaqs({ catName: cat.name, catSlug: cat.slug!, stats })}
      relatedArticles={relatedArticles}
      moreHref={searchUrl({ jobCategoryId: cat.id })}
      related={[
        ...(group
          ? [{ title: `${group.name}の求人を見る`, links: [{ label: `${group.name}の求人一覧（全国）`, href: hubUrl.group(group.slug) }] }]
          : []),
        { title: `地域から${cat.name}を探す`, links: kensForCat },
      ]}
    />
  )
}
