// Lark Webhook送信の共通トランスポート。
// HTTPステータスだけでなくレスポンス本文の code/StatusCode が 0 でない場合も失敗として扱う。

export interface LarkSendResult {
  ok: boolean
  status: number
  body: string
  code?: number
  message?: string
}

interface LarkResponseBody {
  code?: number
  msg?: string
  StatusCode?: number
  StatusMessage?: string
}

const LARK_FETCH_TIMEOUT_MS = 5000

/**
 * Lark Webhookに POST する。
 *
 * Larkは HTTP 200 でも本文の `code` 非0 で失敗を返すことがあるので、両方を見て成否判定する。
 */
export const sendToLark = async (
  webhookUrl: string,
  payload: unknown,
  context: string,
): Promise<LarkSendResult> => {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LARK_FETCH_TIMEOUT_MS),
    })
    const body = await response.text()

    let parsed: LarkResponseBody | null = null
    try {
      parsed = JSON.parse(body) as LarkResponseBody
    } catch {
      // 本文が JSON でない場合は HTTP ステータスのみで判定
    }

    const code = parsed?.code ?? parsed?.StatusCode
    const message = parsed?.msg ?? parsed?.StatusMessage
    const codeOk = typeof code === "number" ? code === 0 : true
    const ok = response.ok && codeOk

    if (!ok) {
      console.error(`[lark:${context}] webhook failed`, { status: response.status, body, code, message })
    }

    return { ok, status: response.status, body, code, message }
  } catch (error) {
    console.error(`[lark:${context}] webhook exception`, error)
    return {
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
      message: "network_or_runtime_error",
    }
  }
}
