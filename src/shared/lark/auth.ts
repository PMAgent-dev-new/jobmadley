// Lark Open API の tenant_access_token をサービスごとに取得・キャッシュする。
// 公式 doc: https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/auth-v3/tenant_access_token_internal

import { larkServiceCredentials, type LarkServiceId } from "@/shared/config/env"

interface CachedToken {
  token: string
  expiresAt: number
}

const cache = new Map<LarkServiceId, CachedToken>()
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000

const fetchTenantAccessToken = async (service: LarkServiceId): Promise<CachedToken> => {
  const { appId, appSecret, domain } = larkServiceCredentials(service)
  const endpoint = `https://${domain}/open-apis/auth/v3/tenant_access_token/internal`
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const data = (await res.json()) as { code?: number; msg?: string; tenant_access_token?: string; expire?: number }
  if (!res.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`tenant_access_token 取得失敗 (${service}): code=${data.code} msg=${data.msg}`)
  }
  const expireSec = typeof data.expire === "number" && data.expire > 0 ? data.expire : 7200
  return {
    token: data.tenant_access_token,
    expiresAt: Date.now() + expireSec * 1000,
  }
}

export const getTenantAccessToken = async (service: LarkServiceId): Promise<string> => {
  const cached = cache.get(service)
  if (cached && cached.expiresAt - Date.now() > REFRESH_THRESHOLD_MS) {
    return cached.token
  }
  const fresh = await fetchTenantAccessToken(service)
  cache.set(service, fresh)
  return fresh.token
}

export const invalidateTenantAccessToken = (service: LarkServiceId): void => {
  cache.delete(service)
}
