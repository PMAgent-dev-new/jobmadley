// 通知送信の共通ラッパ。chat_id が設定されていれば Lark Open API (im/v1/messages) を優先し、
// 失敗または chat_id 未設定のときは従来の受信 Webhook にフォールバックする。
// これにより chat_id / スコープ未整備でも通知が途切れず、段階的に API へ移行できる。

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
}

export interface NotifyResult {
  ok: boolean
  via: "api" | "webhook" | "none"
}

export const notifyLark = async ({ api, webhookUrl, payload, context }: NotifyParams): Promise<NotifyResult> => {
  // 1) chat_id があれば API を優先
  if (api.chatId) {
    try {
      const r = await sendLarkMessage({
        service: api.service,
        chatId: api.chatId,
        card: payload.card,
        context: `${context}:api`,
      })
      if (r.ok) return { ok: true, via: "api" }
      console.warn(`[notify:${context}] API送信失敗、Webhookにフォールバック: code=${r.code} msg=${r.message}`)
    } catch (error) {
      console.warn(`[notify:${context}] API送信で例外、Webhookにフォールバック`, error)
    }
  }

  // 2) Webhook フォールバック
  if (webhookUrl) {
    const r = await sendToLark(webhookUrl, payload, `${context}:webhook`)
    return { ok: r.ok, via: "webhook" }
  }

  console.error(`[notify:${context}] 送信先が未設定（chat_id / webhook いずれも無し）`)
  return { ok: false, via: "none" }
}
