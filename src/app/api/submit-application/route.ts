import { NextResponse } from "next/server"
import {
  classifyChannel,
  detectCpOne,
  detectMechanic,
  detectPmAgent,
  normalizeSource,
  resolveBaseTarget,
  resolveSubmitNotificationTarget,
} from "@/shared/lark/routing"
import { notifyLark } from "@/shared/lark/notify"
import { createBitableRecord, type BitableCreateResult } from "@/shared/lark/bitable"
import {
  buildFieldsForService,
  resolveApplicationSourceRecordId,
  resolveRidejobCompanyRecordId,
  type ApplicationFields,
} from "@/shared/lark/bitable-schema"
import { notifyBaseRegistrationError } from "@/shared/lark/alert"
import { sendMail } from "@/shared/mail/gmail"
import { buildApplicantAutoReply, isValidEmail } from "@/shared/mail/applicantAutoReply"
import { sendApplicantSms, type SmsChannel } from "@/shared/sms/applicantSms"
import { sendMetaCapiLead } from "@/shared/meta/capi"
import { detectTestApplication, type TestDetection } from "@/shared/application/testDetection"
import { isMetaCatalogJob } from "@/shared/lib/catalog-eligibility"
import { getExternalJobForSubmission } from "@/features/external-jobs/api"
import { parseExternalApplyId } from "@/features/external-jobs/apply-id"
import { isExternalJobExpired } from "@/features/external-jobs/expiry"
import { isExternalMetaCatalogJob } from "@/features/external-jobs/catalog-eligibility"

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
  jobCategoryName?: string
  jobUrl?: string
  jobId?: string
  utmSource?: string
  utmMedium?: string
  utmSourceFirst?: string
  utmMediumFirst?: string
  utmCampaign?: string
  utmLastTouchAt?: string
  utmFirstTouchAt?: string
  fbclid?: string
  gclid?: string
  applyEmail?: string
  metaEventId?: string
  applicationIntent?: "apply" | "consult"
  [key: string]: unknown
}

interface ClassifiedApplication {
  isMechanic: boolean
  isCpOne: boolean
  isPmAgent: boolean
  isStandby: boolean
  isKyujinbox: boolean
  isConsult: boolean
}

/** 流入経路の「古い＝誤帰属の疑い」判定に使う日数しきい値。 */
const ATTRIBUTION_WINDOW_DAYS = 7

/** ISO 文字列から現在までの経過日数（切り捨て）。無効値は undefined。 */
const daysSince = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return undefined
  const diffMs = Date.now() - t
  if (diffMs < 0) return 0
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}

/** source/medium を "source / medium" 形式に整形（両方空なら undefined）。 */
const formatTouch = (source: string | undefined, medium: string | undefined): string | undefined => {
  const s = source?.trim()
  const m = medium?.trim()
  if (!s && !m) return undefined
  return [s, m].filter(Boolean).join(" / ")
}

