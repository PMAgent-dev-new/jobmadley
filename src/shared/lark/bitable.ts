// Lark Bitable (Base) のレコード作成 API を呼ぶクライアント。
// 公式 doc: https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/bitable-v1/app-table-record/create

import { larkServiceCredentials, type LarkServiceId } from "@/shared/config/env"
import { getTenantAccessToken, invalidateTenantAccessToken } from "@/shared/lark/auth"
import { createHash } from "node:crypto"

export interface BitableCreateResult {
  ok: boolean
  status: number
  code?: number
  message?: string
  recordId?: string
}

interface CreateRecordParams {
  service: LarkServiceId
  tableId: string
  fields: Record<string, unknown>
}

export type BitableUpsertResult = {
  recordId: string
  created: boolean
  previousFields: Record<string, unknown>
}

const LARK_FETCH_TIMEOUT_MS = 5000

/** Lark filter 式の値部分を最低限エスケープ (ダブルクオートは扱えないので除去) */
const sanitizeFilterValue = (raw: string): string => raw.replace(/"/g, "").trim()

interface FindRecordParams {
  service: LarkServiceId
  tableId: string
  /** 完全一致を試みたいフィールド名（例: "企業名"） */
  fieldName: string
  /** 検索する値 */
  value: string
}

/**
 * 指定フィールドの完全一致で最初に見つかったレコードの record_id を返す。
 * 見つからない場合は undefined。SingleLink 設定用の lookup として利用する。
 */
export const findRecordIdByField = async ({
  service,
  tableId,
  fieldName,
  value,
}: FindRecordParams): Promise<string | undefined> => {
  const safeValue = sanitizeFilterValue(value)
  if (!safeValue) return undefined
  const { domain, appToken } = larkServiceCredentials(service)
  const filter = `CurrentValue.[${fieldName}]="${safeValue}"`
  const endpoint = `https://${domain}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=1&filter=${encodeURIComponent(filter)}`

  const callOnce = async (token: string): Promise<{ res: Response; body: any }> => {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(LARK_FETCH_TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => ({}))) as any
    return { res, body }
  }

  let token = await getTenantAccessToken(service)
  let { res, body } = await callOnce(token)
  if (body?.code === 99991663 || body?.code === 99991664) {
    invalidateTenantAccessToken(service)
    token = await getTenantAccessToken(service)
    ;({ res, body } = await callOnce(token))
  }
  if (!res.ok || body?.code !== 0) return undefined
  const items: Array<{ record_id?: string }> = body?.data?.items ?? []
  return items[0]?.record_id
}

export const createBitableRecord = async ({
  service,
  tableId,
  fields,
}: CreateRecordParams): Promise<BitableCreateResult> => {
  const { domain, appToken } = larkServiceCredentials(service)
  const endpoint = `https://${domain}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`

  const callOnce = async (token: string): Promise<{ res: Response; body: any }> => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(LARK_FETCH_TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => ({}))) as any
    return { res, body }
  }

  let token = await getTenantAccessToken(service)
  let { res, body } = await callOnce(token)

  // トークン無効化エラーは 1回だけリトライ (99991663=invalid token, 99991664=expired)
  if (body?.code === 99991663 || body?.code === 99991664) {
    invalidateTenantAccessToken(service)
    token = await getTenantAccessToken(service)
    ;({ res, body } = await callOnce(token))
  }

  if (!res.ok || body?.code !== 0) {
    return {
      ok: false,
      status: res.status,
      code: body?.code,
      message: body?.msg || `bitable create_record failed (${service}/${tableId})`,
    }
  }
  return {
    ok: true,
    status: res.status,
    code: body?.code ?? 0,
    recordId: body?.data?.record?.record_id,
  }
}

