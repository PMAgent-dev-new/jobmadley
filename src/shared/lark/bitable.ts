// Lark Bitable (Base) のレコード作成 API を呼ぶクライアント。
// 公式 doc: https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/bitable-v1/app-table-record/create

import { larkServiceCredentials, type LarkServiceId } from "@/shared/config/env"
import { getTenantAccessToken, invalidateTenantAccessToken } from "@/shared/lark/auth"

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
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
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
