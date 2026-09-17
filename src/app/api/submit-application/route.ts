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
import {
  createBitableRecord,
  updateBitableRecord,
  upsertBitableRecordByTextField,
  type BitableCreateResult,
} from "@/shared/lark/bitable"
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
import { getJob } from "@/features/jobs/api"
import {
  assessCatalogTouch,
  compareCatalogAndAppliedJob,
  type CatalogAttributionStatus,
} from "@/features/application/lib/catalog-attribution"

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
  utmContent?: string
  utmLastTouchAt?: string
  utmFirstTouchAt?: string
  fbclid?: string
  gclid?: string
  catalogJobId?: string
  catalogClickedAt?: string
  catalogLandingPath?: string
  catalogSource?: string
  catalogMedium?: string
  catalogEvidence?: "utm" | "fbclid"
  catalogJobName?: string
  catalogAttributionStatus?: CatalogAttributionStatus
  catalogClickedAtMillis?: number
  submissionId?: string
  applyEmail?: string
  metaEventId?: string
  applicationIntent?: "apply" | "consult"
  [key: string]: unknown
}

const CATALOG_STATUS_LABELS: Record<CatalogAttributionStatus, string> = {
  same_job: "広告で見た求人と同じ",
  changed_job: "広告クリック後に別求人へ応募",
  missing: "カタログ求人IDを取得できず",
  applied_job_missing: "応募求人IDを取得できず",
  stale: "クリックから7日以上",
  invalid: "無効なカタログ求人情報",
}

export const appendLarkNotificationMarker = (memo: string, submissionId: string): string => {
  const marker = `[lark_notified:${submissionId}]`
  if (memo.includes(marker)) return memo
  return [memo.trim(), marker].filter(Boolean).join("\n")
}

