// Base 登録などの失敗を運用チャンネルに通知するためのアラート送信。

import { larkEnv, type LarkServiceId } from "@/shared/config/env"
import { sendToLark } from "@/shared/lark/client"

interface BaseRegistrationFailure {
  route: "submit-application" | "applications"
  service: LarkServiceId
  tableId: string
  status: number
  code?: number
  message?: string
  applicant?: { name?: string; phone?: string; email?: string }
  job?: { id?: string; name?: string; url?: string }
}

export const notifyBaseRegistrationError = async (failure: BaseRegistrationFailure): Promise<void> => {
  const webhookUrl = larkEnv.errorAlert()
  if (!webhookUrl) {
    console.warn("[alert] LARK_WEBHOOK_ERROR_ALERT が未設定のためエラー通知をスキップします")
    return
  }

  const occurredAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
  const summary = [
    `route: ${failure.route}`,
    `service: ${failure.service}`,
    `tableId: ${failure.tableId}`,
    `status: ${failure.status}`,
    failure.code != null ? `code: ${failure.code}` : null,
    failure.message ? `message: ${failure.message}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const applicantLines: string[] = []
  if (failure.applicant?.name) applicantLines.push(`氏名: ${failure.applicant.name}`)
  if (failure.applicant?.phone) applicantLines.push(`電話: ${failure.applicant.phone}`)
  if (failure.applicant?.email) applicantLines.push(`メール: ${failure.applicant.email}`)

  const jobLines: string[] = []
  if (failure.job?.id) jobLines.push(`求人ID: ${failure.job.id}`)
  if (failure.job?.name) jobLines.push(`求人名: ${failure.job.name}`)
  if (failure.job?.url) jobLines.push(`求人URL: ${failure.job.url}`)

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**🚨 Lark Base 登録に失敗しました**\n発生時刻: ${occurredAt}`,
      },
    },
    { tag: "hr" },
    { tag: "div", text: { tag: "lark_md", content: `**詳細**\n${summary}` } },
  ]
  if (applicantLines.length > 0) {
    elements.push(
      { tag: "hr" },
      { tag: "div", text: { tag: "lark_md", content: `**応募者**\n${applicantLines.join("\n")}` } },
    )
  }
  if (jobLines.length > 0) {
    elements.push(
      { tag: "hr" },
      { tag: "div", text: { tag: "lark_md", content: `**求人**\n${jobLines.join("\n")}` } },
    )
  }

  await sendToLark(webhookUrl, { msg_type: "interactive", card: { elements } }, "alert:base_registration")
}
