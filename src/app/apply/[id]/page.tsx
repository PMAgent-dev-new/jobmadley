import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ApplicationForm from "@/features/application/components/application-form"
import { getJob } from "@/features/jobs/api"
import type { JobDetail } from "@/features/jobs/types"
import { getExternalJob, parseExternalApplyId } from "@/features/external-jobs/api"
import { AppError, ErrorType, withErrorHandling } from "@/shared/lib/error-handling"

interface ApplicationPageProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default async function ApplicationPage({ params }: ApplicationPageProps) {
  const { id } = await params

  // 提携媒体から取り込んだ求人（IDに接頭辞あり）は Supabase から解決して同じ応募フォームに渡す。
  // 自社求人の経路は従来どおり（下の分岐・変更なし）。
  const external = parseExternalApplyId(id)
  if (external) {
    const e = await getExternalJob(external.source, external.sourceId)
    if (!e) notFound()
    const externalJob: JobDetail = {
      id,
      title: e.title ?? "求人",
      jobName: e.title,
      companyName: e.companyName,
      salaryMin: e.salaryMin,
      salaryMax: e.salaryMax,
      employmentType: e.employmentType ? [e.employmentType] : undefined,
      workHours: e.workHours,
      descriptionWork: e.description,
      addressPrefMuni: e.prefecture,
      addressLine: e.address,
    }
    return (
      <Suspense fallback={<div>読み込み中...</div>}>
        <ApplicationForm job={externalJob} />
      </Suspense>
    )
  }

  let job: Awaited<ReturnType<typeof getJob>>
  try {
    job = await withErrorHandling(
      () => getJob(id),
      "getJobForApply"
    )
  } catch (error) {
    if (error instanceof AppError && error.type === ErrorType.NOT_FOUND) {
      notFound()
    }
    throw error
  }

  if (!job) {
    notFound()
  }

  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <ApplicationForm job={job} />
    </Suspense>
  )
}
