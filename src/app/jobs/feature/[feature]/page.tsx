import type { Metadata } from "next"
import { notFound } from "next/navigation"
import HubPage from "@/features/hub/components/hub-page"
import {
  getExternalJobsByFeature,
  getExternalFeatureCount,
  EXTERNAL_PAGE_SIZE,
} from "@/features/external-jobs/api"
import { getMediaArticlesByKeyword } from "@/features/media/api"
import {
  HUB_FEATURES,
  findFeature,
  hubUrl,
  getHubData,
  withSlug,
} from "@/features/hub/lib/hub"
import { generateHubMetadata } from "@/shared/lib/metadata"

/**
 * 条件（働き方）ハブ。職種をまたぐ働き方を1枚で受ける面。
 *
 * 第1弾は「ルート配送」のみ。配送・宅配3,260件＋トラック472件と職種横断のため
 * 既存の職種ハブでは受け皿にならず、競合（ドラEVER）も「ルート配送 求人」(SV2,400)で
 * 10位圏外という空白地帯にあたる。
 */
interface Props {
  params: Promise<{ feature: string }>
}

export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams() {
  return HUB_FEATURES.map((f) => ({ feature: f.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { feature } = await params
  const f = findFeature(feature)
  if (!f) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const count = await getExternalFeatureCount(f.match)
  return generateHubMetadata({
    title: `${f.name}の求人・転職（全国）｜${count}件`,
    description: f.lead,
    canonicalPath: hubUrl.feature(f.slug),
  })
}

export default async function Page({ params }: Props) {
  const { feature } = await params
  const f = findFeature(feature)
  if (!f) notFound()

  const { jobs, count, ok } = await getExternalJobsByFeature({
    match: f.match,
    limit: EXTERNAL_PAGE_SIZE,
  })
  // 取得失敗を「在庫ゼロ」と読むと 404 が最大1時間キャッシュされ、公開済みハブが消える。
  // 投げれば ISR は直前の生成結果を配り続けるので、障害中もページは生きる（PR #86 の方針）。
  if (!ok) throw new Error(`external jobs unavailable: feature=${f.slug}`)
  // 在庫が薄いページを出さない（職種ハブの外部求人しきい値と同じ考え方）
  if (count < 20) notFound()

  const { prefectures } = await getHubData()
  const kenLinks = withSlug(prefectures)
    .slice(0, 24)
    .map((p) => ({ label: `${p.region}の求人`, href: hubUrl.prefecture(p.slug!) }))

  const relatedArticles = (await getMediaArticlesByKeyword("ルート配送")).map((a) => ({
    title: a.title,
    href: `https://ridejob.jp/media/blog/${a.slug ?? a.id}`,
    image: a.eyecatch?.url,
    date: a.publishedAt,
  }))

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: `${f.name}の求人` },
      ]}
      h1={`${f.name}の求人・転職（全国）`}
      lead={f.lead}
      bodyHtml={f.body}
      summaryLabel={`${f.name}（全国）`}
      summary={`当サイトに掲載中の${f.name}求人は${count}件です。配送・宅配ドライバーとトラックドライバーの両方にまたがるため、職種で絞るとどちらかが抜け落ちます。ここでは働き方でまとめています。`}
      stats={{ count, companyCount: 0, topTags: [], salarySampleSize: 0 }}
      totalCount={0}
      jobs={[]}
      faqs={[
        {
          question: `${f.name}は未経験でもできますか？`,
          answer: "決まった配送先を決まった順番でまわる仕事なので、道と荷物を覚えれば1日の流れが読めるようになります。掲載求人にも未経験歓迎の募集が多くあります。ただし必要な免許は車両の大きさで変わるため、求人票の車種欄を必ず確認してください。",
        },
        {
          question: `${f.name}と宅配便は何が違いますか？`,
          answer: "届け先が違います。ルート配送は事業所が相手で、受け取り手が必ずいます。宅配便は個人宅が相手なので不在再配達が発生します。1日の件数も、宅配のほうが多くなる傾向です。",
        },
        {
          question: "給与の相場はどのくらいですか？",
          answer: "当サイト掲載求人のうち月給が明示されている3,032件の中央値は230,000円です（下限額ベース・2026年8月時点）。業界全体の統計ではなく、掲載求人の集計値です。",
        },
      ]}
      relatedArticles={relatedArticles}
      external={{
        jobs,
        count,
        region: "全国",
        catName: f.name,
        selfJobsHref: "/search",
        // cat を渡すと「もっと見る」が配送・宅配カテゴリ全体（5,619件）を継ぎ足し、
        // ルート配送でない求人が混ざる一方でトラック側のルート配送に届かなくなる
        query: { feature: f.slug },
      }}
      related={[
        {
          title: "職種から探す",
          links: [
            { label: "配送・宅配ドライバーの求人一覧（全国）", href: hubUrl.category("delivery-driver") },
            { label: "トラックドライバーの求人一覧（全国）", href: hubUrl.category("truck-driver") },
          ],
        },
        { title: "地域から探す", links: kenLinks },
      ]}
    />
  )
}
