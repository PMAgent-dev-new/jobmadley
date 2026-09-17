// 通知送信の共通ラッパ。chat_id が設定されていれば Lark Open API (im/v1/messages) を優先し、
// 既存経路では従来Webhookへフォールバックできる。応募通知はuuidの冪等性を守るため、
// chat_id APIの結果が不明・失敗ならWebhookへ二重送信せず、同じuuidでの再送に任せる。

import type { LarkServiceId } from "@/shared/config/env"
import { sendToLark } from "@/shared/lark/client"
import { sendLarkMessage } from "@/shared/lark/im"

/** Webhook 形式のインタラクティブカードペイロード（{ msg_type, card }）。 */
interface WebhookCardPayload {
  msg_type: string
  card: Record<string, unknown>
}

interface NotifyParams {
  /** API 送信先（chatId 未設定なら API はスキップ） */
  api: { service: LarkServiceId; chatId: string | undefined }
  /** フォールバック先 Webhook URL（未設定なら Webhook はスキップ） */
  webhookUrl: string | undefined
  /** Webhook 形式のカードペイロード。API 送信時は内側の card を content 化する。 */
  payload: WebhookCardPayload
  context: string
  idempotencyKey?: string
  /** 応募通知はUUID冪等性を守るためfalse。既存経路のみtrue。 */
  allowWebhookFallback?: boolean
}

export interface NotifyResult {
  ok: boolean
  via: "api" | "webhook" | "none"
}

export const notifyLark = async ({ api, webhookUrl, payload, context, idempotencyKey, allowWebhookFallback = true }: NotifyParams): Promise<NotifyResult> => {
  // 1) chat_id があれば API を優先
  if (api.chatId) {
    try {
      const r = await sendLarkMessage({
        service: api.service,
        chatId: api.chatId,
        card: payload.card,
        context: `${context}:api`,
        idempotencyKey,
      })
      if (r.ok) return { ok: true, via: "api" }
      // 通信例外はLark側だけ成功している可能性がある。同じuuidでの再送に任せ、
      // ここでWebhookへ二重送信しない。
      if (idempotencyKey && r.status === 0) return { ok: false, via: "api" }
      if (!allowWebhookFallback) return { ok: false, via: "api" }
      console.warn(`[notify:${context}] API送信失敗、Webhookにフォールバック: code=${r.code} msg=${r.message}`)
    } catch (error) {
      if (!allowWebhookFallback) return { ok: false, via: "api" }
      console.warn(`[notify:${context}] API送信で例外、Webhookにフォールバック`, error)
    }
  }

  // 2) Webhook フォールバック
  if (allowWebhookFallback && webhookUrl) {
    const r = await sendToLark(webhookUrl, payload, `${context}:webhook`)
    return { ok: r.ok, via: "webhook" }
  }

  console.error(`[notify:${context}] 送信先が未設定（chat_id / webhook いずれも無し）`)
  return { ok: false, via: "none" }
}
