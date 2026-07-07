// 環境変数アクセスを一元化する。必須/任意を明示し、必須が欠けていれば即座に失敗させる。

const read = (name: string): string | undefined => {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

const requireEnv = (name: string): string => {
  const value = read(name)
  if (!value) {
    const message = `${name} が環境変数に設定されていません`
    console.error(`[env] ${message}`)
    throw new Error(message)
  }
  return value
}

// microCMS（ビルド時/起動時に必須）
export const microcmsEnv = () => ({
  serviceDomain: requireEnv("NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN"),
  apiKey: requireEnv("MICROCMS_API_KEY"),
})

export const microcmsMediaEnv = () => ({
  serviceDomain: requireEnv("NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN_2"),
  apiKey: requireEnv("MICROCMS_API_KEY_2"),
})

// Lark Webhook（通知用のみ。Base登録は bitable API に移行）
export const larkEnv = {
  // 通知 Webhook（内部応募フォーム用）
  notification: () => read("LARK_WEBHOOK"),
  notificationCpOne: () => read("LARK_WEBHOOK_CPONE"),
  notificationMechanic: () => read("LARK_WEBHOOK_MECHANIC"),
  // 通知 Webhook（求人ボックス連携用）
  notificationCpOneKyujinbox: () => read("LARK_WEBHOOK_CPONE_KYUZINBOX"),
  // お問い合わせフォーム用（必須化：従来はハードコードフォールバックがあったが廃止）
  contact: () => requireEnv("LARK_CONTACT_WEBHOOK"),
  // エラー検知用（Base 登録失敗などをこの Webhook に通知）
  errorAlert: () => read("LARK_WEBHOOK_ERROR_ALERT"),
  // 通知先 chat_id（設定時は im/v1/messages API を優先、失敗/未設定時は上記 Webhook にフォールバック）
  chatId: () => read("LARK_CHAT_ID"),
  chatIdCpOne: () => read("LARK_CHAT_ID_CPONE"),
  chatIdMechanic: () => read("LARK_CHAT_ID_MECHANIC"),
  chatIdCpOneKyujinbox: () => read("LARK_CHAT_ID_CPONE_KYUJINBOX"),
}

// Lark Open API 用の認証情報（サービス別）
// 各サービスごとに別 App / 別 Base を使用するため、サービス単位で資格情報を持つ。
export type LarkServiceId = "ridejob" | "mechanic" | "liftjob"

export interface LarkServiceCredentials {
  appId: string
  appSecret: string
  appToken: string
  domain: string
}

const DEFAULT_LARK_DOMAIN = "open.larksuite.com"

// LARK_DOMAIN_* は `open.larksuite.com` 形式（スキームなし）で使う。
// クライアントが `https://${domain}` を組み立てるため、`https://` 付きや末尾スラッシュを許容して剥がす。
const normalizeLarkDomain = (raw: string): string =>
  raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")

const readServiceCredentials = (
  service: LarkServiceId,
  suffix: "RIDEJOB" | "MECHANIC" | "LIFTJOB",
  fallback?: { appId?: string; appSecret?: string; appToken?: string; domain?: string },
): LarkServiceCredentials => {
  const appId = read(`APP_ID_${suffix}`) ?? fallback?.appId
  const appSecret = read(`APP_SECRET_${suffix}`) ?? fallback?.appSecret
  const appToken = read(`APP_TOKEN_${suffix}`) ?? fallback?.appToken
  const domain = normalizeLarkDomain(read(`LARK_DOMAIN_${suffix}`) ?? fallback?.domain ?? DEFAULT_LARK_DOMAIN)
  if (!appId || !appSecret || !appToken) {
    throw new Error(`Lark service "${service}" の認証情報 (APP_ID_${suffix} / APP_SECRET_${suffix} / APP_TOKEN_${suffix}) が未設定です`)
  }
  return { appId, appSecret, appToken, domain }
}

export const larkServiceCredentials = (service: LarkServiceId): LarkServiceCredentials => {
  const fallback = {
    appId: read("LARK_APP_ID"),
    appSecret: read("LARK_APP_SECRET"),
    appToken: read("LARK_BASE_APP_TOKEN"),
    domain: read("LARK_DOMAIN"),
  }
  switch (service) {
    case "ridejob":
      return readServiceCredentials(service, "RIDEJOB", fallback)
    case "mechanic":
      return readServiceCredentials(service, "MECHANIC")
    case "liftjob":
      return readServiceCredentials(service, "LIFTJOB")
  }
}

// Gmail API（応募者向け自動返信。サービスアカウント + ドメインワイド委任）
// すべて任意。未設定時はメール送信をスキップする（応募処理は継続）。
export const gmailEnv = {
  /** サービスアカウントの client_email */
  clientEmail: () => read("GMAIL_SA_CLIENT_EMAIL"),
  /** サービスアカウントの private_key（PEM。改行は \n エスケープ可） */
  privateKey: () => {
    const raw = read("GMAIL_SA_PRIVATE_KEY")
    return raw ? raw.replace(/\\n/g, "\n") : undefined
  },
  // From / impersonate 先はメール種別ごとにプロファイルで指定する（applicantAutoReply.ts）。
  /** 設定が揃っているか（送信可否の判定に使用） */
  isConfigured: () => Boolean(read("GMAIL_SA_CLIENT_EMAIL") && read("GMAIL_SA_PRIVATE_KEY")),
}

// SMS（応募者向け自動SMS。CPaaS NOW を直送し、eeasy /api/sms/log に記録）
// すべて任意。CPAASNOW_API_TOKEN 未設定時は送信スキップ（応募処理は継続）。
// SMS_LOG_SECRET 未設定時は送信のみ行い eeasy への記録はスキップする。
export const smsEnv = {
  /** CPaaS NOW APIトークン（未設定なら送信しない） */
  cpaasToken: () => read("CPAASNOW_API_TOKEN"),
  /** CPaaS NOW エンドポイント（未設定ならサンドボックス＝実SMSは飛ばない） */
  cpaasBaseUrl: () => read("CPAASNOW_BASE_URL") ?? "https://sandbox.cpaasnow.com",
  /** 予約URLの基盤（?ref で送信→予約を突合） */
  bookingBaseUrl: () => read("SMS_BOOKING_BASE_URL") ?? "https://leomeet.pmagent.jp",
  /** eeasy 本体（送信ログ /api/sms/log の宛先） */
  eeasyBaseUrl: () => read("EEASY_BASE_URL") ?? "https://leomeet.pmagent.jp",
  /** eeasy /api/sms/log 用 Bearer（未設定なら記録スキップ） */
  logSecret: () => read("SMS_LOG_SECRET"),
  /** 送信可否（トークンが揃っているか） */
  isConfigured: () => Boolean(read("CPAASNOW_API_TOKEN")),
}

// その他
export const previewSecret = () => read("MICROCMS_PREVIEW_SECRET")
export const siteUrl = () => read("NEXT_PUBLIC_SITE_URL")
