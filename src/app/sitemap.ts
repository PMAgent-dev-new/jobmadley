import type { MetadataRoute } from "next"
import { SITE_URL } from "@/shared/lib/metadata"
import { microcmsClient } from "@/shared/microcms/client"
import type { Job } from "@/features/jobs/types"
import type { MicroCMSListResponse } from "@/shared/microcms/types"
import {
  HUB_MIN_JOBS,
  HUB_GROUPS,
  hubUrl,
  prefCatCount,
  withSlug,
  getHubData,
} from "@/features/hub/lib/hub"
import { FEATURED_COMPANIES, matchesFeaturedCompany } from "@/features/companies/data"
import { getExternalHubCounts, qualifiesByExternalJobs } from "@/features/external-jobs/api"

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
  for (const c of withSlug(categories)) {
    routes.push({ url: `${SITE_URL}${hubUrl.category(c.slug)}`, changeFrequency: "daily", priority: 0.6 })
  }
  for (const g of HUB_GROUPS) {
    routes.push({ url: `${SITE_URL}${hubUrl.group(g.slug)}`, changeFrequency: "daily", priority: 0.6 })
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

  // 求人がある企業ページだけをsitemapへ含める。0件ページはページ側でもnoindex。
  const companyRoutes: MetadataRoute.Sitemap = FEATURED_COMPANIES.flatMap((company) => {
    const matchingJobs = jobs.filter(
      (job) => !job.hideCompanyName && matchesFeaturedCompany(job.companyName, company),
    )
    if (matchingJobs.length === 0) return []

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
