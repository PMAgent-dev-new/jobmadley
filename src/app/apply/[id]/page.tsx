import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import ApplicationForm from "@/features/application/components/application-form"
import { getJob } from "@/features/jobs/api"
import type { JobDetail } from "@/features/jobs/types"
import { getExternalJob, parseExternalApplyId } from "@/features/external-jobs/api"
import { isExternalJobExpired } from "@/features/external-jobs/expiry"
import { isExternalMetaCatalogJob } from "@/features/external-jobs/catalog-eligibility"
import { MECHANIC_APPLY_EMAIL } from "@/shared/lark/routing"
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
    if (!e || isExternalJobExpired(e.expiresAt, e.lastSeen)) notFound()
    const isMechanic = ["自動車整備士", "バイク整備士"].includes(e.jobCategory || "")
    const externalJob: JobDetail = {
      id,
      title: e.title ?? "求人",
      jobName: e.title,
      jobCategory: {
        id: isMechanic ? "external-mechanic" : "external-job",
        name: e.jobCategory || "求人",
      },
      // 社名はクライアントへ渡さない。ApplicationForm は "use client" なので、
      // 画面に出さなくても props はRSCペイロードに載り、ページのソースから読めてしまう。
      // 社内通知に必要な実名は submit-application が jobId から サーバー側で引き直す。
      companyName: undefined,
      salaryMin: e.salaryMin,
      salaryMax: e.salaryMax,
      employmentType: e.employmentType ? [e.employmentType] : undefined,
      workHours: e.workHours,
      descriptionWork: e.description,
      addressPrefMuni: e.prefecture,
      addressLine: e.address,
      applyEmail: isMechanic ? MECHANIC_APPLY_EMAIL : undefined,
    }
    return (
      <Suspense fallback={<div>読み込み中...</div>}>
        <ApplicationForm
          job={externalJob}
          catalogItemId={isMechanic && isExternalMetaCatalogJob(e) ? external.sourceId : null}
          mode={isMechanic ? "consult" : "apply"}
          jobDetailPath={`/external-job/${external.source}/${external.sourceId}`}
        />
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