const buildInternalLarkCard = (
  input: ApplicationPayload,
  c: ClassifiedApplication,
  test?: TestDetection,
) => {
  const appliedAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
  const actionLabel = c.isConsult ? "相談" : "応募"

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
      `求人ID: ${input.jobId ?? "—"}`,
      `求人URL: ${input.jobUrl ?? `https://ridejob.jp/job/${input.jobId ?? "—"}`}`,
    )
  }

  const utmLines: string[] = []
  if (input.utmSource) utmLines.push(`流入元: ${input.utmSource}`)
  if (input.utmMedium) utmLines.push(`メディア: ${input.utmMedium}`)
  if (input.utmCampaign) utmLines.push(`キャンペーン: ${input.utmCampaign}`)

  // 生値のブレを吸収した正規化チャネルを併記（direct/不明は省略）
  const { channel, label: channelLabel } = classifyChannel(
    input.utmSource,
    input.utmMedium,
    input.applicationSource,
  )
  if (channel !== "direct") utmLines.push(`チャネル: ${channelLabel}`)

  // 最終接触からの経過日数を併記し、古いクリックによる誤帰属に気づけるようにする
  const elapsedDays = daysSince(input.utmLastTouchAt)
  if (elapsedDays !== undefined) {
    const staleMark = elapsedDays >= ATTRIBUTION_WINDOW_DAYS ? ` ⚠️(${elapsedDays}日前のクリック)` : ""
    utmLines.push(`最終接触: ${elapsedDays}日前${staleMark}`)
  }

  // 初回接触が最終接触と異なる場合のみ併記（流入の起点を可視化）
  const first = formatTouch(input.utmSourceFirst, input.utmMediumFirst)
  const last = formatTouch(input.utmSource, input.utmMedium)
  if (first && first !== last) utmLines.push(`初回接触: ${first}`)

  if (input.fbclid || input.gclid) {
    const ids = [input.fbclid ? "fbclid" : "", input.gclid ? "gclid" : ""].filter(Boolean).join(" / ")
    utmLines.push(`クリックID: ${ids}`)
  }

  let titleEmoji = "🟦"
  let titleText = "ライドジョブ求人サイトから応募がありました！"
  if (c.isMechanic && c.isConsult) {
    titleEmoji = "🔧"
    titleText = "ライドジョブ求人サイトから整備士の転職相談がありました！"
  } else if (c.isMechanic && c.isStandby) {
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

  // テスト応募は先頭に [TEST] を付与し、実応募と一目で区別できるようにする
  if (test?.isTest) {
    titleEmoji = "🧪"
    titleText = `[TEST] ${titleText}（テスト判定: ${test.reason ?? "—"} / Base登録・自動連絡はスキップ）`
  }

  return {
    msg_type: "interactive",
    card: {
      elements: [
        { tag: "div", text: { tag: "lark_md", content: `**${titleEmoji} ${titleText}**\n${actionLabel}日時: ${appliedAt}` } },
        { tag: "hr" },
        { tag: "div", text: { tag: "lark_md", content: `**📋 ${actionLabel}内容**\n${details}` } },
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

const buildBitableFields = (input: ApplicationPayload, c: ClassifiedApplication): ApplicationFields => {
  // extraNotes は求人ボックス連携（applications ルート）が応募者詳細に使うため、内部フォームでは空のまま。
  const extraNotes: string[] = []
  if (c.isConsult && input.jobId) extraNotes.push(`求人ID: ${input.jobId}`)
  if (c.isConsult) extraNotes.push("受付区分: RIDE JOBへの転職相談（求人企業への直接応募ではない）")
  // attributionNotes: 内部フォームの補助情報。liftjob のみメモに残し、ridejob/mechanic は載せない。
  const attributionNotes: string[] = []
  if (c.isStandby) attributionNotes.push("流入チャネル: スタンバイ")
  if (c.isKyujinbox) attributionNotes.push("流入チャネル: 求人ボックス")
  // 生の utmSource/utmMedium は専用列で保持しつつ、集計用の正規化チャネルを併記する。
  const { label: channelLabel } = classifyChannel(input.utmSource, input.utmMedium, input.applicationSource)
  attributionNotes.push(`チャネル: ${channelLabel}`)
  const firstTouch = [input.utmSourceFirst, input.utmMediumFirst].filter(Boolean).join(" / ")
  if (firstTouch) attributionNotes.push(`初回接触: ${firstTouch}`)
  if (input.utmLastTouchAt) attributionNotes.push(`最終接触日時: ${input.utmLastTouchAt}`)
  if (input.fbclid) attributionNotes.push(`fbclid: ${input.fbclid}`)
  if (input.gclid) attributionNotes.push(`gclid: ${input.gclid}`)
  return {
    lastName: input.lastName,
    firstName: input.firstName,
    lastNameKana: input.lastNameKana,
    firstNameKana: input.firstNameKana,
    birthDate: input.birthDate,
    phone: input.phone,
    email: input.email,
    jobId: input.jobId,
    jobName: input.jobName,
    jobUrl: input.jobUrl ?? (input.jobId ? `https://ridejob.jp/job/${input.jobId}` : undefined),
    companyName: input.companyName,
    applicationSource: input.applicationSource,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    appliedAtMillis: Date.now(),
    extraNotes,
    attributionNotes,
  }
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

    // 転載求人は掲載企業を伏せているため、応募フォームは社名を持たない（ブラウザに出さないため）。
    // 社内通知とLark Baseには実名が要るので、ここで jobId から引き直す。
    // クライアントの申告ではなくサーバー側で解決するので、詐称もできない。
    // 分類（detectCpOne / detectPmAgent）より前に入れて、従来と同じ値で判定させる。
    const ext = incoming.jobId ? parseExternalApplyId(incoming.jobId) : null
    let isExternalMechanic = false
    let isExternalCatalogItem = false
    if (ext) {
      // applicationIntent はクライアント入力なので、外部求人では分岐条件に使わない。
      // 一次データをno-storeで必ず引き直し、存在・期限・職種をサーバー側で確定する。
      // これにより、整備士求人を apply と偽装して相談ルーティングを迂回できない。
      const verified = await getExternalJobForSubmission(ext.source, ext.sourceId)
      if (!verified.ok) {
        return NextResponse.json(
          { success: false, message: "External job source is temporarily unavailable" },
          { status: 503 },
        )
      }
      if (
        !verified.job
        || isExternalJobExpired(verified.job.expiresAt, verified.job.lastSeen)
      ) {
        return NextResponse.json(
          { success: false, message: "This job is no longer available" },
          { status: 410 },
        )
      }
      incoming.companyName = verified.companyName
      incoming.jobName = verified.job.title
      incoming.jobCategoryName = verified.job.jobCategory
      isExternalMechanic = ["自動車整備士", "バイク整備士"].includes(
        verified.job.jobCategory || "",
      )
      isExternalCatalogItem = isExternalMetaCatalogJob(verified.job)
      if (!isExternalMechanic && incoming.applicationIntent === "consult") {
        return NextResponse.json(
          { success: false, message: "This job is not eligible for mechanic consultation" },
          { status: 400 },
        )
      }
      if (isExternalMechanic) {
        incoming.applyEmail = "ridejob.mechanic@pmagent.jp"
        incoming.applicationIntent = "consult"
      } else {
        // 既存の非整備士外部求人は従来どおり応募として扱う。
        incoming.applicationIntent = "apply"
      }
    }
    // カタログ・Pixel/CAPI・Lark の求人IDを、詳細URLに出る raw source_id へ統一する。
    // /apply の hw- 接頭辞はルーティング内部だけで使い、外部へ保存しない。
    if (ext && isExternalMechanic) {
      incoming.jobId = ext.sourceId
      incoming.applicationIntent = "consult"
      const canonicalJobUrl = new URL(
        `/external-job/${encodeURIComponent(ext.source)}/${encodeURIComponent(ext.sourceId)}`,
        "https://ridejob.jp",
      )
      try {
        const submittedUrl = new URL(incoming.jobUrl || "", "https://ridejob.jp")
        for (const key of [
          "source", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
          "fbclid", "gclid",
        ]) {
          const value = submittedUrl.searchParams.get(key)
          if (value) canonicalJobUrl.searchParams.set(key, value)
        }
      } catch {
        // 不正URLでも canonicalJobUrl を使い、クライアント値は保存しない。
      }
      incoming.jobUrl = canonicalJobUrl.toString()
    }

    console.log("[INFO] Application request accepted", {
      jobId: incoming.jobId || "(none)",
      intent: incoming.applicationIntent || "apply",
      source: incoming.applicationSource || "unknown",
      hasEmail: Boolean(incoming.email),
      hasPhone: Boolean(incoming.phone),
    })

    // 求人種別の分類
    const isMechanic = detectMechanic(incoming.applyEmail)
      || isExternalMechanic
    // 外部整備士は掲載企業名より「RIDE JOBへの転職相談」という受付種別を優先する。
    // 偶然CP One/PM Agentの名称を含む企業でも、別サービスへ誤配送しない。
    const isCpOne = !isExternalMechanic && detectCpOne(incoming.companyName)
    const isPmAgent = !isExternalMechanic && detectPmAgent(incoming.companyName)
    const source = normalizeSource(incoming.applicationSource, incoming.jobUrl)
    const classification: ClassifiedApplication = {
      isMechanic,
      isCpOne,
      isPmAgent,
      isStandby: source === "standby",
      isKyujinbox: source === "kyujinbox",
      // 転職相談扱いはサーバーが一次データで整備士と確認した外部求人だけに限定する。
      isConsult: isExternalMechanic,
    }

    // テスト応募判定（実績を汚染しないよう Base登録・自動連絡・CAPI をスキップする）
    const test = detectTestApplication(incoming)
    if (test.isTest) {
      console.log(`[INFO] Test application detected (${test.reason}). Notification only; skipping base/mail/sms/capi.`)
    }

    // 通知先選択（chat_id=API優先 / url=Webhookフォールバック）
    const notification = resolveSubmitNotificationTarget(classification)
    if (!notification.chatId && !notification.url) {
      console.error(`[ERROR] Lark notification target is not configured (${notification.type})`)
      return NextResponse.json({ success: false, message: "Notification target not configured" }, { status: 500 })
    }
    console.log(
      `[INFO] Notification target: type=${notification.type} service=${notification.service} chat=${notification.chatId ? "set" : "-"} webhook=${notification.url ? "set" : "-"}`,
    )

    // Base登録は bitable API へ（非致命）。テスト応募は登録しない。
    const baseTarget = resolveBaseTarget(classification)
    if (test.isTest) {
      console.log(`[INFO] Test application; skipping base registration (service=${baseTarget.service})`)
    } else {
      console.log(`[INFO] Base registration target: service=${baseTarget.service} table=${baseTarget.tableId}`)
    }

    // 並列送信
    type TaskResult = {
      name: "base_registration" | "applicant_mail" | "applicant_sms" | "meta_capi"
      ok: boolean
      base?: BitableCreateResult
    }
    const tasks: Promise<TaskResult>[] = []

    // 受付の正本となる社内通知を先に確定する。ここで失敗した場合は、メール・SMS・CAPIを
    // 送らずにエラーを返し、「未受付なのに応募者へ完了通知／Lead計測」になるのを防ぐ。
    const notificationResult = await notifyLark({
      api: { service: notification.service, chatId: notification.chatId },
      webhookUrl: notification.url,
      payload: buildInternalLarkCard(incoming, classification, test),
      context: "submit-application:notification",
    })
    if (!notificationResult.ok) {
      return NextResponse.json({ success: false, message: "Failed to send notification to Lark" }, { status: 502 })
    }
    if (!test.isTest) {
      tasks.push(
        (async (): Promise<TaskResult> => {
          const appFields = buildBitableFields(incoming, classification)
          if (baseTarget.service === "ridejob" && appFields.companyName) {
            try {
              appFields.companyRecordId = await resolveRidejobCompanyRecordId(appFields.companyName)
              console.log(
                appFields.companyRecordId
                  ? `[INFO] 得意先CRM linked: ${appFields.companyName} -> ${appFields.companyRecordId}`
                  : `[INFO] 得意先CRM not found for company: ${appFields.companyName}`,
              )
            } catch (error) {
              console.warn("[WARNING] 得意先CRM lookup failed", error)
            }
          }
          if (baseTarget.service === "ridejob" || baseTarget.service === "mechanic") {
            try {
              appFields.applicationSourceRecordId = await resolveApplicationSourceRecordId(
                baseTarget.service,
                appFields.applicationSource,
              )
              console.log(
                `[INFO] 応募経由マスタ linked (${baseTarget.service}): ${appFields.applicationSource ?? "-"} -> ${appFields.applicationSourceRecordId ?? "(none)"}`,
              )
            } catch (error) {
              console.warn("[WARNING] 応募経由マスタ lookup failed", error)
            }
          }
          const bitableInput = buildFieldsForService(baseTarget.service, appFields)
          const result = await createBitableRecord({
            service: baseTarget.service,
            tableId: baseTarget.tableId,
            fields: bitableInput,
          }).catch((error: unknown): BitableCreateResult => ({
            ok: false,
            status: 0,
            message: error instanceof Error ? error.message : "bitable error",
          }))
          return { name: "base_registration", ok: result.ok, base: result }
        })(),
      )
    }

    // 応募者向け自動返信（非致命。email 不正時／テスト応募時はスキップ）
    if (!test.isTest && isValidEmail(incoming.email)) {
      const mail = buildApplicantAutoReply(classification, {
        email: incoming.email,
        name: `${incoming.lastName ?? ""} ${incoming.firstName ?? ""}`.trim(),
        companyName: incoming.companyName,
        jobName: incoming.jobName,
        intent: classification.isConsult ? "consult" : "apply",
      })
      tasks.push(
        sendMail(mail, "submit-application:applicant").then((r) => ({ name: "applicant_mail", ok: r.ok })),
      )
    } else {
      console.log("[INFO] applicant email missing or invalid, skipping auto-reply")
    }

    // 応募者向け自動SMS（非致命。電話不正/トークン未設定/テスト応募時はスキップ）
    const smsChannel: SmsChannel = classification.isMechanic ? "mechanic" : "ridejob"
    if (!test.isTest) {
      tasks.push(
        sendApplicantSms(
          {
            phone: incoming.phone,
            channel: smsChannel,
            applicantName: `${incoming.lastName ?? ""} ${incoming.firstName ?? ""}`.trim(),
            media: incoming.utmSource || incoming.applicationSource || "meta",
            intent: classification.isConsult ? "consult" : "apply",
          },
          "submit-application:applicant",
        ).then((r) => ({ name: "applicant_sms" as const, ok: r.ok })),
      )
    }

    // Meta Conversions API（Lead）— 非致命。eventId が無い／テスト応募時はスキップ
    if (!test.isTest && typeof incoming.metaEventId === "string" && incoming.metaEventId) {
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
          contentIds: incoming.jobId && (!ext || isExternalCatalogItem) && isMetaCatalogJob({
            jobName: incoming.jobName,
            jobCategory: { name: incoming.jobCategoryName },
          }) ? [incoming.jobId] : undefined,
          value: 0,
          currency: "JPY",
        }).then((r) => ({ name: "meta_capi" as const, ok: r.ok })),
      )
    }

    const results = await Promise.all(tasks)

    // Base登録失敗は非致命（Lark通知は上で成功済み）。
    const baseResult = results.find((r) => r.name === "base_registration")
    if (baseResult && !baseResult.ok) {
      const b = baseResult.base
      console.warn(
        `[WARNING] Base registration failed (service=${baseTarget.service}): status=${b?.status} message=${b?.message}`,
      )
      await notifyBaseRegistrationError({
        route: "submit-application",
        service: baseTarget.service,
        tableId: baseTarget.tableId,
        status: b?.status ?? 0,
        code: b?.code,
        message: b?.message,
        applicant: {
          name: `${incoming.lastName ?? ""} ${incoming.firstName ?? ""}`.trim() || undefined,
          phone: incoming.phone,
          email: incoming.email,
        },
        job: {
          id: incoming.jobId,
          name: incoming.jobName,
          url: incoming.jobUrl,
        },
      }).catch((error) => console.error("[alert] notifyBaseRegistrationError failed", error))
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
