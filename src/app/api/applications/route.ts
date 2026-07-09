import { NextResponse } from "next/server"
import { appendFile } from "fs/promises"
import path from "path"
import { normalizeApplication, type NormalizedApplication } from "@/features/application/normalize"
import { microcmsClient } from "@/shared/microcms/client"
import type { MicroCMSListResponse } from "@/shared/microcms/types"
import { sendToLark } from "@/shared/lark/client"
import {
  detectCpOne,
  detectMechanic,
  detectPmAgent,
  resolveBaseTarget,
  resolveKyujinboxNotificationTarget,
  type NotificationTarget,
} from "@/shared/lark/routing"
import { notifyLark } from "@/shared/lark/notify"
import { createBitableRecord, type BitableCreateResult } from "@/shared/lark/bitable"
import {
  buildFieldsForService,
  normalizeApplicantGender,
  normalizeApplicantPrefecture,
  resolveApplicationSourceRecordId,
  resolveRidejobCompanyRecordId,
  type ApplicationFields,
} from "@/shared/lark/bitable-schema"
import { notifyBaseRegistrationError } from "@/shared/lark/alert"
import { sendMail } from "@/shared/mail/gmail"
import { buildApplicantAutoReply, isValidEmail } from "@/shared/mail/applicantAutoReply"
import { sendApplicantSms, type SmsChannel } from "@/shared/sms/applicantSms"

interface Applicant {
  firstName: string
  lastName: string
  firstNameKana?: string
  lastNameKana?: string
  pronunciationFirstName?: string
  pronunciationLastName?: string
  email: string
  phone?: string
  phoneNumber?: string
  birthday: string
  gender: string
  address?: string
  prefecture?: string
  city?: string
  occupation: string
  fullName?: string
  pronunciationFullName?: string
  coverLetter?: string
}

interface JobInfo {
  id?: string
  title?: string
  url?: string
  companyName?: string
  location?: string
  jobId?: string
  jobTitle?: string
  jobUrl?: string
  jobCompany?: string
  jobLocation?: string
}

interface QuestionAndAnswer {
  questionId: string
  question: string
  answer: string
}

interface QuestionsAndAnswersWrapper {
  url?: string
  retrievedOnMillis?: number
  questionsAndAnswers: QuestionAndAnswer[]
}

interface ApplicationData {
  id: string
  appliedOnMillis: number
  job: JobInfo
  applicant: Applicant
  analytics: { userAgent: string; ipAddress: string; referrer: string }
  questionsAndAnswers: QuestionAndAnswer[] | QuestionsAndAnswersWrapper
}

const formatValue = (value: string | undefined | null, defaultValue = "未設定"): string =>
  value && value !== "undefined" && value !== "" ? value : defaultValue

const formatName = (
  lastName: string | undefined,
  firstName: string | undefined,
  lastNameKana?: string,
  firstNameKana?: string,
): string => {
  const fullName = `${formatValue(lastName)} ${formatValue(firstName)}`
  const fullNameKana = `${formatValue(lastNameKana)} ${formatValue(firstNameKana)}`
  if (lastNameKana && firstNameKana && lastNameKana !== "undefined" && firstNameKana !== "undefined") {
    return `${fullName} (${fullNameKana})`
  }
  return fullName
}

const formatLarkMessage = (data: ApplicationData) => ({
  msg_type: "interactive",
  card: {
    elements: [
      { tag: "div", text: { tag: "lark_md", content: `🎯 求人ボックスから応募がありました！` } },
      { tag: "hr" },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**👤 応募者情報**\n氏名: ${formatName(
            data.applicant.lastName,
            data.applicant.firstName,
            data.applicant.pronunciationLastName,
            data.applicant.pronunciationFirstName,
          )}\n生年月日: ${formatValue(data.applicant.birthday)}\n性別: ${
            data.applicant.gender === "male" || data.applicant.gender === "男性"
              ? "男性"
              : data.applicant.gender === "female" || data.applicant.gender === "女性"
                ? "女性"
                : formatValue(data.applicant.gender)
          }\n職業: ${formatValue(data.applicant.occupation)}\n住所: ${formatValue(
            data.applicant.prefecture || "",
          )}${data.applicant.city ? ` ${data.applicant.city}` : ""}\nメール: ${formatValue(
            data.applicant.email,
          )}\n電話: ${formatValue(data.applicant.phone || data.applicant.phoneNumber || "")}`,
        },
      },
      { tag: "hr" },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**💼 求人情報**\n求人ID: ${formatValue(
            data.job.id || data.job.jobId,
          )}\n求人タイトル: ${formatValue(data.job.title || data.job.jobTitle)}\n会社名: ${formatValue(
            data.job.companyName || data.job.jobCompany,
          )}\n勤務地: ${formatValue(data.job.location || data.job.jobLocation)}\n求人URL: ${formatValue(
            data.job.url || data.job.jobUrl,
          )}`,
        },
      },
    ],
  },
})

