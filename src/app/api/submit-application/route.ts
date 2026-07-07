import { NextResponse } from "next/server"
import { sendToLark } from "@/shared/lark/client"
import {
  classifyChannel,
  detectCpOne,
  detectMechanic,
  detectPmAgent,
  normalizeSource,
  resolveSubmitBaseWebhook,
  resolveSubmitNotificationWebhook,
} from "@/shared/lark/routing"
import { sendMail } from "@/shared/mail/gmail"
import { buildApplicantAutoReply, isValidEmail } from "@/shared/mail/applicantAutoReply"
import { sendApplicantSms, type SmsChannel } from "@/shared/sms/applicantSms"
import { sendMetaCapiLead } from "@/shared/meta/capi"

interface ApplicationPayload {
  lastName?: string
  firstName?: string
  lastNameKana?: string
  firstNameKana?: string
  birthDate?: string
  phone?: string
  email?: string
  applicationSource?: string
  companyName?: string
  jobName?: string
  jobUrl?: string
  jobId?: string
  utmSource?: string
  utmMedium?: string
  applyEmail?: string
  metaEventId?: string
  [key: string]: unknown
}

interface ClassifiedApplication {
  isMechanic: boolean
  isCpOne: boolean
  isPmAgent: boolean
  isStandby: boolean
  isKyujinbox: boolean
}

const buildInternalLarkCard = (input: ApplicationPayload, c: ClassifiedApplication) => {
  const appliedAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })

  const details = [
    `1. 氏名: ${input.lastName ?? ""} ${input.firstName ?? ""}`,
    `2. ふりがな: ${input.lastNameKana ?? ""} ${input.firstNameKana ?? ""}`,
    `3. 生年月日: ${input.birthDate ?? ""}`,
    `4. 電話番号: ${input.phone ?? ""}`,
    `5. メールアドレス: ${input.email ?? ""}`,
  ].join("\n")

  const jobLines: string[] = []
  if (input.companyName || input.jobName || input.jobUrl || input.jobId) {
    jobLines.push(
      `会社名: ${input.companyName ?? "—"}`,
      `求人名: ${input.jobName ?? "—"}`,
      `求人URL: ${input.jobUrl ?? `https://ridejob.jp/job/${input.jobId ?? "—"}`}`,
    )
  }

  const utmLines: string[] = []
  if (input.utmSource) utmLines.push(`流入元: ${input.utmSource}`)
  if (input.utmMedium) utmLines.push(`メディア: ${input.utmMedium}`)
  // 生値のブレを吸収した正規化チャネルを併記（direct/不明は省略）
  const { channel, label: channelLabel } = classifyChannel(
    input.utmSource,
    input.utmMedium,
    input.applicationSource,
  )
  if (channel !== "direct") utmLines.push(`チャネル: ${channelLabel}`)

  let titleEmoji = "🟦"
  let titleText = "ライドジョブ求人サイトから応募がありました！"
  if (c.isMechanic && c.isStandby) {
    titleEmoji = "🔧"
    titleText = "スタンバイから整備士の応募がありました！"
  } else if (c.isMechanic && c.isKyujinbox) {
    titleEmoji = "🔧"
    titleText = "求人ボックスから整備士の応募がありました！"
  } else if (c.isMechanic) {
    titleEmoji = "🔧"
    titleText = "ライドジョブ求人サイトから整備士の応募がありました！"
  } else if (c.isStandby) {
    titleEmoji = "🟦"
    titleText = "スタンバイからの応募がありました！"
  } else if (c.isKyujinbox) {
    titleEmoji = "🟨"
    titleText = "求人ボックスからの応募がありました！"
  }

  return {
    msg_type: "interactive",
    card: {
      elements: [
        { tag: "div", text: { tag: "lark_md", content: `**${titleEmoji} ${titleText}**\n応募日時: ${appliedAt}` } },
        { tag: "hr" },
        { tag: "div", text: { tag: "lark_md", content: `**📋 応募内容**\n${details}` } },
        ...(jobLines.length > 0
          ? [
              { tag: "hr" },
              { tag: "div", text: { tag: "lark_md", content: `**💼 求人情報**\n${jobLines.join("\n")}` } },
            ]
          : []),
        ...(utmLines.length > 0
          ? [
              { tag: "hr" },
              { tag: "div", text: { tag: "lark_md", content: `**📊 流入経路**\n${utmLines.join("\n")}` } },
            ]
          : []),
      ],
    },
  }
}

