import type { ApplicationFormData } from "@/features/application/types"
import { readAttribution } from "@/features/application/lib/attribution"

export type ApplyContext = {
  applicationSource: string
  jobUrl: string
  /** 最終接触の source/medium（後方互換。従来の utmSource/utmMedium） */
  utmSource: string
  utmMedium: string
  /** 初回接触の source/medium */
  utmSourceFirst: string
  utmMediumFirst: string
  /** 最終接触キャンペーン */
  utmCampaign: string
  /** 最終接触content。既存の求人ID互換値または広告名。 */
  utmContent: string
  /** 最終接触の取得時刻（ISO, 空文字なら不明） */
  utmLastTouchAt: string
  /** 初回接触の取得時刻（ISO, 空文字なら不明） */
  utmFirstTouchAt: string
  fbclid: string
  gclid: string
  catalogJobId: string
  catalogClickedAt: string
  catalogLandingPath: string
  catalogSource: string
  catalogMedium: string
  catalogEvidence: "utm" | "fbclid" | ""
}

const EMPTY_APPLY_CONTEXT: ApplyContext = {
  applicationSource: "unknown",
  jobUrl: "",
  utmSource: "",
  utmMedium: "",
  utmSourceFirst: "",
  utmMediumFirst: "",
  utmCampaign: "",
  utmContent: "",
  utmLastTouchAt: "",
  utmFirstTouchAt: "",
  fbclid: "",
  gclid: "",
  catalogJobId: "",
  catalogClickedAt: "",
  catalogLandingPath: "",
  catalogSource: "",
  catalogMedium: "",
  catalogEvidence: "",
}

