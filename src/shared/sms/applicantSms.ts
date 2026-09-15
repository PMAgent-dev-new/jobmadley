// 応募者向け自動SMSの組み立て・送信オーケストレーション。
// 電話正規化 → 文面生成 → CPaaS NOW 直送 → eeasy /api/sms/log に記録。
// 文面・channel語彙・電話正規化は eeasy lib/sms-send.ts と揃える（予約ファネルを共有するため）。
// 失敗しても例外を投げず結果オブジェクトで返す（呼び出し側で非致命扱い）。

import { smsEnv } from "@/shared/config/env"
import { sendShortMessage } from "@/shared/sms/cpaas"

export type SmsChannel = "ridejob" | "mechanic" | "default"

// channel -> eeasy の予約専用 slug（bookings.sms_ref で送信→予約を突合）
const SMS_SLUG: Record<SmsChannel, string> = {
  ridejob: "ride-sms",
  mechanic: "mec-sms",
  default: "cpj-sms",
}

/**
 * SMS送信用に電話番号を正規化する。送れない形式なら null。
 * （eeasy lib/sms-send.ts normalizePhone と同等）
 * 全角→半角 / 空白・ハイフン・括弧除去 / +81・81→0 / 070・080・090 11桁 or 020 11桁・14桁のみ許可。0800は不可。
 */
export const normalizePhone = (input: string | null | undefined): string | null => {
  if (!input) return null
  let s = input.replace(/[０-９＋－]/g, (c) => "0123456789+-"["０１２３４５６７８９＋－".indexOf(c)])
  s = s.replace(/[\s\-()（）]/g, "").trim()
  if (!s) return null
  if (s.startsWith("+81")) s = "0" + s.slice(3)
  else if (s.startsWith("81") && !s.startsWith("810")) s = "0" + s.slice(2)
  if (!/^\d+$/.test(s)) return null
  if (s.startsWith("0800")) return null
  if (/^0[789]0\d{8}$/.test(s)) return s
  if (/^020\d{8}$/.test(s) || /^020\d{11}$/.test(s)) return s
  return null
}

/** user_reference 兼 予約突合キー。[A-Za-z0-9_-] 1-40字。 */
export const buildRef = (channel: SmsChannel, applicantId?: string | null): string => {
  const sanitized = (applicantId ?? "").replace(/[^A-Za-z0-9_-]/g, "")
  const ref = sanitized
    ? `${channel}_${sanitized}`
    : `meta-${channel}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return ref.slice(0, 40)
}

export const buildBookingUrl = (channel: SmsChannel, ref: string): string => {
  const base = smsEnv.bookingBaseUrl().replace(/\/+$/, "")
  return `${base}/book/${SMS_SLUG[channel]}?ref=${ref}`
}

/**
 * 応募者向けSMS本文。改行は CRLF（端末で LF だけだと改行されないことがある）。
 * 職種を断定しない中立文面（channel は予約枠/slug の決定にのみ使う）。
 */
export const buildMessage = (args: {
  applicantName?: string | null
  url: string
  intent?: "apply" | "consult"
}): string => {
  const name = (args.applicantName ?? "").trim()
  const consult = args.intent === "consult"
  const nameLine = name ? `${name}様` : consult ? "転職相談ありがとうございます" : "ご応募ありがとうございます"
  return [
    nameLine,
    "",
    consult ? "RIDE JOBへ転職相談をお申し込みいただきありがとうございます。" : "RIDEJOBへご応募いただきありがとうございます。",
    "",
    consult
      ? "ご希望条件と求人詳細を確認する面談（20分・履歴書不要）のご案内です。以下よりご予約ください。"
      : "次のステップ（カジュアル面談・20分・履歴書不要）のご案内です。以下よりご予約ください。",
    "",
    "▼面談予約はこちら",
    args.url,
  ].join("\r\n")
}

export interface SmsResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  deliveryOrderId?: number
  /** eeasy /api/sms/log への記録に成功したか */
  logged?: boolean
  message?: string
}

/**
 * 応募者に自動SMSを送信し、eeasy に記録する。
 * - CPaaSトークン未設定 / 電話番号が送信不可形式 → skipped:true（送信しない）
 * - 送信成功・記録のみ失敗でも ok:true（logged:false）
 */
export const sendApplicantSms = async (
  input: {
    phone?: string | null
    channel: SmsChannel
    applicantName?: string | null
    applicantId?: string | null
    /** eeasy 記録上の媒体ラベル（meta / kyujinbox 等。任意） */
    media?: string
    intent?: "apply" | "consult"
  },
  context: string,
): Promise<SmsResult> => {
  if (!smsEnv.isConfigured()) {
    return { ok: false, skipped: true, reason: "not_configured" }
  }
  const to = normalizePhone(input.phone)
  if (!to) {
    return { ok: false, skipped: true, reason: "invalid_phone" }
  }

  const ref = buildRef(input.channel, input.applicantId)
  const url = buildBookingUrl(input.channel, ref)
  const text = buildMessage({ applicantName: input.applicantName, url, intent: input.intent })

  const send = await sendShortMessage({ to, text, userReference: ref, clickTracking: true }, context)
  if (!send.ok || !send.deliveryOrderId) {
    return { ok: false, skipped: send.skipped, reason: send.skipped ? "not_configured" : undefined, message: send.message }
  }

  const logged = await logToEeasy(
    {
      deliveryOrderId: send.deliveryOrderId,
      toPhone: to,
      userReference: ref,
      applicantName: input.applicantName?.trim() || undefined,
      channel: input.channel,
      media: input.media ?? "meta",
      body: text,
      bookingUrl: url,
      // acceptedAt はオフセット付き ISO のみ送る（eeasy 側 zod 検証が offset 必須）
      acceptedAt:
        send.acceptedAt && /\dT\d.*([+\-]\d\d:?\d\d|Z)$/.test(send.acceptedAt) ? send.acceptedAt : undefined,
    },
    context,
  )

  return { ok: true, deliveryOrderId: send.deliveryOrderId, logged }
}

/** eeasy /api/sms/log へ送信ログを記録（Bearer SMS_LOG_SECRET）。失敗は false を返すのみ。 */
const logToEeasy = async (rec: Record<string, unknown>, context: string): Promise<boolean> => {
  const secret = smsEnv.logSecret()
  if (!secret) return false
  try {
    const res = await fetch(`${smsEnv.eeasyBaseUrl().replace(/\/+$/, "")}/api/sms/log`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(rec),
      cache: "no-store",
    })
    if (!res.ok) {
      console.error(`[sms:${context}] eeasy log failed`, { status: res.status, body: (await res.text()).slice(0, 300) })
      return false
    }
    return true
  } catch (error) {
    console.error(`[sms:${context}] eeasy log exception`, error)
    return false
  }
}
