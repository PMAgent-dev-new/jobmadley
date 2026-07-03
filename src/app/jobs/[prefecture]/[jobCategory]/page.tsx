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
} from "@/features/hub/lib/hub"

// 求人詳細ページと同様、オンデマンドISR（初回アクセス/クロールで生成→1時間キャッシュ）。
// 全128ハブをビルド時に一括SSGするとmicroCMSのレート制限(429)に達するため生成を分散する。
// sitemapに全ハブURLを列挙してクロール可能にしている。
export const revalidate = 3600

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
  return generateHubMetadata({
    title: `${hubTitle.prefectureCategory(pref.region, cat.name)}｜${count}件`,
    description: hubLead.prefectureCategory(pref.region, cat.name, count),
    canonicalPath: hubUrl.prefectureCategory(pref.slug!, cat.slug!),
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
    limit: HUB_LIST_LIMIT,
  })

  // 関連ハブ: 同じ県の他職種 / 同じ職種の他県（いずれも生成対象＝件数しきい値以上のみ）
  const sameKenOtherCat = withSlug(categories)
    .filter((c) => c.id !== cat.id && prefCatCount(matrix, pref.id, c.id) >= HUB_MIN_JOBS)
    .map((c) => ({ label: `${pref.region}の${c.name}`, href: hubUrl.prefectureCategory(pref.slug!, c.slug) }))

  const sameCatOtherKen = withSlug(prefectures)
    .filter((p) => p.id !== pref.id && prefCatCount(matrix, p.id, cat.id) >= HUB_MIN_JOBS)
    .map((p) => ({ label: `${p.region}の${cat.name}`, href: hubUrl.prefectureCategory(p.slug, cat.slug!) }))

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: pref.region, url: hubUrl.prefecture(pref.slug!) },
        { name: `${cat.name}求人` },
      ]}
      h1={`${pref.region}の${cat.name}求人`}
      lead={hubLead.prefectureCategory(pref.region, cat.name, totalCount)}
      totalCount={totalCount}
      jobs={jobs}
      moreHref={searchUrl({ prefectureId: pref.id, jobCategoryId: cat.id })}
      related={[
        { title: `${pref.region}の他の職種から探す`, links: sameKenOtherCat },
        { title: `他の地域の${cat.name}を探す`, links: sameCatOtherKen.slice(0, 24) },
      ]}
    />
  )
}
