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
  getHubContent,
  hubArticleKeyword,
} from "@/features/hub/lib/hub"

// オンデマンドISR。動的セグメントは generateStaticParams が無いと動的レンダリング扱いで
// revalidate が無効化されるため、空配列を返して「ビルド時は事前生成なし＋実アクセス時に
// オンデマンドISR」へ切り替える（求人詳細 /job/[id] と同じ方式）。ビルド時の microCMS 429 回避。
// ページングは廃止し、上位 HUB_PAGE_SIZE 件＋「すべて見る」→/search に集約（求人はsitemapで全件クロール可）。
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { prefecture: string; jobCategory: string }[] {
  return []
}

interface Props {
  params: Promise<{ prefecture: string; jobCategory: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { prefecture, jobCategory } = await params
  const { prefectures, categories, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!pref || !cat) {
    return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  }
  const count = prefCatCount(matrix, pref.id, cat.id)
  const base = hubUrl.prefectureCategory(pref.slug!, cat.slug!)
  const content = await getHubContent(base)
  return generateHubMetadata({
    title: `${hubTitle.prefectureCategory(pref.region, cat.name)}｜${count}件`,
    description: content?.lead || hubLead.prefectureCategory(pref.region, cat.name, count),
    canonicalPath: base,
  })
}

export default async function Page({ params }: Props) {
  const { prefecture, jobCategory } = await params
  const { prefectures, categories, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!pref || !cat) notFound()

  const { contents: jobs, totalCount } = await getJobsPaged({
    prefectureId: pref.id,
    jobCategoryId: cat.id,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
  })

  // 関連ハブ: 同じ県の他職種 / 同じ職種の他県（いずれも生成対象＝件数しきい値以上のみ）
  const sameKenOtherCat = withSlug(categories)
    .filter((c) => c.id !== cat.id && prefCatCount(matrix, pref.id, c.id) >= HUB_MIN_JOBS)
    .map((c) => ({ label: `${pref.region}の${c.name}`, href: hubUrl.prefectureCategory(pref.slug!, c.slug) }))

  const sameCatOtherKen = withSlug(prefectures)
    .filter((p) => p.id !== pref.id && prefCatCount(matrix, p.id, cat.id) >= HUB_MIN_JOBS)
    .map((p) => ({ label: `${p.region}の${cat.name}`, href: hubUrl.prefectureCategory(p.slug, cat.slug!) }))

  const label = `${pref.region}の${cat.name}`
  const base = hubUrl.prefectureCategory(pref.slug!, cat.slug!)
  // 傾向は全件集計（表示は上位のみだが統計は母集団ベース）
  const statsJobs = totalCount > jobs.length
    ? await getJobsForStats({ prefectureId: pref.id, jobCategoryId: cat.id })
    : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }
  const cc = catContent[cat.slug!]
  const content = await getHubContent(base)

  // ハブ→メディア相互リンク（P1-1）。職種に対応するお役立ち記事を掲載
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
        { name: pref.region, url: hubUrl.prefecture(pref.slug!) },
        { name: `${cat.name}求人` },
      ]}
      h1={`${label}求人`}
      lead={content?.lead || hubLead.prefectureCategory(pref.region, cat.name, totalCount)}
      bodyHtml={content?.body}
      summaryLabel={label}
      summary={buildHubSummary(label, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      categoryContent={cc ? { catName: cat.name, ...cc } : undefined}
      faqs={buildHubFaqs({ region: pref.region, catName: cat.name, catSlug: cat.slug!, stats })}
      relatedArticles={relatedArticles}
      moreHref={searchUrl({ prefectureId: pref.id, jobCategoryId: cat.id })}
      related={[
        { title: `${cat.name}の求人をすべての地域で見る`, links: [{ label: `${cat.name}の求人一覧（全国）`, href: hubUrl.category(cat.slug!) }] },
        { title: `${pref.region}の他の職種から探す`, links: sameKenOtherCat },
        { title: `他の地域の${cat.name}を探す`, links: sameCatOtherKen.slice(0, 24) },
      ]}
    />
  )
}
