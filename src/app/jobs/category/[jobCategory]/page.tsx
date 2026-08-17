import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsPaged, getJobsForStats } from "@/features/jobs/api"
import {
  getExternalJobsForCategory,
  hasExternalJobsForCategory,
  getExternalCategoryCount,
  EXTERNAL_PAGE_SIZE,
  getExternalHubCounts,
} from "@/features/external-jobs/api"
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
  featuresForCatSlug,
} from "@/features/hub/lib/hub"
import { buildInventoryBreakdown } from "@/features/hub/lib/inventory"
import { hubQualifies, hubLinkCount } from "@/features/hub/lib/hub-qualify"

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
  const selfCount = matrix.byCategory[cat.id] ?? 0
  // 市区町村ハブでは合流済みなのに職種ハブは自社求人しか数えていなかった。
  // トラックは自社5件・掲載7,404件で、title が「5件」になっていた。
  const externalCount = hasExternalJobsForCategory(cat.slug)
    ? await getExternalCategoryCount([cat.slug!])
    : 0
  const count = selfCount + externalCount
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

  // この職種で成立している県×職種ハブへのリンク（多い順）。
  //
  // ⚠️ 県ハブ・sitemap と同じ hubQualifies / hubLinkCount を使う。
  // 以前はここだけ自社件数で絞っていたため、同じURLを県ハブは「511件」、
  // 職種ハブは「88件」と表示する食い違いが出ていた（/jobs/aichi/car-mechanic の実測）。
  // 転載だけで成立するハブへのリンクもこちらには無く、トラック・配送・送迎は
  // 県ハブへのリンクが0本だった。
  const externalHubCounts = await getExternalHubCounts()
  const kensForCat = withSlug(prefectures)
    .map((p) => ({ p, n: hubLinkCount(matrix.byPrefectureCategory, externalHubCounts, p, { id: cat.id, slug: cat.slug! }) }))
    .filter(({ p }) => hubQualifies(matrix.byPrefectureCategory, externalHubCounts, p, { id: cat.id, slug: cat.slug! }))
    .sort((a, b) => b.n - a.n)
    .map(({ p, n }) => ({
      label: `${p.region}の${cat.name}（${n}件）`,
      href: hubUrl.prefectureCategory(p.slug, cat.slug!),
    }))

  const moreHref = searchUrl({ jobCategoryId: cat.id })
  const external = hasExternalJobsForCategory(cat.slug)
    ? await (async () => {
        const { jobs: exJobs, count } = await getExternalJobsForCategory({
          hubCatSlug: cat.slug!,
          limit: EXTERNAL_PAGE_SIZE,
        })
        return {
          jobs: exJobs,
          count,
          region: "全国",
          catName: cat.name,
          selfJobsHref: moreHref,
          selfJobsCount: totalCount,
          query: { cat: cat.slug! },
        }
      })()
    : undefined

  const base = hubUrl.category(cat.slug!)
  const statsJobs = totalCount > jobs.length
    ? await getJobsForStats({ jobCategoryId: cat.id })
    : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }
  // 掲載中求人そのものから作る内訳（給与の分布・勤務条件別の件数）。競合が持てない一次情報。
  const inventory = buildInventoryBreakdown(statsJobs, cat.name)
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
      inventory={inventory}
      totalCount={totalCount}
      jobs={jobs}
      jobLinks={jobLinks}
      categoryContent={cc ? { catName: cat.name, ...cc } : undefined}
      faqs={buildHubFaqs({ catName: cat.name, catSlug: cat.slug!, stats, externalCount: external?.count ?? 0 })}
      relatedArticles={relatedArticles}
      moreHref={moreHref}
      external={external}
      related={[
        ...(featuresForCatSlug(cat.slug).length > 0
          ? [{
              title: "働き方から探す",
              links: featuresForCatSlug(cat.slug).map((f) => ({
                label: `${f.name}の求人一覧（全国）`,
                href: hubUrl.feature(f.slug),
              })),
            }]
          : []),
        ...(group
          ? [{ title: `${group.name}の求人を見る`, links: [{ label: `${group.name}の求人一覧（全国）`, href: hubUrl.group(group.slug) }] }]
          : []),
        { title: `地域から${cat.name}を探す`, links: kensForCat },
      ]}
    />
  )
}
