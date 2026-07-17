"use client"

import { useEffect, useRef, useState } from "react"
import Script from "next/script"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/shared/ui/button"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import type { ApplicationFormData } from "@/features/application/types"
import type { JobDetail } from "@/features/jobs/types"
import { applicationFormSchema, type ApplicationFormValues } from "@/features/application/schema"
import { useApplySourceCapture } from "@/features/application/hooks/useApplySourceCapture"
import {
  buildBirthDate,
  postApplication,
  pushStandbyCv,
  resolveApplicationCompleteUrl,
  resolveApplyContext,
} from "@/features/application/lib/submitApplication"
import { genEventId, trackMeta } from "@/shared/lib/meta-pixel"
import { ApplicantFields } from "@/features/application/components/applicant-fields"
import { BirthDateSelect } from "@/features/application/components/birth-date-select"
import { ConsentSection } from "@/features/application/components/consent-section"
import { isMetaCatalogJob } from "@/shared/lib/catalog-eligibility"

export interface ApplicationFormProps {
  job: JobDetail | null
}

export default function ApplicationForm({ job }: ApplicationFormProps) {
  const catalogEligible = job ? isMetaCatalogJob(job) : false
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
  })

  const [agreement, setAgreement] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const hasPushedStandbyCv = useRef(false)

  useApplySourceCapture()

  // 応募フォーム表示時に Meta AddToCart（応募開始）を発火
  useEffect(() => {
    if (job?.id) {
      trackMeta("AddToCart", {
        contentIds: catalogEligible ? [job.id] : undefined,
        contentName: job.jobName ?? undefined,
        value: 0,
        currency: "JPY",
      })
    }
  }, [catalogEligible, job?.id, job?.jobName])

  const onSubmit = async (data: ApplicationFormValues) => {
    if (isLoading) return

    setIsLoading(true)
    try {
      const {
        applicationSource,
        jobUrl,
        utmSource,
        utmMedium,
        utmSourceFirst,
        utmMediumFirst,
        utmCampaign,
        utmLastTouchAt,
        utmFirstTouchAt,
        fbclid,
        gclid,
      } = resolveApplyContext()

      const applicationData: ApplicationFormData = {
        lastName: data.lastName,
        firstName: data.firstName,
        lastNameKana: data.lastNameKana,
        firstNameKana: data.firstNameKana,
        birthDate: buildBirthDate(data.birthYear, data.birthMonth, data.birthDay),
        phone: data.phone,
        email: data.email,
        companyName: job?.companyName || "",
        jobName: job?.jobName || "",
        jobCategoryName: job?.jobCategory?.name || "",
        jobUrl,
        applicationSource,
        utmSource,
        utmMedium,
        utmSourceFirst,
        utmMediumFirst,
        utmCampaign,
        utmLastTouchAt,
        utmFirstTouchAt,
        fbclid,
        gclid,
      }

      const metaEventId = genEventId()
      await postApplication({
        ...applicationData,
        jobId: job?.id ?? "",
        applyEmail: job?.applyEmail ?? "",
        applicationSource,
        metaEventId,
      })

      // 送信成功時に Meta Lead を発火（サーバーCAPIと同一 eventId で重複排除）
      trackMeta(
        "Lead",
        {
          contentIds: catalogEligible && job?.id ? [job.id] : undefined,
          contentName: job?.jobName ?? undefined,
          value: 0,
          currency: "JPY",
        },
        metaEventId,
      )

      if (applicationSource === "standby" && !hasPushedStandbyCv.current) {
        pushStandbyCv({
          jobId: job?.id ?? "",
          jobName: job?.jobName ?? "",
          companyName: job?.companyName ?? "",
          jobUrl,
          source: applicationSource,
        })
        hasPushedStandbyCv.current = true
      }
      window.location.assign(resolveApplicationCompleteUrl(job?.applyEmail))
    } catch (err) {
      alert("応募送信に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Script
        id="standby-cv-tracker"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `!function(){window.STANBY_CV=window.STANBY_CV||{},window.STANBY_CV.send=function(t,n){try{var e=new XMLHttpRequest;e.open("POST",i),e.setRequestHeader("Content-Type","application/json"),e.withCredentials=!0,e.timeout=1e4,e.send(function(t,n){var e=window.localStorage.getItem("stb_uid");return JSON.stringify({siteCode:t,accountId:n||null,uid:e||null,trackingVersion:"2"})}(t,n))}catch(t){}};var i="https://cv-tracker.stanby.com/v1/cv"}();`
        }}
      />
      <SiteHeader />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 求人情報表示 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">
            {job?.companyName} {job?.jobName} に応募する
          </h1>
        </div>

        {/* 基本情報セクション */}
        <div className="bg-gray-50 p-6 rounded-lg mb-8">
          {/* react-hook-form の handleSubmit は render 時に onSubmit を呼ばず、返り値のハンドラが
              submit 時にのみ実行する。onSubmit 内の hasPushedStandbyCv ref 参照を「render 中の ref
              アクセス」と見なす react-hooks/refs の false positive のため、この行のみ抑制する。 */}
          {/* eslint-disable-next-line react-hooks/refs */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <ApplicantFields register={register} errors={errors} />
            <BirthDateSelect setValue={setValue} errors={errors} />
            <ConsentSection
              checked={agreement}
              onChange={(checked) => {
                setAgreement(checked)
                setValue("agreement", checked)
              }}
              errors={errors}
            />

            {/* 応募ボタン */}
            <div className="text-center pt-6">
              <Button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="bg-red-500 hover:bg-red-600 text-white px-12 py-3 rounded-md text-lg font-medium"
              >
                {(isSubmitting || isLoading) ? "送信中..." : "応募する"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
