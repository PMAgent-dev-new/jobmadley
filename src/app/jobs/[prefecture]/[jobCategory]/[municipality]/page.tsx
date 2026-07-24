import { notFound } from "next/navigation"
import type { Metadata } from "next"
import HubPage from "@/features/hub/components/hub-page"
import { getJobsPaged } from "@/features/jobs/api"
import { getMunicipalities } from "@/features/master/municipalities"
import {
  getExternalJobsForMuniHub,
  hasExternalJobsForCategory,
  HUB_MIN_MUNI_JOBS,
} from "@/features/external-jobs/api"
import { generateHubMetadata } from "@/shared/lib/metadata"
import {
  HUB_PAGE_SIZE,
  hubUrl,
  hubMuniLead,
  hubTitle,
  searchUrl,
  getHubData,
  computeHubStats,
  buildHubSummary,
  catContent,
  getHubContent,
} from "@/features/hub/lib/hub"

/**
 * 市区町村×職種ハブ（HACK1: 整備士バーティカル。ドラEVER/セイビーの粒度に対抗）。
 * URL: /jobs/[prefecture=romaji]/[municipality=日本語]/[jobCategory=romaji]
 * オンデマンドISR。薄いページ量産を避けるため、自社＋外部の合算が閾値未満なら notFound（生成しない）。
 */
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): {
  prefecture: string
  municipality: string
  jobCategory: string
}[] {
  return []
}

interface Props {
  params: Promise<{ prefecture: string; municipality: string; jobCategory: string }>
}

/** 県slug・市区町村名(日本語)・職種slug を解決。市区町村が県内に無ければ null。 */
async function resolve(prefecture: string, municipality: string, jobCategory: string) {
  const { prefectures, categories } = await getHubData()
  const pref = prefectures.find((p) => p.slug === prefecture)
  const cat = categories.find((c) => c.slug === jobCategory)
  if (!pref || !cat || !cat.slug) return null
  const muniName = decodeURIComponent(municipality)
  const munis = await getMunicipalities(pref.id)
  const muni = munis.find((m) => m.name === muniName)
  if (!muni) return null
  return { pref, cat, muni }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { prefecture, municipality, jobCategory } = await params
  const r = await resolve(prefecture, municipality, jobCategory)
  if (!r) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  const { pref, cat, muni } = r
  const base = hubUrl.municipalityCategory(pref.slug!, muni.name, cat.slug!)
  const content = await getHubContent(base)
  const [selfCount, ext] = await Promise.all([
    getJobsPaged({ prefectureId: pref.id, municipalityId: muni.id, jobCategoryId: cat.id, limit: 1 }).then(
      (d) => d.totalCount,
    ),
    hasExternalJobsForCategory(cat.slug)
      ? getExternalJobsForMuniHub({ prefectureRegion: pref.region, municipalityName: muni.name, hubCatSlug: cat.slug!, limit: 1 })
      : Promise.resolve({ count: 0, jobs: [] }),
  ])
  const total = selfCount + ext.count
  if (total < HUB_MIN_MUNI_JOBS) {
    return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  }
  return generateHubMetadata({
    title: `${hubTitle.municipalityCategory(pref.region, muni.name, cat.name)}｜${total}件`,
    description: content?.lead || hubMuniLead(pref.region, muni.name, cat.name, total),
    canonicalPath: base,
  })
}

export default async function Page({ params }: Props) {
  const { prefecture, municipality, jobCategory } = await params
  const r = await resolve(prefecture, municipality, jobCategory)
  if (!r) notFound()
  const { pref, cat, muni } = r

  const { contents: jobs, totalCount } = await getJobsPaged({
    prefectureId: pref.id,
    municipalityId: muni.id,
    jobCategoryId: cat.id,
    orders: "-publishedAt",
    limit: HUB_PAGE_SIZE,
  })

  const moreHref = searchUrl({ prefectureId: pref.id, jobCategoryId: cat.id })
  const external = hasExternalJobsForCategory(cat.slug)
    ? await getExternalJobsForMuniHub({
        prefectureRegion: pref.region,
        municipalityName: muni.name,
        hubCatSlug: cat.slug!,
        limit: 24,
      })
    : { jobs: [], count: 0 }

  // 薄いページ量産を避ける: 合算が閾値未満なら生成しない（sitemap/内部リンクとも整合）。
  if (totalCount + external.count < HUB_MIN_MUNI_JOBS) notFound()

  const label = `${muni.name}の${cat.name}`
  const base = hubUrl.municipalityCategory(pref.slug!, muni.name, cat.slug!)
  const content = await getHubContent(base)
  const stats = { ...computeHubStats(jobs), count: totalCount }
  const cc = catContent[cat.slug!]

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: pref.region, url: hubUrl.prefecture(pref.slug!) },
        { name: `${cat.name}求人`, url: hubUrl.prefectureCategory(pref.slug!, cat.slug!) },
        { name: muni.name },
      ]}
      h1={`${label}求人`}
      lead={content?.lead || hubMuniLead(pref.region, muni.name, cat.name, totalCount + external.count)}
      bodyHtml={content?.body}
      summaryLabel={label}
      summary={buildHubSummary(label, stats)}
      stats={stats}
      totalCount={totalCount}
      jobs={jobs}
      categoryContent={cc ? { catName: cat.name, ...cc } : undefined}
      external={{
        jobs: external.jobs,
        count: external.count,
        region: `${pref.region}${muni.name}`,
        catName: cat.name,
        selfJobsHref: moreHref,
      }}
      moreHref={moreHref}
      related={[
        {
          title: `${pref.region}の${cat.name}をすべて見る`,
          links: [{ label: `${pref.region}の${cat.name}求人`, href: hubUrl.prefectureCategory(pref.slug!, cat.slug!) }],
        },
      ]}
    />
  )
}
