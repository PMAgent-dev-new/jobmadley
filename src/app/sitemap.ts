import type { MetadataRoute } from "next"
import { SITE_URL } from "@/shared/lib/metadata"
import { microcmsClient } from "@/shared/microcms/client"
import type { Job } from "@/features/jobs/types"
import type { MicroCMSListResponse } from "@/shared/microcms/types"

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
        fields: "id,updatedAt,publishedAt",
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
    {
      url: `${SITE_URL}/search`,
      changeFrequency: "daily",
      priority: 0.8,
    },
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

  return [...staticRoutes, ...jobRoutes]
}