export function buildBirthDate(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

/**
 * 応募経路は現在URLの明示値を最優先する。
 * カタログ詳細→応募画面では utm_source=meta を引き継ぐため、過去にlocalStorageへ
 * 保存された求人媒体があっても、今回のMetaクリックをそちらへ誤帰属させない。
 */
export function selectApplicationSource(
  rawSource: string | null | undefined,
  currentUtmSource: string | null | undefined,
  storedSource: string | null | undefined,
): string {
  const explicit = rawSource?.trim().toLowerCase()
  const currentUtm = currentUtmSource?.trim().toLowerCase()
  const stored = storedSource?.trim().toLowerCase()
  const effectiveStored = stored && stored !== "unknown" ? stored : ""
  return explicit || currentUtm || effectiveStored || "unknown"
}

// 整備士求人の応募先メール。@/shared/lark/routing の MECHANIC_APPLY_EMAIL と一致させること。
// （routing.ts は larkEnv を import するためクライアントに持ち込まず、値のみ複製している）
const MECHANIC_APPLY_EMAIL = "ridejob.mechanic@pmagent.jp"
// form_applicant は basePath=/entry で ridejob.jp に配信されている。
// 旧 ridejob.pmagent.jp（basePathなし）と同じページが /entry 配下に存在する。
const APPLICANTS_BASE = "https://ridejob.jp/entry"

/**
 * 応募完了ページのURLを求人種別で出し分ける。
 * - 整備士求人: /mechanic/applicants/new（メカニック予約 mec を埋め込み）
 * - それ以外:   /applicants/new（汎用=RIDEJOB予約 ride を埋め込み）
 * 判定は submit-application 側 detectMechanic と同一基準（完全一致）に合わせ、
 * 完了ページの予約導線を SMS/自動返信メールの種別と一致させる。
 */
export function resolveApplicationCompleteUrl(applyEmail: string | undefined | null): string {
  const isMechanic = applyEmail === MECHANIC_APPLY_EMAIL
  return isMechanic
    ? `${APPLICANTS_BASE}/mechanic/applicants/new`
    : `${APPLICANTS_BASE}/applicants/new`
}

/**
 * 応募送信時のブラウザ依存コンテキスト（source, jobUrl, UTM）を解決する。
 * URL から source が無く localStorage に有効値がある場合は URL を書き戻す。
 * SSR 時は空のコンテキストを返す。
 */
export function resolveApplyContext(jobUrlOverride?: string): ApplyContext {
  if (typeof window === "undefined") {
    return { ...EMPTY_APPLY_CONTEXT }
  }

  const searchParams = new URLSearchParams(window.location.search)
  const rawSource = searchParams.get("source")
  const storedSource = window.localStorage.getItem("application_source")?.trim().toLowerCase()
  const currentUtmSource = searchParams.get("utm_source")
  const applicationSource = selectApplicationSource(rawSource, currentUtmSource, storedSource)

  const shouldUpdateUrl = Boolean(rawSource)
  if (!rawSource && applicationSource !== "unknown") {
    searchParams.set("source", applicationSource)
  }
  let currentUrl = `${window.location.origin}${window.location.pathname}`
  const queryString = searchParams.toString()
  if (queryString) {
    currentUrl = `${currentUrl}?${queryString}`
  }
  if (shouldUpdateUrl && window.history && window.history.replaceState) {
    window.history.replaceState(null, "", currentUrl)
  }
  const target = jobUrlOverride ? new URL(jobUrlOverride, window.location.origin) : new URL(currentUrl)
  target.search = queryString
  const jobUrl = target.toString()

  const attr = readAttribution()
  const last = attr.lastTouch
  const first = attr.firstTouch
  const catalog = attr.catalogTouch
  const currentUtmMedium = searchParams.get("utm_medium")?.trim() || ""
  const currentUtmCampaign = searchParams.get("utm_campaign")?.trim() || ""
  const currentFbclid = searchParams.get("fbclid")?.trim() || ""
  const currentGclid = searchParams.get("gclid")?.trim() || ""

  const context: ApplyContext = {
    applicationSource,
    jobUrl,
    // 後方互換: 従来の utmSource/utmMedium は last-touch を指す
    utmSource: currentUtmSource?.trim() || last?.source || "",
    utmMedium: currentUtmMedium || last?.medium || "",
    utmSourceFirst: first?.source ?? "",
    utmMediumFirst: first?.medium ?? "",
    utmCampaign: currentUtmCampaign || last?.campaign || "",
    utmContent: searchParams.get("utm_content")?.trim() || last?.content || "",
    utmLastTouchAt: last?.at ?? "",
    utmFirstTouchAt: first?.at ?? "",
    fbclid: currentFbclid || attr.fbclid || "",
    gclid: currentGclid || attr.gclid || "",
    catalogJobId: catalog?.jobId ?? "",
    catalogClickedAt: catalog?.at ?? "",
    catalogLandingPath: catalog?.landing ?? "",
    catalogSource: catalog?.source ?? "",
    catalogMedium: catalog?.medium ?? "",
    catalogEvidence: catalog?.evidence ?? "",
  }

  if (context.utmSource || context.utmMedium) {
    console.log("[UTM] Retrieved from attribution:", {
      last: { source: context.utmSource, medium: context.utmMedium, at: context.utmLastTouchAt },
      first: { source: context.utmSourceFirst, medium: context.utmMediumFirst, at: context.utmFirstTouchAt },
    })
  }

  return context
}

export async function postApplication(payload: ApplicationFormData & {
  jobId: string
  applyEmail: string
  applicationSource: string
  metaEventId?: string
  submissionId: string
}): Promise<void> {
  const response = await fetch("/api/submit-application", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null) as { success?: boolean } | null
  if (!response.ok || body?.success !== true) {
    throw new Error(`応募受付APIが失敗しました: HTTP ${response.status}`)
  }
}

type StandbyCvPayload = {
  jobId: string
  jobName: string
  companyName: string
  jobUrl: string
  source: string
}

/**
 * standby 経由応募時の GTM dataLayer push と STANBY_CV.send を実行する。
 * 呼び出し側で「同一フォーム送信中に1回だけ」のガードを行う前提。
 */
export function pushStandbyCv({ jobId, jobName, companyName, jobUrl, source }: StandbyCvPayload): void {
  if (typeof window === "undefined") return
  const win = window as typeof window & {
    dataLayer?: Record<string, unknown>[]
    STANBY_CV?: { send: (siteCode: string, accountId: string) => void }
  }
  win.dataLayer = win.dataLayer ?? []
  win.dataLayer.push({
    event: "standby_cv_submit",
    jobId,
    jobName,
    companyName,
    jobUrl,
    source,
  })
  if (win.STANBY_CV && win.STANBY_CV.send) {
    win.STANBY_CV.send("ridejob-jp", "2171143810634182656")
  }
}