const resolveCatalogAttribution = async (
  input: ApplicationPayload,
): Promise<void> => {
  const assessment = assessCatalogTouch({ ...input, appliedJobId: input.jobId })
  if (assessment.status) {
    input.catalogAttributionStatus = assessment.status
    input.catalogJobId = assessment.jobId
    input.catalogClickedAtMillis = assessment.clickedAtMillis
    return
  }
  if (!assessment.jobId || !assessment.clickedAtMillis) return

  input.catalogJobId = assessment.jobId
  input.catalogClickedAtMillis = assessment.clickedAtMillis
  const external = parseExternalApplyId(assessment.jobId)
  if (external) {
    const verified = await getExternalJobForSubmission(external.source, external.sourceId)
    if (!verified.ok) throw new Error("catalog source unavailable")
    if (!verified.job || !isExternalMetaCatalogJob(verified.job)) {
      input.catalogAttributionStatus = "invalid"
      return
    }
    input.catalogJobId = external.sourceId
    input.catalogJobName = verified.job.title
  } else {
    try {
      const job = await getJob(assessment.jobId, { timeoutMs: 5000 })
      if (!job || !isMetaCatalogJob(job)) {
        input.catalogAttributionStatus = "invalid"
        return
      }
      input.catalogJobName = job.jobName || job.title
    } catch (error) {
      console.warn("[WARNING] catalog job verification unavailable", error)
      throw new Error("catalog source unavailable")
    }
  }
  input.catalogAttributionStatus = compareCatalogAndAppliedJob(input.catalogJobId, input.jobId)
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

  const catalogLines: string[] = []
  if (input.catalogAttributionStatus) {
    catalogLines.push(
      `判定: ${CATALOG_STATUS_LABELS[input.catalogAttributionStatus]}`,
      `広告で見た求人: ${input.catalogJobName ?? "—"}`,
      `広告クリック求人ID: ${input.catalogJobId ?? "—"}`,
      `実際に${actionLabel}した求人: ${input.jobName ?? "—"}`,
      `実際に${actionLabel}した求人ID: ${input.jobId ?? "—"}`,
    )
    if (input.catalogClickedAtMillis) {
      catalogLines.push(`広告クリック日時: ${new Date(input.catalogClickedAtMillis).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`)
    }
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
        ...(catalogLines.length > 0
          ? [
              { tag: "hr" },
              { tag: "div", text: { tag: "lark_md", content: `**🛒 Metaカタログ求人**\n${catalogLines.join("\n")}` } },
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
    utmContent: input.utmContent,
    submissionId: input.submissionId,
    catalogJobId: input.catalogJobId,
    catalogJobName: input.catalogJobName,
    catalogClickedAtMillis: input.catalogClickedAtMillis,
    catalogAttributionStatus: input.catalogAttributionStatus,
    catalogAppliedJobId: input.jobId,
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
  if (!target) return undefined
  const raw = target.slice(name.length + 1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function POST(request: Request) {
  try {
    logRequestContext(request, new Date().toISOString())

    const incoming = (await request.json()) as ApplicationPayload
    resolveApplicationSource(incoming, new URL(request.url))
    incoming.submissionId = String(incoming.submissionId || incoming.metaEventId || "").trim().slice(0, 128)
    if (!incoming.submissionId) {
      return NextResponse.json({ success: false, message: "submissionId is required" }, { status: 400 })
    }

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

    try {
      await resolveCatalogAttribution(incoming)
    } catch (error) {
      console.error("[ERROR] Catalog source verification failed", error)
      return NextResponse.json(
        { success: false, message: "Catalog job source is temporarily unavailable" },
        { status: 503 },
      )
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
    if (!classification.isCpOne && !notification.chatId) {
      console.error(`[ERROR] Idempotent Lark chat target is not configured (${notification.type})`)
      return NextResponse.json({ success: false, message: "Notification chat target not configured" }, { status: 500 })
    }
    console.log(
      `[INFO] Notification target: type=${notification.type} service=${notification.service} chat=${notification.chatId ? "set" : "-"} webhook=${notification.url ? "set" : "-"}`,
    )

    // Base登録は bitable API へ。実応募では通知前に必ず成功させ、テスト応募だけ登録しない。
    const baseTarget = resolveBaseTarget(classification)
    if (test.isTest) {
      console.log(`[INFO] Test application; skipping base registration (service=${baseTarget.service})`)
    } else {
      console.log(`[INFO] Base registration target: service=${baseTarget.service} table=${baseTarget.tableId}`)
    }

    // Baseを応募受付の冪等ジャーナルとして先に確定する。
    // submission_id が同じ再送は同じレコードへ更新され、通知済みなら以降を重複実行しない。
    let baseRecordId = ""
    let notificationAlreadySent = false
    let notificationInProgress = false
    let notificationRecoveryOnly = false
    let notificationRecoveryExpired = false
    let baseFields: Record<string, unknown> = {}
    let latestRidejobMemo = ""
    if (!test.isTest && baseTarget.service !== "liftjob") {
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
        } catch (error) {
          console.warn("[WARNING] 応募経由マスタ lookup failed", error)
        }
      }
      try {
        baseFields = buildFieldsForService(baseTarget.service, appFields)
        const ridejobSubmissionMarker = `[submission_id:${incoming.submissionId}]`
        let saved = await upsertBitableRecordByTextField({
          service: baseTarget.service,
          tableId: baseTarget.tableId,
          fieldName: baseTarget.service === "ridejob" ? "対応履歴メモ" : "submission_id",
          value: baseTarget.service === "ridejob" ? ridejobSubmissionMarker : incoming.submissionId,
          operator: baseTarget.service === "ridejob" ? "contains" : "is",
          fields: baseFields,
          updateExisting: false,
        })
        const initiallyCreated = saved.created
        baseRecordId = saved.recordId
        const hasNotificationMarker = (fields: Record<string, unknown>): boolean => (
          baseTarget.service === "ridejob"
            ? String(fields["対応履歴メモ"] ?? "").includes(`[lark_notified:${incoming.submissionId}]`)
            : fields["Lark通知送信済み"] === true
        )
        notificationAlreadySent = hasNotificationMarker(saved.previousFields)

        // 同じsubmission_idが同時到着した場合、作成の敗者は先着の通知完了を待つ。
        // 先着が落ちたケースだけは30秒後の再送が引き継げるようにし、永久停止も避ける。
        if (!saved.created && !notificationAlreadySent) {
          for (let attempt = 0; attempt < 12 && !notificationAlreadySent; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 250))
            saved = await upsertBitableRecordByTextField({
              service: baseTarget.service,
              tableId: baseTarget.tableId,
              fieldName: baseTarget.service === "ridejob" ? "対応履歴メモ" : "submission_id",
              value: baseTarget.service === "ridejob" ? ridejobSubmissionMarker : incoming.submissionId,
              operator: baseTarget.service === "ridejob" ? "contains" : "is",
              fields: baseFields,
              updateExisting: false,
            })
            notificationAlreadySent = hasNotificationMarker(saved.previousFields)
          }
          const submittedAt = Number(saved.previousFields["応募日"])
          const notificationAge = Number.isFinite(submittedAt) ? Date.now() - submittedAt : undefined
          notificationInProgress = !notificationAlreadySent
            && (notificationAge === undefined || notificationAge < 30_000)
          // Larkのuuid重複排除は1時間のため、55分を超えた未確定通知は自動再送しない。
          // それ以前なら同じuuidで安全に復旧できる。
          notificationRecoveryExpired = !notificationAlreadySent
            && notificationAge !== undefined
            && notificationAge >= 55 * 60_000
          notificationRecoveryOnly = !initiallyCreated
            && !notificationAlreadySent
            && !notificationInProgress
            && !notificationRecoveryExpired
        }
        if (baseTarget.service === "ridejob") {
          latestRidejobMemo = String(
            saved.previousFields["対応履歴メモ"] ?? baseFields["対応履歴メモ"] ?? "",
          ).trim()
        }
        console.log("[INFO] Base upsert succeeded", {
          service: baseTarget.service,
          recordId: saved.recordId,
          created: saved.created,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("[ERROR] Base upsert failed", error)
        await notifyBaseRegistrationError({
          route: "submit-application",
          service: baseTarget.service,
          tableId: baseTarget.tableId,
          status: 0,
          message,
          applicant: {
            name: `${incoming.lastName ?? ""} ${incoming.firstName ?? ""}`.trim() || undefined,
            phone: incoming.phone,
            email: incoming.email,
          },
          job: { id: incoming.jobId, name: incoming.jobName, url: incoming.jobUrl },
        }).catch((alertError) => console.error("[alert] notifyBaseRegistrationError failed", alertError))
        return NextResponse.json({ success: false, message: "Failed to register application" }, { status: 500 })
      }
    }

    if (notificationInProgress) {
      console.warn("[INFO] Duplicate submission is still being processed", {
        submissionId: incoming.submissionId,
      })
      return NextResponse.json(
        { success: false, message: "Submission is still being processed; retry shortly" },
        { status: 503 },
      )
    }
    if (notificationRecoveryExpired) {
      console.error("[ERROR] Lark notification recovery window expired; automatic resend blocked", {
        submissionId: incoming.submissionId,
        baseRecordId,
      })
      return NextResponse.json(
        { success: false, message: "Notification recovery requires manual confirmation" },
        { status: 503 },
      )
    }

    type TaskResult = {
      name: "applicant_mail" | "applicant_sms" | "meta_capi"
      ok: boolean
    }
    const tasks: Promise<TaskResult>[] = []

    if (!notificationAlreadySent) {
      // 受付の正本となる社内通知を確定する。失敗時は同じsubmission_idで安全に再送できる。
      const notificationResult = await notifyLark({
        api: { service: notification.service, chatId: notification.chatId },
        webhookUrl: notification.url,
        payload: buildInternalLarkCard(incoming, classification, test),
        context: "submit-application:notification",
        idempotencyKey: incoming.submissionId,
        allowWebhookFallback: classification.isCpOne,
      })
      if (!notificationResult.ok) {
        return NextResponse.json({ success: false, message: "Failed to send notification to Lark" }, { status: 502 })
      }
      if (baseRecordId) {
        const notificationFields = baseTarget.service === "ridejob"
          ? {
              "対応履歴メモ": appendLarkNotificationMarker(latestRidejobMemo, incoming.submissionId),
            }
          : { "Lark通知送信済み": true }
        let notificationStatePersisted = false
        let lastPersistError: unknown
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            await updateBitableRecord({
              service: baseTarget.service,
              tableId: baseTarget.tableId,
              recordId: baseRecordId,
              fields: notificationFields,
            })
            notificationStatePersisted = true
            break
          } catch (error) {
            lastPersistError = error
            if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 100))
          }
        }
        if (!notificationStatePersisted) {
          console.error("[ERROR] Failed to persist Lark notification state after 3 attempts", lastPersistError)
          return NextResponse.json(
            { success: false, message: "Failed to persist notification state" },
            { status: 503 },
          )
        }
      }
    } else {
      console.log("[INFO] Duplicate submission already notified; skipping side effects", {
        submissionId: incoming.submissionId,
      })
      return NextResponse.json({ success: true, duplicate: true })
    }

    // 先着が通知済み印を書き込む前に終了した場合は、55分以内なら同じLark uuidで復旧する。
    // 元処理は印の確定前に後続へ進まないため、復旧側がメール・SMS・CAPIまで完了させる。
    if (notificationRecoveryOnly) {
      console.log("[INFO] Resuming downstream effects after notification recovery", {
        submissionId: incoming.submissionId,
      })
    }

    // CP One(LIFT JOB)は専用Baseにsubmission_id列が無いため、従来どおり
    // 通知成功後に非致命のcreateを行う。RIDE JOBの新しいupsert経路には載せない。
    if (!test.isTest && baseTarget.service === "liftjob") {
      const appFields = buildBitableFields(incoming, classification)
      const result = await createBitableRecord({
        service: baseTarget.service,
        tableId: baseTarget.tableId,
        fields: buildFieldsForService(baseTarget.service, appFields),
      }).catch((error: unknown): BitableCreateResult => ({
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : "bitable error",
      }))
      if (!result.ok) {
        console.warn(`[WARNING] Base registration failed (service=liftjob): status=${result.status} message=${result.message}`)
        await notifyBaseRegistrationError({
          route: "submit-application",
          service: baseTarget.service,
          tableId: baseTarget.tableId,
          status: result.status,
          code: result.code,
          message: result.message,
          applicant: {
            name: `${incoming.lastName ?? ""} ${incoming.firstName ?? ""}`.trim() || undefined,
            phone: incoming.phone,
            email: incoming.email,
          },
          job: { id: incoming.jobId, name: incoming.jobName, url: incoming.jobUrl },
        }).catch((error) => console.error("[alert] notifyBaseRegistrationError failed", error))
      }
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