const buildBaseRegistrationPayload = (input: ApplicationPayload, c: ClassifiedApplication) => {
  const appliedAt = new Date().toISOString()
  const payload: Record<string, unknown> = {
    lastName: input.lastName ?? "",
    firstName: input.firstName ?? "",
    lastNameKana: input.lastNameKana ?? "",
    firstNameKana: input.firstNameKana ?? "",
    birthDate: input.birthDate ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    companyName: input.companyName ?? "",
    jobName: input.jobName ?? "",
    jobUrl: input.jobUrl ?? (input.jobId ? `https://ridejob.jp/job/${input.jobId}` : ""),
    jobId: input.jobId ?? "",
    applicationSource: input.applicationSource ?? "",
    utmSource: input.utmSource ?? "",
    utmMedium: input.utmMedium ?? "",
    // 正規化チャネル（生値は上記のまま保持。集計はこの列でブレなく行える）
    channel: classifyChannel(input.utmSource, input.utmMedium, input.applicationSource).channel,
    appliedAt,
  }
  if (c.isMechanic) payload.isStandby = c.isStandby
  return payload
}

/** URL中の source クエリで applicationSource / jobUrl を補完 */
const resolveApplicationSource = (incoming: ApplicationPayload, requestUrl: URL): void => {
  const urlSource = requestUrl.searchParams.get("source")?.trim()
  const incomingSource =
    typeof incoming.applicationSource === "string" && incoming.applicationSource.trim()
      ? incoming.applicationSource
      : undefined
  const resolvedSource = incomingSource ?? (urlSource || undefined)
  if (!incomingSource && resolvedSource) incoming.applicationSource = resolvedSource

  const normalized =
    typeof incoming.applicationSource === "string" ? incoming.applicationSource.trim().toLowerCase() : ""
  if (!normalized || normalized === "unknown" || typeof incoming.jobUrl !== "string" || !incoming.jobUrl) return

  const setSourceOnUrl = (raw: string, base?: string): string | undefined => {
    try {
      const parsed = base ? new URL(raw, base) : new URL(raw)
      if (parsed.searchParams.get("source")) return undefined
      parsed.searchParams.set("source", normalized)
      return parsed.toString()
    } catch {
      return undefined
    }
  }

  const updated = setSourceOnUrl(incoming.jobUrl) ?? setSourceOnUrl(incoming.jobUrl, "https://ridejob.jp")
  if (updated) incoming.jobUrl = updated
}

const logRequestContext = (request: Request, timestamp: string): void => {
  const sep = "=".repeat(80)
  console.log(sep)
  console.log(`[INFO] ${timestamp} - submit-application POST Request Received`)
  console.log(sep)
  console.log(`[INFO] Environment: ${process.env.NODE_ENV}`)
  console.log(`[INFO] Vercel URL: ${process.env.VERCEL_URL || "not set"}`)
  console.log(`[INFO] Request Headers:`)
  console.log(`  - User-Agent: ${request.headers.get("user-agent") || "unknown"}`)
  console.log(`  - Content-Length: ${request.headers.get("content-length") || "unknown"}`)
  console.log(`  - X-Forwarded-For: ${request.headers.get("x-forwarded-for") || "unknown"}`)
  console.log(`  - Referer: ${request.headers.get("referer") || "unknown"}`)
  console.log(sep)
}

/** Cookie ヘッダから指定名の値を取り出す（_fbp / _fbc 用）。 */
const readCookie = (cookieHeader: string, name: string): string | undefined => {
  const target = cookieHeader.split("; ").find((c) => c.startsWith(`${name}=`))
  return target ? decodeURIComponent(target.slice(name.length + 1)) : undefined
}

