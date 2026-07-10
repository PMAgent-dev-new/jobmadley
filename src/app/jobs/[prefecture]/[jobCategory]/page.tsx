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
  parsePage,
  pagedUrl,
  getHubContent,
  hubArticleKeyword,
} from "@/features/hub/lib/hub"

// 求人詳細ページと同様、オンデマンドISR（初回アクセス/クロールで生成→1時間キャッシュ）。
// 全128ハブをビルド時に一括SSGするとmicroCMSのレート制限(429)に達するため生成を分散する。
// sitemapに全ハブURLを列挙してクロール可能にしている。
export const revalidate = 3600

interface Props {
  params: Promise<{ prefecture: string; jobCategory: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { prefecture, jobCategory } = await params
  const page = parsePage((await searchParams).page)
  const { prefectures, categories, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!pref || !cat) {
    return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  }
  const count = prefCatCount(matrix, pref.id, cat.id)
  const base = hubUrl.prefectureCategory(pref.slug!, cat.slug!)
  const content = page <= 1 ? await getHubContent(base) : null
  const meta = generateHubMetadata({
    title:
      page > 1
        ? `${hubTitle.prefectureCategory(pref.region, cat.name)}（${page}ページ目）`
        : `${hubTitle.prefectureCategory(pref.region, cat.name)}｜${count}件`,
    description: content?.lead || hubLead.prefectureCategory(pref.region, cat.name, count),
    canonicalPath: pagedUrl(base, page),
  })
  // 2ページ目以降は独自本文が無いので noindex,follow（求人リンクのクロールは維持）
  if (page > 1) meta.robots = { index: false, follow: true }
  return meta
}

export default async function Page({ params, searchParams }: Props) {
  const { prefecture, jobCategory } = await params
  const page = parsePage((await searchParams).page)
  const { prefectures, categories, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!pref || !cat) notFound()

  const { contents: jobs, totalCount } = await getJobsPaged({
    prefectureId: pref.id,
    jobCategoryId: cat.id,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
    offset: (page - 1) * HUB_PAGE_SIZE,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / HUB_PAGE_SIZE))
  const isFirst = page <= 1

  // 関連ハブ: 同じ県の他職種 / 同じ職種の他県（いずれも生成対象＝件数しきい値以上のみ）
  const sameKenOtherCat = withSlug(categories)
    .filter((c) => c.id !== cat.id && prefCatCount(matrix, pref.id, c.id) >= HUB_MIN_JOBS)
    .map((c) => ({ label: `${pref.region}の${c.name}`, href: hubUrl.prefectureCategory(pref.slug!, c.slug) }))

  const sameCatOtherKen = withSlug(prefectures)
    .filter((p) => p.id !== pref.id && prefCatCount(matrix, p.id, cat.id) >= HUB_MIN_JOBS)
    .map((p) => ({ label: `${p.region}の${cat.name}`, href: hubUrl.prefectureCategory(p.slug, cat.slug!) }))

  const label = `${pref.region}の${cat.name}`
  const base = hubUrl.prefectureCategory(pref.slug!, cat.slug!)
  // 傾向/職種解説/FAQは1ページ目のみ表示なので、集計取得も1ページ目に限定
  const statsJobs = isFirst
    ? totalCount > jobs.length
      ? await getJobsForStats({ prefectureId: pref.id, jobCategoryId: cat.id })
      : jobs
    : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }
  const cc = catContent[cat.slug!]
  const content = isFirst ? await getHubContent(base) : null

  // ハブ→メディア相互リンク（P1-1）。1ページ目のみ、職種に対応するお役立ち記事を掲載
  const articleKeyword = hubArticleKeyword(cat.slug)
  const relatedArticles =
    isFirst && articleKeyword
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
      categoryContent={isFirst && cc ? { catName: cat.name, ...cc } : undefined}
      faqs={isFirst ? buildHubFaqs({ region: pref.region, catName: cat.name, catSlug: cat.slug!, stats }) : []}
      relatedArticles={relatedArticles}
      moreHref={searchUrl({ prefectureId: pref.id, jobCategoryId: cat.id })}
      page={page}
      totalPages={totalPages}
      pageHref={(n) => pagedUrl(base, n)}
      related={[
        { title: `${cat.name}の求人をすべての地域で見る`, links: [{ label: `${cat.name}の求人一覧（全国）`, href: hubUrl.category(cat.slug!) }] },
        { title: `${pref.region}の他の職種から探す`, links: sameKenOtherCat },
        { title: `他の地域の${cat.name}を探す`, links: sameCatOtherKen.slice(0, 24) },
      ]}
    />
  )
}