const formatRawDataMessage = (data: { id?: string; appliedOnMillis?: number; [key: string]: unknown }) => {
  const appliedDate = new Date(data.appliedOnMillis || Date.now()).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  return {
    msg_type: "interactive",
    card: {
      elements: [
        {
          tag: "div",
          text: { tag: "lark_md", content: `**📋 生データ応募通知**\n応募ID: ${data.id}\n応募日時: ${appliedDate}` },
        },
        { tag: "hr" },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**📊 受信した生データ (JSON形式)**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          },
        },
      ],
    },
  }
}

const formatErrorLarkMessage = (title: string, description: string, details?: unknown) => {
  const elements: Array<Record<string, unknown>> = [
    { tag: "div", text: { tag: "lark_md", content: `**${title}**\n${description}` } },
  ]
  if (details != null) {
    elements.push({ tag: "hr" })
    if (typeof details === "string") {
      elements.push({ tag: "div", text: { tag: "lark_md", content: details } })
    } else {
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\`` },
      })
    }
  }
  return { msg_type: "interactive", card: { elements } }
}

const buildBitableFieldsFromNormalized = (
  normalized: NormalizedApplication,
  rawBody: { analytics?: { userAgent?: string; referrer?: string; ip?: string; ipAddress?: string } },
): ApplicationFields => {
  const { applicant, job } = normalized
  const qa = (normalized.questionsAndAnswers || []).map((q) => ({ question: q.question, answer: q.answer }))
  // 性別/市区町村は専用列へ。都道府県は標準47名に一致した時だけ列へ、不一致は生値をメモに残す。
  const prefecture = normalizeApplicantPrefecture(applicant.prefecture)
  const rawPrefecture = applicant.prefecture?.trim()
  const extraNotes: string[] = ["流入チャネル: 求人ボックス"]
  if (normalized.id) extraNotes.push(`応募ID: ${normalized.id}`)
  if (applicant.occupation) extraNotes.push(`職業: ${applicant.occupation}`)
  if (rawPrefecture && !prefecture) extraNotes.push(`都道府県(未照合): ${rawPrefecture}`)
  if (qa.length > 0) extraNotes.push(`質問回答: ${JSON.stringify(qa)}`)
  if (rawBody?.analytics?.referrer) extraNotes.push(`リファラ: ${rawBody.analytics.referrer}`)

  return {
    lastName: applicant.lastName,
    firstName: applicant.firstName,
    lastNameKana: applicant.lastNameKana,
    firstNameKana: applicant.firstNameKana,
    birthDate: applicant.birthday,
    phone: applicant.phone,
    email: applicant.email,
    jobId: job.id,
    jobName: job.title,
    jobUrl: job.url,
    companyName: job.companyName,
    jobLocation: job.location,
    applicationSource: "kyujinbox",
    gender: normalizeApplicantGender(applicant.gender),
    prefecture,
    city: applicant.city,
    appliedAtMillis: normalized.appliedOnMillis ?? Date.now(),
    extraNotes,
  }
}