export async function POST(request: Request) {
  try {
    logRequestContext(request, new Date().toISOString())

    const incoming = (await request.json()) as ApplicationPayload
    resolveApplicationSource(incoming, new URL(request.url))

    console.log("[INFO] Raw Request Data (Pretty Formatted):")
    console.log(JSON.stringify(incoming, null, 2))

    // 求人種別の分類
    const isMechanic = detectMechanic(incoming.applyEmail)
    const isCpOne = detectCpOne(incoming.companyName)
    const isPmAgent = detectPmAgent(incoming.companyName)
    const source = normalizeSource(incoming.applicationSource, incoming.jobUrl)
    const classification: ClassifiedApplication = {
      isMechanic,
      isCpOne,
      isPmAgent,
      isStandby: source === "standby",
      isKyujinbox: source === "kyujinbox",
    }

    // 通知Webhook選択
    const notification = resolveSubmitNotificationWebhook(classification)
    if (!notification.url) {
      console.error(`[ERROR] Lark webhook is not configured (${notification.type})`)
      return NextResponse.json({ success: false, message: "Webhook not configured" }, { status: 500 })
    }
    console.log(`[INFO] Using ${notification.type} for notification`)

    // Base登録Webhook選択（任意）
    const base = resolveSubmitBaseWebhook(classification)
    if (base.url) {
      console.log(`[INFO] Using ${base.type} for base registration`)
    } else {
      console.log(`[INFO] ${base.type} is not configured, skipping base registration`)
    }

    // 並列送信
    const tasks: Promise<{
      name: "notification" | "base_registration" | "applicant_mail" | "applicant_sms" | "meta_capi"
      ok: boolean
    }>[] = []

    tasks.push(
      sendToLark(notification.url, buildInternalLarkCard(incoming, classification), "submit-application:notification").then(
        (r) => ({ name: "notification", ok: r.ok }),
      ),
    )
    if (base.url) {
      tasks.push(
        sendToLark(base.url, buildBaseRegistrationPayload(incoming, classification), `submit-application:${base.type}`).then(
          (r) => ({ name: "base_registration", ok: r.ok }),
        ),
      )
    }

    // 応募者向け自動返信（非致命。email 不正時はスキップ）
    if (isValidEmail(incoming.email)) {
      const mail = buildApplicantAutoReply(classification, {
        email: incoming.email,
        name: `${incoming.lastName ?? ""} ${incoming.firstName ?? ""}`.trim(),
        companyName: incoming.companyName,
        jobName: incoming.jobName,
      })
      tasks.push(
        sendMail(mail, "submit-application:applicant").then((r) => ({ name: "applicant_mail", ok: r.ok })),
      )
    } else {
      console.log("[INFO] applicant email missing or invalid, skipping auto-reply")
    }

    // 応募者向け自動SMS（非致命。電話不正/トークン未設定時はスキップ）
    const smsChannel: SmsChannel = classification.isMechanic ? "mechanic" : "ridejob"
    tasks.push(
      sendApplicantSms(
        {
          phone: incoming.phone,
          channel: smsChannel,
          applicantName: `${incoming.lastName ?? ""} ${incoming.firstName ?? ""}`.trim(),
          media: incoming.utmSource || incoming.applicationSource || "meta",
        },
        "submit-application:applicant",
      ).then((r) => ({ name: "applicant_sms" as const, ok: r.ok })),
    )

    // Meta Conversions API（Lead）— 非致命。eventId が無ければスキップ
    if (typeof incoming.metaEventId === "string" && incoming.metaEventId) {
      const cookieHeader = request.headers.get("cookie") ?? ""
      const clientIp = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined
      tasks.push(
        sendMetaCapiLead({
          eventId: incoming.metaEventId,
          eventSourceUrl: incoming.jobUrl,
          email: incoming.email,
          phone: incoming.phone,
          fbp: readCookie(cookieHeader, "_fbp"),
          fbc: readCookie(cookieHeader, "_fbc"),
          clientIpAddress: clientIp,
          clientUserAgent: request.headers.get("user-agent") ?? undefined,
          contentIds: incoming.jobId ? [incoming.jobId] : undefined,
          value: 0,
          currency: "JPY",
        }).then((r) => ({ name: "meta_capi" as const, ok: r.ok })),
      )
    }

    const results = await Promise.all(tasks)

    // 通知失敗は致命的、Base登録失敗は非致命
    const notifyResult = results.find((r) => r.name === "notification")
    if (notifyResult && !notifyResult.ok) {
      return NextResponse.json({ success: false, message: "Failed to send notification to Lark" }, { status: 502 })
    }
    const baseResult = results.find((r) => r.name === "base_registration")
    if (baseResult && !baseResult.ok) {
      console.warn("[WARNING] Base registration failed, but proceeding with success response")
    }
    const mailResult = results.find((r) => r.name === "applicant_mail")
    if (mailResult && !mailResult.ok) {
      console.warn("[WARNING] Applicant auto-reply mail failed, but proceeding with success response")
    }
    const smsResult = results.find((r) => r.name === "applicant_sms")
    if (smsResult && !smsResult.ok) {
      console.warn("[WARNING] Applicant SMS not sent (failed or skipped), but proceeding with success response")
    }
    const capiResult = results.find((r) => r.name === "meta_capi")
    if (capiResult && !capiResult.ok) {
      console.warn("[WARNING] Meta CAPI Lead not sent (failed or skipped), but proceeding with success response")
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const sep = "=".repeat(80)
    console.error(sep)
    console.error(`[ERROR] ${new Date().toISOString()} - Unexpected Error in submit-application`)
    console.error(`[ERROR] Error Message: ${error instanceof Error ? error.message : "Unknown error"}`)
    console.error(`[ERROR] Error Stack: ${error instanceof Error ? error.stack : "No stack trace"}`)
    console.error(`[ERROR] Full Error Object:`, error)
    console.error(sep)
    return NextResponse.json({ success: false, message: "internal error" }, { status: 500 })
  }
}
