// Lark Open API (im/v1/messages) でメッセージ（インタラクティブカード）を送信するクライアント。
// 公式 doc: https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create
//
// 送信元アプリ（service の資格情報）は宛先チャットのメンバーであり、im:message スコープを持つ必要がある。

import { larkServiceCredentials, type LarkServiceId } from "@/shared/config/env"
import { getTenantAccessToken, invalidateTenantAccessToken } from "@/shared/lark/auth"

export interface LarkMessageResult {
  ok: boolean
  status: number
  code?: number
  message?: string
  messageId?: string
}

interface SendMessageParams {
  service: LarkServiceId
  /** 宛先 chat_id（receive_id_type=chat_id） */
  chatId: string
  /** カード本体（elements/header/config を持つ内側オブジェクト。msg_type ラッパは含めない） */
  card: Record<string, unknown>
  context: string
}

/**
 * インタラクティブカードを chat_id 宛に送信する。
 * Webhook と異なり card は `content` に JSON 文字列化して渡す。
 */
export const sendLarkMessage = async ({
  service,
  chatId,
  card,
  context,
}: SendMessageParams): Promise<LarkMessageResult> => {
  const { domain } = larkServiceCredentials(service)
  const endpoint = `https://${domain}/open-apis/im/v1/messages?receive_id_type=chat_id`
  const body = {
    receive_id: chatId,
    msg_type: "interactive",
    content: JSON.stringify(card),
  }

  const callOnce = async (token: string): Promise<{ res: Response; data: any }> => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as any
    return { res, data }
  }

  try {
    let token = await getTenantAccessToken(service)
    let { res, data } = await callOnce(token)

    // トークン無効化エラーは 1回だけリトライ (99991663=invalid token, 99991664=expired)
    if (data?.code === 99991663 || data?.code === 99991664) {
      invalidateTenantAccessToken(service)
      token = await getTenantAccessToken(service)
      ;({ res, data } = await callOnce(token))
    }

    if (!res.ok || data?.code !== 0) {
      console.error(`[lark:${context}] im message failed`, { status: res.status, code: data?.code, msg: data?.msg })
      return { ok: false, status: res.status, code: data?.code, message: data?.msg }
    }
    return { ok: true, status: res.status, code: data?.code ?? 0, messageId: data?.data?.message_id }
  } catch (error) {
    console.error(`[lark:${context}] im message exception`, error)
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
