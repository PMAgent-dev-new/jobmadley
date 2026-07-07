// 求人種別／応募経路に応じた Lark 連携先の選択ロジックを集約。
// submit-application（内部フォーム）と applications（求人ボックス連携）で共通利用される。
// 通知は Webhook、Base 登録は bitable API に振り分ける。

import { larkEnv, type LarkServiceId } from "@/shared/config/env"
import { SERVICE_TABLES } from "@/shared/lark/bitable-schema"

export interface JobClassification {
  /** 整備士求人かどうか（applyEmail で判定済み） */
  isMechanic: boolean
  /** CP One Japan 合同会社の求人かどうか（companyName で判定） */
  isCpOne: boolean
  /** PM Agent の求人かどうか（companyName で判定。メール文面の出し分けで使用） */
  isPmAgent?: boolean
  /** 応募経路がスタンバイか（applicationSource または jobUrl から判定） */
  isStandby?: boolean
  /** 応募経路が求人ボックスか */
  isKyujinbox?: boolean
}

/** companyName から CP One 判定 */
export const detectCpOne = (companyName: string | undefined | null): boolean =>
  typeof companyName === "string" && companyName.includes("CP One Japan")

/** companyName から PM Agent 判定 */
export const detectPmAgent = (companyName: string | undefined | null): boolean =>
  typeof companyName === "string" && companyName.includes("PM Agent")

/** applyEmail から整備士判定 */
export const MECHANIC_APPLY_EMAIL = "ridejob.mechanic@pmagent.jp"
export const detectMechanic = (applyEmail: string | undefined | null): boolean =>
  applyEmail === MECHANIC_APPLY_EMAIL

/** applicationSource または jobUrl から流入経路を正規化 */
export const normalizeSource = (
  applicationSource: string | undefined,
  jobUrl: string | undefined,
): string | undefined => {
  const fromSource = applicationSource?.trim().toLowerCase()
  if (fromSource) return fromSource
  if (typeof jobUrl === "string" && jobUrl.includes("source=standby")) return "standby"
  return undefined
}

// === チャネル正規化 ===

/** 集計用の正規化チャネル。生の utm 値のブレ（meta/Meta/facebook 等）を吸収する。 */
export type MarketingChannel =
  | "paid_social"
  | "paid_search"
  | "organic_search"
  | "job_board"
  | "referral"
  | "direct"
  | "other"

const CHANNEL_LABEL: Record<MarketingChannel, string> = {
  paid_social: "有料SNS広告",
  paid_search: "リスティング広告",
  organic_search: "自然検索",
  job_board: "求人媒体",
  referral: "参照サイト",
  direct: "直接/不明",
  other: "その他",
}

const PAID_SOCIAL_SOURCES = new Set(["meta", "facebook", "fb", "ig", "instagram", "messenger", "audience_network"])
const PAID_SOCIAL_MEDIUMS = new Set(["catalog", "paid_social", "paidsocial", "cpc_social", "social_paid"])
const SEARCH_SOURCES = new Set(["google", "yahoo", "bing", "yahoo!", "duckduckgo"])
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "sem"])
const JOB_BOARD_SOURCES = new Set(["standby", "kyujinbox", "indeed", "stanby"])

/**
 * utm_source / utm_medium / applicationSource からマーケティングチャネルを正規化分類する。
 * 生値は保持したまま、集計をブレさせないための正規化ラベルを返す。
 */
