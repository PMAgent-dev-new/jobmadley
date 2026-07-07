import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import type { JobDetail } from "@/features/jobs/types"

interface JobBreadcrumbProps {
  job: JobDetail
}

export default function JobBreadcrumb({ job }: JobBreadcrumbProps) {
  const jobCategoryName = job.jobCategory?.name
  const prefectureId = job.prefecture?.id ?? ""
  const prefectureName = job.prefecture?.region ?? ""
  const prefectureSlug = job.prefecture?.slug
  const municipalityId = job.municipality?.id ?? ""
  const municipalityName = job.municipality?.name ?? ""
  const jobCategorySlug = job.jobCategory?.slug
  const companyName = job.companyName ?? ""

  // 地域はハブへ（slug があれば）、無ければ従来の検索へフォールバック
  const prefectureHref = prefectureSlug
    ? `/jobs/${prefectureSlug}`
    : `/search?prefecture=${prefectureId}`
  // 職種は、県×職種ハブ（最も関連が近い）→ 職種全国ハブ の順でリンク
  const jobCategoryHref =
    prefectureSlug && jobCategorySlug
      ? `/jobs/${prefectureSlug}/${jobCategorySlug}`
      : jobCategorySlug
        ? `/jobs/category/${jobCategorySlug}`
        : undefined

  const lastCrumbText = companyName && jobCategoryName
    ? `${companyName}の${jobCategoryName}求人`
    : companyName
      ? `${companyName}の求人`
      : jobCategoryName
        ? `${jobCategoryName}求人`
        : "求人詳細"

  return (
    <nav aria-label="パンくずリスト" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600 sm:gap-2">
        <Link href="/" className="flex items-center hover:text-blue-600" aria-label="トップページ">
          <Home className="w-5 h-5 shrink-0 sm:w-4 sm:h-4" />
        </Link>
        {prefectureId && (
          <>
            <ChevronRight className="w-4 h-4 mx-1 shrink-0" />
            <Link href={prefectureHref} className="hover:text-blue-600 whitespace-nowrap">
              {prefectureName}
            </Link>
          </>
        )}
        {municipalityId && (
          <>
            <ChevronRight className="w-4 h-4 mx-1 shrink-0" />
            <Link href={`/search?prefecture=${prefectureId}&municipality=${municipalityId}`} className="hover:text-blue-600 whitespace-nowrap">
              {municipalityName}
            </Link>
          </>
        )}
        {jobCategoryName && jobCategoryHref && (
          <>
            <ChevronRight className="w-4 h-4 mx-1 shrink-0" />
            <Link href={jobCategoryHref} className="hover:text-blue-600 whitespace-nowrap">
              {jobCategoryName}
            </Link>
          </>
        )}
        <ChevronRight className="w-4 h-4 mx-1 shrink-0" />
        {/* モバイルでは basis-full で必ず独立行・全幅に折り返す（flex-1 だと残り数pxに押し潰されCJKが1文字ずつ縦積みになる）。sm 以上は従来通り横並びで伸長。 */}
        <span className="min-w-0 basis-full sm:basis-auto sm:flex-1 whitespace-normal break-words text-gray-800">{lastCrumbText}</span>
      </div>
    </nav>
  )
}
