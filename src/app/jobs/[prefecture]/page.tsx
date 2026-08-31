import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsPaged, getJobsForStats } from "@/features/jobs/api"
import { getMediaArticlesByKeyword } from "@/features/media/api"
import {
  getExternalJobsForPrefecture,
  getExternalHubCounts,
  externalPrefectureTotal,
  EXTERNAL_PAGE_SIZE,
} from "@/features/external-jobs/api"
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
  hubArticleKeyword,
  withSlug,
  computeHubStats,
  buildHubSummary,
  buildHubFaqs,
  getHubContent,
} from "@/features/hub/lib/hub"
import { hubQualifies, hubLinkCount } from "@/features/hub/lib/hub-qualify"

// オンデマンドISR（generateStaticParams=[] で動的セグメントをISR化）。ページングは廃止し
// 上位 HUB_PAGE_SIZE 件＋「すべて見る」→/search に集約。求人はsitemapで全件クロール可。
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { prefecture: string }[] {
  return []
}

interface Props {
  params: Promise<{ prefecture: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { prefecture } = await params
  const { prefectures, matrix } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  if (!pref) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  // 県ハブだけ自社求人しか数えておらず、東京都ハブ171件 < 東京都×タクシー265件 という
  // 「部分が全体を超える」逆転が起きていた（PR #91 で職種ハブを合算にした際の漏れ）。
  const selfCount = matrix.byPrefecture[pref.id] ?? 0
  const count = selfCount + externalPrefectureTotal(await getExternalHubCounts(), pref.region)
  const base = hubUrl.prefecture(pref.slug!)
  const content = await getHubContent(base)
  return generateHubMetadata({
    title: `${hubTitle.prefecture(pref.region)}｜${count}件`,
    description: content?.lead || hubLead.prefecture(pref.region, count),
    canonicalPath: base,
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
    limit: HUB_PAGE_SIZE,
  })

  // この県で成立している職種ハブへのリンク。
  //
  // ⚠️ 判定は sitemap.ts と必ず同じにする（自社しきい値 または 転載しきい値）。
  // 以前は自社件数だけで絞っていたため、転載求人だけで成立するハブが sitemap には載るのに
  // 親からリンクされない状態だった。本番実測で 268本中203本（75%）が該当し、
  // 北海道・広島・岡山は配下7本中6本、熊本は6本すべてが孤立していた。
  // 件数ラベルも遷移先ページの表示（自社＋転載の合算）に揃える。ラベルだけ自社件数だと
  // 「265件」と書いたリンクの先に2,157件が並ぶという逆向きの食い違いになる。
  const externalCounts = await getExternalHubCounts()
  // 在庫件数の降順。関連記事の選定にも使うので slug を持ったまま保持する。
  const rankedCats = withSlug(categories)
    .map((c) => ({ cat: c, n: hubLinkCount(matrix.byPrefectureCategory, externalCounts, pref, c) }))
    .filter(({ cat }) => hubQualifies(matrix.byPrefectureCategory, externalCounts, pref, cat))
    .sort((a, b) => b.n - a.n)

  const catsInKen = rankedCats.map(({ cat, n }) => ({
    label: `${pref.region}の${cat.name}（${n}件）`,
    href: hubUrl.prefectureCategory(pref.slug!, cat.slug),
  }))

  const base = hubUrl.prefecture(pref.slug!)
  const statsJobs = totalCount > jobs.length
    ? await getJobsForStats({ prefectureId: pref.id })
    : jobs
  const stats = { ...computeHubStats(statsJobs), count: totalCount }

  const { jobs: exJobs, count: exCount } = await getExternalJobsForPrefecture({
    prefectureRegion: pref.region,
    limit: EXTERNAL_PAGE_SIZE,
  })
  const external = exCount > 0
    ? {
        jobs: exJobs,
        count: exCount,
        region: pref.region,
        catName: "ドライバー・整備士",
        selfJobsHref: searchUrl({ prefectureId: pref.id }),
        selfJobsCount: totalCount,
        query: { cat: "", pref: pref.region },
      }
    : undefined
  const jobLinks = statsJobs.slice(0, 200).map((j) => ({ id: j.id, name: j.jobName ?? j.title ?? "求人" }))
  const content = await getHubContent(base)

  // 県ハブ→メディア記事の相互リンク。
  // 県×職種ハブには既に3本ずつ入っているが、県ハブ47枚には1本も無かった（実測10県すべて0本）。
  // 県ハブは表示が最も多く順位が最も低い層（例 /jobs/tottori は表示1,324で31.1位）である一方、
  // メディアは194ページ中167ページが1〜10位。強い面から弱い面へ内部リンクを通す。
  //
  // 県ハブは職種が定まらないので、その県で在庫が最も多い職種の記事を出す。
  // catsInKen は在庫件数の降順に並んでいるので先頭から拾えばよい。
  // 記事が引けない職種はスキップし、最大3本まで（県×職種ハブと同じ本数に揃える）。
  const relatedArticles = (
    await Promise.all(
      rankedCats.slice(0, 3).map(async ({ cat }) => {
        const kw = hubArticleKeyword(cat.slug)
        if (!kw) return []
        const list = await getMediaArticlesByKeyword(kw)
        return list.slice(0, 1).map((a) => ({
          title: a.title,
          href: `https://ridejob.jp/media/blog/${a.slug ?? a.id}`,
          image: a.eyecatch?.url,
          date: a.publishedAt?.slice(0, 10),
        }))
      }),
    )
  ).flat()

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: `${pref.region}の求人` },
      ]}
      h1={`${pref.region}のドライバー・整備士求人`}
      lead={content?.lead || hubLead.prefecture(pref.region, totalCount + (external?.count ?? 0))}
      bodyHtml={content?.body}
      summaryLabel={pref.region}
      summary={buildHubSummary(pref.region, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      jobLinks={jobLinks}
      external={external}
      faqs={buildHubFaqs({ region: pref.region, stats, externalCount: external?.count ?? 0 })}
      relatedArticles={relatedArticles}
      moreHref={searchUrl({ prefectureId: pref.id })}
      related={[{ title: `${pref.region}の職種から探す`, links: catsInKen }]}
    />
  )
}