export const classifyChannel = (
  source: string | undefined,
  medium: string | undefined,
  applicationSource?: string,
): { channel: MarketingChannel; label: string } => {
  const s = source?.trim().toLowerCase() ?? ""
  const m = medium?.trim().toLowerCase() ?? ""
  const appSrc = applicationSource?.trim().toLowerCase() ?? ""

  const wrap = (channel: MarketingChannel) => ({ channel, label: CHANNEL_LABEL[channel] })

  // 求人媒体連携（standby / kyujinbox / indeed）は最優先
  if (JOB_BOARD_SOURCES.has(appSrc) || JOB_BOARD_SOURCES.has(s)) return wrap("job_board")

  // 有料SNS（Meta広告・カタログ/フィード広告を含む）
  if (PAID_SOCIAL_SOURCES.has(s) || PAID_SOCIAL_MEDIUMS.has(m)) return wrap("paid_social")

  // 検索エンジン: medium が有料なら paid_search、それ以外は organic_search
  if (SEARCH_SOURCES.has(s)) return PAID_MEDIUMS.has(m) ? wrap("paid_search") : wrap("organic_search")

  // 汎用 cpc/ppc（source 不明でも有料判定）
  if (PAID_MEDIUMS.has(m)) return wrap("paid_search")

  if (m === "referral" || (s && !SEARCH_SOURCES.has(s) && m === "")) {
    // referral 明示、または source があるが medium 不明 → 参照扱い
    if (m === "referral") return wrap("referral")
  }

  // UTM も applicationSource も無ければ直接/不明
  if (!s && !m && (!appSrc || appSrc === "unknown")) return wrap("direct")

  return wrap("other")
}

// === Base 登録（bitable API）— 内部フォーム/求人ボックス共通 ===

/** 求人分類から Base 登録先サービスを決定 (CP One > 整備士 > デフォルト) */
export const resolveBaseService = ({ isCpOne, isMechanic }: JobClassification): LarkServiceId => {
  if (isCpOne) return "liftjob"
  if (isMechanic) return "mechanic"
  return "ridejob"
}

export interface BaseTarget {
  service: LarkServiceId
  tableId: string
}

/** 求人分類から Base 登録先 (service + tableId) を返す */
export const resolveBaseTarget = (classification: JobClassification): BaseTarget => {
  const service = resolveBaseService(classification)
  return { service, tableId: SERVICE_TABLES[service].tableId }
}

// === 通知先（chat_id=API優先 / url=Webhookフォールバック）===
// 送信元アプリは Base と同じサービス分類を再利用（mechanic→mechanic / CP One→liftjob / 既定→ridejob）。
// 当該アプリは宛先チャットのメンバーかつ im:message スコープを持つ必要がある。

export interface NotificationTarget {
  service: LarkServiceId
  chatId: string | undefined
  url: string | undefined
  type: string
}

/**
 * 通知先を解決（内部フォーム）。優先順: CP One > 整備士 > デフォルト
 */
export const resolveSubmitNotificationTarget = (classification: JobClassification): NotificationTarget => {
  const { isCpOne, isMechanic } = classification
  const service = resolveBaseService(classification)
  if (isCpOne) return { service, chatId: larkEnv.chatIdCpOne(), url: larkEnv.notificationCpOne(), type: "CPONE" }
  if (isMechanic) return { service, chatId: larkEnv.chatIdMechanic(), url: larkEnv.notificationMechanic(), type: "MECHANIC" }
  return { service, chatId: larkEnv.chatId(), url: larkEnv.notification(), type: "DEFAULT" }
}

/**
 * 通知先を解決（求人ボックス連携）。
 * CP One は専用 chat_id/Webhook があれば優先し、無ければ既定にフォールバック。
 */
export const resolveKyujinboxNotificationTarget = (classification: JobClassification): NotificationTarget => {
  const { isCpOne, isMechanic } = classification
  const service = resolveBaseService(classification)
  if (isCpOne) {
    return {
      service,
      chatId: larkEnv.chatIdCpOneKyujinbox() ?? larkEnv.chatIdCpOne(),
      url: larkEnv.notificationCpOneKyujinbox() ?? larkEnv.notification(),
      type: "CPONE_KYUJINBOX",
    }
  }
  if (isMechanic) {
    return { service, chatId: larkEnv.chatIdMechanic(), url: larkEnv.notificationMechanic() ?? larkEnv.notification(), type: "MECHANIC" }
  }
  return { service, chatId: larkEnv.chatId(), url: larkEnv.notification(), type: "DEFAULT" }
}
