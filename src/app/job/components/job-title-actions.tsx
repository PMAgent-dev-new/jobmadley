import Link from "next/link"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { isNew, formatSalary, formatDate, companySearchQuery } from "@/shared/lib/utils"
import type { JobDetail } from "@/features/jobs/types"

interface JobTitleActionsProps {
  job: JobDetail
  applyUrl?: string
  showApplyButton?: boolean
}

export default function JobTitleActions({ job, applyUrl, showApplyButton = true }: JobTitleActionsProps) {
  const isNewJob = isNew(job.publishedAt, job.createdAt)
  const salaryText = formatSalary(job.salaryMin, job.salaryMax, job.wageType)

  return (
    <div className="mb-8">
      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="sm:flex-1">
          <div className="flex items-center mb-2">
            {isNewJob && <Badge className="bg-red-500 text-white mr-2">NEW</Badge>}
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-1">
            {job.jobName ?? job.title}
          </h1>
          {job.companyName && !job.hideCompanyName ? (
            // 会社名でキーワード検索（同一企業・グループの他求人へ回遊）。
            // 旧実装は href="#" のデッドリンクで、リンク価値もUXも失っていた。
            <Link
              href={`/search?q=${encodeURIComponent(companySearchQuery(job.companyName))}`}
              className="text-blue-600 hover:underline"
            >
              {job.companyName}
            </Link>
          ) : (
            <span className="text-gray-700">{job.companyName ?? "会社情報なし"}</span>
          )}
          {job.tags && job.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {job.tags.map((tag) => (
                <Badge key={tag.id} className="bg-gray-100 text-gray-600" variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {showApplyButton && (
          <div className="hidden sm:flex sm:w-auto flex-col space-y-3 sm:ml-6">
            <Link
              href={applyUrl ?? `/apply/${job.id}`}
              className="block w-full sm:w-auto"
            >
              <Button
                className="w-full sm:w-auto bg-red-500 hover:bg-red-600 text-white px-8 py-3 text-lg"
              >
                応募画面へ進む
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded-lg inline-block mb-4">
        {salaryText}
      </div>
      
      {job.updatedAt && (
        <p className="text-sm text-gray-500">
          最終更新日 {formatDate(job.updatedAt)}
        </p>
      )}
    </div>
  )
} 