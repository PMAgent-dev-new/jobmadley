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
