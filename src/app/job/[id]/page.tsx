import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@/shared/ui/button"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import RidejobMediaSection from "@/features/media/components/ridejob-media-section"
import { getJob, getJobs } from "@/features/jobs/api"
import { AppError, ErrorType, withErrorHandling } from "@/shared/lib/error-handling"
import JobBreadcrumb from "../components/job-breadcrumb"
import JobTitleActions from "../components/job-title-actions"
import JobDescription from "../components/job-description"
import RelatedJobs from "../components/related-jobs"
import { getMediaArticles } from "@/features/media/api"
import { generateBreadcrumbStructuredData, generateJobMetadata, generateJobPostingStructuredData } from "@/shared/lib/metadata"
import JobViewTracker from "../components/job-view-tracker"

interface JobPageProps {
  params: Promise<{ id: string }>
}

// 最重要SEOページの毎リクエストSSRを解消（オンデマンドISR・1時間キャッシュ）。
// 求人更新の即時反映が必要になったら microCMS Webhook → revalidatePath(`/job/${id}`) を追加する。
export const revalidate = 3600

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { id } = await params

  try {
    const job = await withErrorHandling(() => getJob(id), "getJobMetadata")
    return generateJobMetadata(job)
  } catch (error) {
    if (error instanceof AppError && error.type === ErrorType.NOT_FOUND) {
      return {
        title: "求人が見つかりません",
        robots: {
          index: false,
          follow: false,
        },
      }
    }
    throw error
  }
}

export default async function JobPage({ params }: JobPageProps) {
  const { id } = await params
  let job: Awaited<ReturnType<typeof getJob>>
  try {
    job = await withErrorHandling(() => getJob(id), "getJob")
  } catch (error) {
    if (error instanceof AppError && error.type === ErrorType.NOT_FOUND) {
      notFound()
    }
    throw error
  }

  if (!job) {
    notFound()
  }

  const relatedJobsRaw = await withErrorHandling(
    () => getJobs({
      municipalityId: job.municipality?.id,
      prefectureId: job.municipality ? undefined : job.prefecture?.id,
      limit: 4,
    }),
    "getRelatedJobs"
  )
  const relatedJobs = relatedJobsRaw.filter((j) => j.id !== job.id).slice(0, 4)

  const { companyArticles, interviewArticles } = await withErrorHandling(
    () => getMediaArticles(),
    "getMediaArticles"
  )

  const jobPostingStructuredData = generateJobPostingStructuredData(job)
  const breadcrumbItems: Array<{ name: string; url?: string }> = [{ name: "トップページ", url: "/" }]

  if (job.prefecture?.id && job.prefecture.region) {
    breadcrumbItems.push({
      name: job.prefecture.region,
      url: `/search?prefecture=${job.prefecture.id}`,
    })
  }

  if (job.prefecture?.id && job.municipality?.id && job.municipality.name) {
    breadcrumbItems.push({
      name: job.municipality.name,
      url: `/search?prefecture=${job.prefecture.id}&municipality=${job.municipality.id}`,
    })
  }

  breadcrumbItems.push({ name: job.jobName ?? job.title ?? "求人詳細" })
  const breadcrumbStructuredData = generateBreadcrumbStructuredData(breadcrumbItems)

  return (
    <div className="min-h-screen bg-white">
      <JobViewTracker id={job.id} name={job.jobName ?? job.title ?? undefined} />
      {/* companyName の無い求人は markup を出さない（generateJobPostingStructuredData が null を返す） */}
      {jobPostingStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingStructuredData).replace(/</g, "\\u003c") }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData).replace(/</g, "\\u003c") }}
      />
      <SiteHeader />

      <JobBreadcrumb job={job} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8">
          <div>
            <JobTitleActions job={job} />

            <JobDescription job={job} />

            <RelatedJobs jobs={relatedJobs} title="類似求人" />
          </div>
        </div>
      </div>

      <RidejobMediaSection
        companyArticles={companyArticles}
        interviewArticles={interviewArticles}
      />
      {/* Mobile sticky apply button */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 p-3">
        <Link href={`/apply/${job.id}`} className="block">
          <Button className="w-full bg-red-500 hover:bg-red-600 text-white text-base py-3">
            応募画面へ進む
          </Button>
        </Link>
      </div>
      {/* Spacer to avoid content being hidden behind sticky bar on mobile */}
      <div className="h-20 sm:hidden" />
      <SiteFooter />
    </div>
  )
}