const appendDevLog = async (label: string, payload: unknown): Promise<void> => {
  try {
    const logPath = path.join(process.cwd(), "dev.log")
    const sep = "=".repeat(80)
    const entry = `\n${sep}\n[${new Date().toISOString()}] [applications] ${label}\n${
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)
    }\n`
    await appendFile(logPath, entry)
  } catch (error) {
    console.error(`[applications] Failed to append ${label} to dev.log:`, error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, any>

    const companyName: string = body?.job?.companyName || body?.job?.jobCompany || ""
    const isCpOne = detectCpOne(companyName)
    let isMechanic = false
    let webhookUrl: string | undefined
    let notifyTarget: NotificationTarget | undefined

    await appendDevLog("Incoming Request Body", body)

    // job.id または job.jobId の必須チェック
    const jobId: string | undefined = body?.job?.id ?? body?.job?.jobId
    if (!jobId || typeof jobId !== "string" || jobId.trim() === "") {
      return NextResponse.json(
        { success: false, message: "Bad Request: job.id or job.jobId is required" },
        { status: 400 },
      )
    }

    // microCMS 上の求人存在確認 + applyEmail 取得
    try {
      const r = await microcmsClient.get<MicroCMSListResponse<{ id: string; applyEmail?: string }>>({
        endpoint: "jobs",
        queries: { limit: 1, fields: ["id", "applyEmail"], filters: `id[equals]${jobId}` },
      })
      if (!r || typeof r.totalCount !== "number" || r.totalCount === 0) {
        // 求人未存在通知
        const fallbackWebhook = resolveKyujinboxNotificationTarget({ isCpOne: false, isMechanic: false }).url
        if (fallbackWebhook) {
          const applicantName =
            `${body?.applicant?.lastName ?? ""} ${body?.applicant?.firstName ?? ""}`.trim() ||
            formatValue(body?.applicant?.fullName)
          const applicantKana =
            `${body?.applicant?.lastNameKana ?? ""} ${body?.applicant?.firstNameKana ?? ""}`.trim() ||
            `${body?.applicant?.pronunciationLastName ?? ""} ${body?.applicant?.pronunciationFirstName ?? ""}`.trim() ||
            "未設定"
          const applicantAddress =
            (body?.applicant?.address && String(body.applicant.address)) ||
            [body?.applicant?.prefecture, body?.applicant?.city].filter(Boolean).join(" ") ||
            "未設定"
          const applicantPhone = body?.applicant?.phone ?? body?.applicant?.phoneNumber ?? ""
          const detailsText = [
            `求人タイトル: ${formatValue(body?.job?.title ?? body?.job?.jobTitle)}`,
            `会社名: ${formatValue(body?.job?.companyName ?? body?.job?.jobCompany)}`,
            `勤務地: ${formatValue(body?.job?.location ?? body?.job?.jobLocation)}`,
            ``,
            `**応募者情報**`,
            `氏名: ${formatValue(applicantName)}`,
            `ふりがな: ${formatValue(applicantKana)}`,
            `生年月日: ${formatValue(body?.applicant?.birthday)}`,
            `住所: ${formatValue(applicantAddress)}`,
            `電話番号: ${formatValue(applicantPhone)}`,
          ].join("\n")
          const errorMessage = formatErrorLarkMessage(
            "❌ 求人未存在エラー",
            "求人ボックスから応募がありましたが、ライドジョブ内で求人が見つかりませんでした。",
            detailsText,
          )
          await sendToLark(fallbackWebhook, errorMessage, "applications:job_not_found")
        }
        // 2xxでリトライ抑止
        return NextResponse.json(
          {
            success: true,
            error: "JOB_NOT_FOUND",
            notification: fallbackWebhook ? { sent: true } : { sent: false, reason: "Webhook not configured" },
          },
          { status: 200 },
        )
      }

      const fetchedApplyEmail = r.contents[0]?.applyEmail ?? ""
      isMechanic = detectMechanic(fetchedApplyEmail)
      notifyTarget = resolveKyujinboxNotificationTarget({ isCpOne, isMechanic })
      webhookUrl = notifyTarget.url
    } catch (e) {
      console.error("[applications] Failed to verify job on microCMS:", e)
      return NextResponse.json({ success: false, message: "Upstream error while verifying job" }, { status: 502 })
    }

    console.log("[applications] Received application data:", body)

    if (!webhookUrl) {
      console.error("[applications] LARK_WEBHOOK environment variable is not set")
      return NextResponse.json({ success: false, message: "Webhook configuration error" }, { status: 500 })
    }

    // 生データの場合は特別処理
    if (body.isRawData) {
      console.log("[applications] Processing raw data for Lark")
      const result = await sendToLark(webhookUrl, formatRawDataMessage(body), "applications:raw")
      if (!result.ok) {
        return NextResponse.json(
          { success: false, message: "Failed to send raw data to Lark" },
          { status: result.status || 502 },
        )
      }
      return NextResponse.json({ success: true })
    }

    // 通常応募: 正規化 → 通知用ペイロード作成 → 送信
    const normalized: NormalizedApplication = normalizeApplication(body)
    const mappedForFormatter: ApplicationData = {
      id: normalized.id ?? "",
      appliedOnMillis: normalized.appliedOnMillis ?? Date.now(),
      job: {
        id: normalized.job.id,
        title: normalized.job.title,
        url: normalized.job.url,
        companyName: normalized.job.companyName,
        location: normalized.job.location,
      },
      applicant: {
        firstName: normalized.applicant.firstName,
        lastName: normalized.applicant.lastName,
        firstNameKana: normalized.applicant.firstNameKana ?? "",
        lastNameKana: normalized.applicant.lastNameKana ?? "",
        email: normalized.applicant.email,
        phone: normalized.applicant.phone ?? "",
        birthday: normalized.applicant.birthday ?? "",
        gender: typeof normalized.applicant.gender === "string" ? normalized.applicant.gender : "",
        prefecture: normalized.applicant.prefecture ?? "",
        city: normalized.applicant.city ?? "",
        address: [normalized.applicant.prefecture, normalized.applicant.city].filter(Boolean).join(" "),
        occupation: normalized.applicant.occupation ?? "",
      },
      analytics: {
        userAgent: body?.analytics?.userAgent ?? "",
        ipAddress: body?.analytics?.ip ?? body?.analytics?.ipAddress ?? "",
        referrer: body?.analytics?.referrer ?? "",
      },
      questionsAndAnswers: (normalized.questionsAndAnswers || []).map((qa, idx) => ({
        questionId: String(idx + 1),
        question: qa.question,
        answer: qa.answer,
      })),
    }

    const notifyResult = await notifyLark({
      api: { service: notifyTarget?.service ?? "ridejob", chatId: notifyTarget?.chatId },
      webhookUrl,
      payload: formatLarkMessage(mappedForFormatter),
      context: "applications:notify",
    })
    if (!notifyResult.ok) {
      return NextResponse.json({ success: false, message: "Failed to send notification to Lark" }, { status: 502 })
    }
    console.log("[applications] Notification sent", { via: notifyResult.via })

    // 応募者向け自動返信（非致命。email 不正時はスキップ。生データ/求人未存在は既に return 済み）
    if (isValidEmail(normalized.applicant.email)) {
      const mail = buildApplicantAutoReply(
        { isCpOne, isMechanic, isPmAgent: detectPmAgent(companyName) },
        {
          email: normalized.applicant.email,
          name: `${normalized.applicant.lastName ?? ""} ${normalized.applicant.firstName ?? ""}`.trim(),
          companyName: normalized.job.companyName,
          jobName: normalized.job.title,
        },
      )
      const mailResult = await sendMail(mail, "applications:applicant")
      if (!mailResult.ok && !mailResult.skipped) {
        console.warn("[applications] Applicant auto-reply mail failed, but proceeding")
      }
    } else {
      console.log("[applications] applicant email missing or invalid, skipping auto-reply")
    }

    // 応募者向け自動SMS（非致命。電話不正/トークン未設定時はスキップ）
    const smsChannel: SmsChannel = isMechanic ? "mechanic" : "ridejob"
    const smsResult = await sendApplicantSms(
      {
        phone: normalized.applicant.phone,
        channel: smsChannel,
        applicantName: `${normalized.applicant.lastName ?? ""} ${normalized.applicant.firstName ?? ""}`.trim(),
        media: "kyujinbox",
      },
      "applications:applicant",
    )
    if (!smsResult.ok && !smsResult.skipped) {
      console.warn("[applications] Applicant SMS failed, but proceeding")
    }

    // Base登録 (bitable API)
    const baseTarget = resolveBaseTarget({ isCpOne, isMechanic })
    const bitableFields = buildBitableFieldsFromNormalized(normalized, body)
    if (baseTarget.service === "ridejob" && bitableFields.companyName) {
      try {
        bitableFields.companyRecordId = await resolveRidejobCompanyRecordId(bitableFields.companyName)
        console.log(
          bitableFields.companyRecordId
            ? `[applications] 得意先CRM linked: ${bitableFields.companyName} -> ${bitableFields.companyRecordId}`
            : `[applications] 得意先CRM not found for company: ${bitableFields.companyName}`,
        )
      } catch (error) {
        console.warn("[applications] 得意先CRM lookup failed", error)
      }
    }
    if (baseTarget.service === "ridejob" || baseTarget.service === "mechanic") {
      try {
        bitableFields.applicationSourceRecordId = await resolveApplicationSourceRecordId(
          baseTarget.service,
          bitableFields.applicationSource,
        )
      } catch (error) {
        console.warn("[applications] 応募経由マスタ lookup failed", error)
      }
    }
    const bitableInput = buildFieldsForService(baseTarget.service, bitableFields)
    await appendDevLog("Lark Bitable Payload", {
      service: baseTarget.service,
      tableId: baseTarget.tableId,
      fields: bitableInput,
    })
    const baseResult = await createBitableRecord({
      service: baseTarget.service,
      tableId: baseTarget.tableId,
      fields: bitableInput,
    }).catch((error: unknown): BitableCreateResult => ({
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "bitable error",
    }))
    if (!baseResult.ok) {
      await notifyBaseRegistrationError({
        route: "applications",
        service: baseTarget.service,
        tableId: baseTarget.tableId,
        status: baseResult.status,
        code: baseResult.code,
        message: baseResult.message,
        applicant: {
          name: `${normalized.applicant.lastName || ""} ${normalized.applicant.firstName || ""}`.trim() || undefined,
          phone: normalized.applicant.phone,
          email: normalized.applicant.email,
        },
        job: {
          id: normalized.job.id,
          name: normalized.job.title,
          url: normalized.job.url,
        },
      }).catch((error) => console.error("[alert] notifyBaseRegistrationError failed", error))
      return NextResponse.json({
        success: true,
        base: { sent: false, status: baseResult.status, code: baseResult.code, msg: baseResult.message },
      })
    }
    return NextResponse.json({
      success: true,
      base: { sent: true, status: baseResult.status, code: baseResult.code ?? 0, recordId: baseResult.recordId },
    })
  } catch (error) {
    console.error("[applications] Error processing application:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