const idempotencyToken = (value: string): string => {
  const bytes = createHash("sha256").update(value, "utf8").digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const callWithTokenRefresh = async <T>(
  service: LarkServiceId,
  call: (token: string) => Promise<{ res: Response; body: T & { code?: number } }>,
): Promise<{ res: Response; body: T & { code?: number } }> => {
  let token = await getTenantAccessToken(service)
  let result = await call(token)
  if (result.body?.code === 99991663 || result.body?.code === 99991664) {
    invalidateTenantAccessToken(service)
    token = await getTenantAccessToken(service)
    result = await call(token)
  }
  return result
}

export const upsertBitableRecordByTextField = async ({
  service,
  tableId,
  fieldName,
  value,
  fields,
  operator = "is",
  updateExisting = true,
}: CreateRecordParams & {
  fieldName: string
  value: string
  operator?: "is" | "contains"
  updateExisting?: boolean
}): Promise<BitableUpsertResult> => {
  const uniqueValue = value.trim()
  if (!uniqueValue) throw new Error("bitable upsert key is empty")
  const { domain, appToken } = larkServiceCredentials(service)
  const base = `https://${domain}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`
  const searchCurrent = () => callWithTokenRefresh(service, async (token) => {
    const res = await fetch(`${base}/search?page_size=2`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        filter: {
          conjunction: "and",
          conditions: [{ field_name: fieldName, operator, value: [uniqueValue] }],
        },
      }),
      signal: AbortSignal.timeout(LARK_FETCH_TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => ({}))) as {
      code?: number
      msg?: string
      data?: { items?: Array<{ record_id?: string; fields?: Record<string, unknown> }> }
    }
    return { res, body }
  })
  const searched = await searchCurrent()
  if (!searched.res.ok || searched.body.code !== 0) {
    throw new Error(`bitable search failed: code=${searched.body.code} msg=${searched.body.msg}`)
  }
  const items = searched.body.data?.items ?? []
  if (items.length > 1) throw new Error(`duplicate bitable upsert key: ${uniqueValue}`)
  const existing = items[0]
  if (existing?.record_id) {
    // 応募受付の再送では、通知済み印を含む既存レコードを読み取り専用で扱う。
    // 更新すると通知済み印が消え、次回の再送で二重通知になるため。
    if (!updateExisting) {
      return { recordId: existing.record_id, created: false, previousFields: existing.fields ?? {} }
    }
    const updated = await callWithTokenRefresh(service, async (token) => {
      const res = await fetch(`${base}/${existing.record_id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(LARK_FETCH_TIMEOUT_MS),
      })
      const body = (await res.json().catch(() => ({}))) as { code?: number; msg?: string }
      return { res, body }
    })
    if (!updated.res.ok || updated.body.code !== 0) {
      throw new Error(`bitable update failed: code=${updated.body.code} msg=${updated.body.msg}`)
    }
    return { recordId: existing.record_id, created: false, previousFields: existing.fields ?? {} }
  }

  const created = await callWithTokenRefresh(service, async (token) => {
    const clientToken = idempotencyToken(`${appToken}/${tableId}/${fieldName}/${uniqueValue}`)
    const res = await fetch(`${base}?client_token=${encodeURIComponent(clientToken)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(LARK_FETCH_TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => ({}))) as {
      code?: number
      msg?: string
      data?: { record?: { record_id?: string } }
    }
    return { res, body }
  })
  const recordId = created.body.data?.record?.record_id
  // Larkのclient_token重複（1254608）は「既存結果の再返却」ではなくエラーになる。
  // 同時リクエストの敗者は作成済みレコードを再検索し、以降の通知競合待ちへ渡す。
  if (created.body.code === 1254608) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const replayed = await searchCurrent()
    const replayedItems = replayed.body.data?.items ?? []
    if (!replayed.res.ok || replayed.body.code !== 0 || replayedItems.length !== 1 || !replayedItems[0]?.record_id) {
      throw new Error(`bitable idempotency replay lookup failed: code=${replayed.body.code} matches=${replayedItems.length}`)
    }
    return {
      recordId: replayedItems[0].record_id,
      created: false,
      previousFields: replayedItems[0].fields ?? {},
    }
  }
  if (!created.res.ok || created.body.code !== 0 || !recordId) {
    throw new Error(`bitable create failed: code=${created.body.code} msg=${created.body.msg}`)
  }
  return { recordId, created: true, previousFields: {} }
}

export const updateBitableRecord = async ({
  service,
  tableId,
  recordId,
  fields,
}: CreateRecordParams & { recordId: string }): Promise<void> => {
  const { domain, appToken } = larkServiceCredentials(service)
  const endpoint = `https://${domain}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`
  const updated = await callWithTokenRefresh(service, async (token) => {
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(LARK_FETCH_TIMEOUT_MS),
    })
    const body = (await res.json().catch(() => ({}))) as { code?: number; msg?: string }
    return { res, body }
  })
  if (!updated.res.ok || updated.body.code !== 0) {
    throw new Error(`bitable update failed: code=${updated.body.code} msg=${updated.body.msg}`)
  }
}
