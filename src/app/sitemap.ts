import type { MetadataRoute } from "next"
import { SITE_URL } from "@/shared/lib/metadata"
import { microcmsClient } from "@/shared/microcms/client"
import type { Job } from "@/features/jobs/types"
import type { MicroCMSListResponse } from "@/shared/microcms/types"
import {
  HUB_MIN_JOBS,
  HUB_GROUPS,
  hubUrl,
  HUB_FEATURES,
  prefCatCount,
  withSlug,
  getHubData,
  getMunicipalityContentEntries,
} from "@/features/hub/lib/hub"
import { COMPANY_KEEP_JOBS, FEATURED_COMPANIES, companySlugForJob } from "@/features/companies/data"
import {
  getExternalHubCounts,
  getExternalMuniHubCounts,
  qualifiesByExternalJobs,
  externalMuniHubKey,
  HUB_KEEP_MUNI_JOBS,
} from "@/features/external-jobs/api"

/**
 * 地域×職種ハブページ群のsitemapエントリを生成（生成対象＝全県＋全職種＋しきい値以上の県×職種）。
 *
 * 県×職種は「自社求人 HUB_MIN_JOBS 件以上」または「ハローワーク転載求人 HUB_MIN_EXTERNAL_JOBS 件以上」で掲載する。
 * 自社基準だけだと、外部求人で在庫を補うために作った薄いハブ（トラック等）が丸ごと sitemap から
 * 落ちて孤立ページになり、転載求人を載せた意味が無くなる。
 */
const getHubRoutes = async (): Promise<MetadataRoute.Sitemap> => {
  const { prefectures, categories, matrix } = await getHubData()
  const externalCounts = await getExternalHubCounts()
  const routes: MetadataRoute.Sitemap = []
  for (const p of withSlug(prefectures)) {
    routes.push({ url: `${SITE_URL}${hubUrl.prefecture(p.slug)}`, changeFrequency: "daily", priority: 0.6 })
    for (const c of withSlug(categories)) {
      if (
        prefCatCount(matrix, p.id, c.id) >= HUB_MIN_JOBS ||
        qualifiesByExternalJobs(externalCounts, p.region, c.slug)
      ) {
        routes.push({
          url: `${SITE_URL}${hubUrl.prefectureCategory(p.slug, c.slug)}`,
          changeFrequency: "daily",
          priority: 0.7,
        })
      }
    }
  }
  // 市区町村×職種ハブ（HACK1）: 固有本文を用意したものだけ掲載する段階投入。
  // テンプレのみの薄い市区町村ハブを一括で sitemap に押し込むと scaled content abuse に
  // 直撃するため、本文を書いた市区町村から順に載せる。
  // 件数の判定はページ側の「維持」閾値と揃える（HUB_KEEP_MUNI_JOBS）。生成閾値のままだと
  // 月次の在庫変動でページは 200 のまま sitemap からだけ消え、内部リンクからも外れて孤児化する。
  const muniCounts = await getExternalMuniHubCounts()
  for (const e of getMunicipalityContentEntries()) {
    const pref = prefectures.find((p) => p.slug === e.prefSlug)
    if (!pref) continue
    if ((muniCounts[externalMuniHubKey(pref.region, e.muniName, e.catSlug)] ?? 0) < HUB_KEEP_MUNI_JOBS) continue
    routes.push({
      url: `${SITE_URL}${hubUrl.municipalityCategory(e.prefSlug, e.muniName, e.catSlug)}`,
      changeFrequency: "daily",
      priority: 0.7,
    })
  }
  for (const c of withSlug(categories)) {
    routes.push({ url: `${SITE_URL}${hubUrl.category(c.slug)}`, changeFrequency: "daily", priority: 0.6 })
  }
  for (const g of HUB_GROUPS) {
    routes.push({ url: `${SITE_URL}${hubUrl.group(g.slug)}`, changeFrequency: "daily", priority: 0.6 })
  }
  // 条件（働き方）ハブ。在庫が20件未満なら page 側で notFound になるため、
  // sitemap 掲載も HUB_FEATURES に登録したものだけに限る。
  for (const f of HUB_FEATURES) {
    routes.push({ url: `${SITE_URL}${hubUrl.feature(f.slug)}`, changeFrequency: "daily", priority: 0.6 })
  }
  return routes
}

const JOB_PAGE_SIZE = 100

// ビルド時固定を解消: 新規求人がデプロイなしでも1時間以内にsitemapへ載る
export const revalidate = 3600

const getAllJobsForSitemap = async (): Promise<Job[]> => {
  // NOTE: ここで catch して [] を返すと、CMS の一時障害時に「求人URLゼロのsitemap」が
  // 生成・キャッシュされ全求人がサイトマップから消える事故になる。
  // 失敗時は throw してキャッシュ済みの前回サイトマップ配信に任せる。
  const jobs: Job[] = []
  let offset = 0

  while (true) {
    const data = await microcmsClient.get<MicroCMSListResponse<Job>>({
      endpoint: "jobs",
      queries: {
        limit: JOB_PAGE_SIZE,
        offset,
        fields: "id,companyName,hideCompanyName,updatedAt,publishedAt",
      },
    })

    jobs.push(...data.contents)

    offset += data.limit
    if (offset >= data.totalCount) {
      break
    }
  }

  return jobs
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    // /search は noindex（src/app/search/page.tsx 参照）。無限にURLが生えるUI用ページで
    // index面の主役であるハブページと重複競合するため index させない方針。
    // noindex URL を sitemap に載せるとGSCで「送信されたURLに noindex が含まれています」
    // エラーになり、限られたクロール枠もハブ・求人詳細から奪うので掲載しない。
    {
      url: `${SITE_URL}/about`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ]

  const jobs = await getAllJobsForSitemap()

  const jobRoutes: MetadataRoute.Sitemap = jobs.map((job) => ({
    url: `${SITE_URL}/job/${job.id}`,
    lastModified: job.updatedAt ?? job.publishedAt ?? undefined,
    changeFrequency: "daily",
    priority: 0.7,
  }))

  // 維持下限を満たす企業ページだけをsitemapへ含める。件数の判定はページ側の index/noindex と同じ値。
  // 振り分けは上で取った jobs を使い回す（companyName と更新日は既に取れているので、
  // 企業ページ用の索引をもう一度引くと同じ全件取得が二重になる）。
  const companyJobIndex = new Map<string, Job[]>()
  for (const job of jobs) {
    const slug = companySlugForJob(job)
    if (!slug) continue
    const list = companyJobIndex.get(slug)
    if (list) list.push(job)
    else companyJobIndex.set(slug, [job])
  }
  const companyRoutes: MetadataRoute.Sitemap = FEATURED_COMPANIES.flatMap((company) => {
    const matchingJobs = companyJobIndex.get(company.slug) ?? []
    if (matchingJobs.length < COMPANY_KEEP_JOBS) return []

    const latestTimestamp = matchingJobs.reduce((latest, job) => {
      const value = job.updatedAt ?? job.publishedAt
      if (!value) return latest
      return Math.max(latest, new Date(value).getTime())
    }, 0)

    return [{
      url: `${SITE_URL}/companies/${company.slug}`,
      lastModified: latestTimestamp > 0 ? new Date(latestTimestamp) : undefined,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }]
  })

  const hubRoutes = await getHubRoutes()

  return [...staticRoutes, ...hubRoutes, ...companyRoutes, ...jobRoutes]
}
