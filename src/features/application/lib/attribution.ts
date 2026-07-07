/**
 * 流入アトリビューションの取得・保存を一元化する（クライアント専用）。
 *
 * 従来は utm_source / utm_medium を個別 Cookie に 30 日保存し、
 * 「新しい UTM が来たときだけ上書き」していたため、
 *   - タイムスタンプが無く帰属期間を後から調整できない
 *   - first-touch / last-touch を区別できない
 *   - campaign / fbclid / referrer などを取りこぼす
 * という誤帰属の温床になっていた。
 *
 * ここでは 1 本の JSON Cookie `rj_attr` に構造化して保存する:
 *   - firstTouch は不変（初回接触を保持）
 *   - lastTouch は毎回更新（最終接触）
 *   - 各 touch に取得時刻 `at`(ISO) を持たせ、帰属期間の判定を集計側へ逃がす
 *   - fbclid / gclid / landing / referrer も保持
 *
 * 後方互換: 既存の GTM 等が参照する utm_source / utm_medium Cookie も
 * これまで通り書き続ける（last-touch の値）。読み出しは rj_attr を優先し、
 * 無ければ legacy Cookie にフォールバックする。
 */

export type AttributionTouch = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  /** 取得時刻（ISO 8601, UTC） */
  at: string
}

export type Attribution = {
  firstTouch?: AttributionTouch
  lastTouch?: AttributionTouch
  fbclid?: string
  gclid?: string
  /** 初回接触時のランディングパス（origin なし） */
  landing?: string
  /** 初回接触時の document.referrer */
  referrer?: string
}

const COOKIE_NAME = "rj_attr"
const MAX_AGE_SEC = 90 * 24 * 60 * 60 // 90 日（生値を長めに保持。帰属窓は集計側で決める）
const LEGACY_MAX_AGE_SEC = 30 * 24 * 60 * 60

/** Cookie ドメイン。クロスドメイン運用時のみ NEXT_PUBLIC_ATTR_COOKIE_DOMAIN で指定（例: .ridejob.jp）。 */
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_ATTR_COOKIE_DOMAIN

const parseCookies = (): Record<string, string> => {
  if (typeof document === "undefined") return {}
  return document.cookie.split("; ").reduce((acc, cookie) => {
    const idx = cookie.indexOf("=")
    if (idx === -1) return acc
    const key = cookie.slice(0, idx)
    const value = cookie.slice(idx + 1)
    if (key) acc[key] = decodeURIComponent(value)
    return acc
  }, {} as Record<string, string>)
}

const writeCookie = (name: string, value: string, maxAgeSec: number): void => {
  if (typeof document === "undefined") return
  const domainAttr = COOKIE_DOMAIN ? `; domain=${COOKIE_DOMAIN}` : ""
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax${domainAttr}`
}

const isMeaningful = (t: Partial<AttributionTouch>): boolean =>
  Boolean(t.source || t.medium || t.campaign || t.content || t.term)

/** URL から touch 相当のパラメータを抜き出す（値が無ければ undefined）。 */
const readTouchParams = (params: URLSearchParams): Partial<AttributionTouch> => {
  const pick = (key: string) => params.get(key)?.trim() || undefined
  return {
    source: pick("utm_source"),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
    content: pick("utm_content"),
    term: pick("utm_term"),
  }
}

/** 現在保存されているアトリビューションを読む（rj_attr 優先・legacy フォールバック）。 */
export function readAttribution(): Attribution {
  const cookies = parseCookies()
  const raw = cookies[COOKIE_NAME]
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Attribution
      if (parsed && typeof parsed === "object") return parsed
    } catch {
      // 壊れていれば legacy にフォールバック
    }
  }
  const legacySource = cookies.utm_source
  const legacyMedium = cookies.utm_medium
  if (legacySource || legacyMedium) {
    const touch: AttributionTouch = { source: legacySource, medium: legacyMedium, at: "" }
    return { firstTouch: touch, lastTouch: touch }
  }
  return {}
}

/**
 * URL のパラメータを取り込んでアトリビューションを更新・保存する。
 * 意味のある UTM/クリックIDが無い着地では何もしない（direct でも既存値を消さない）。
 * @param search 現在の location.search（"?..." 形式）
 * @param path   現在の location.pathname（初回ランディング記録用）
 * @param referrer document.referrer
 * @param nowIso 現在時刻の ISO 文字列（呼び出し側で new Date().toISOString()）
 */
export function captureAttribution(
  search: string,
  path: string,
  referrer: string,
  nowIso: string,
): Attribution {
  const params = new URLSearchParams(search)
  const touchParams = readTouchParams(params)
  const fbclid = params.get("fbclid")?.trim() || undefined
  const gclid = params.get("gclid")?.trim() || undefined

  const current = readAttribution()

  // UTM もクリックIDも無ければ既存値を維持（誤って上書き/消去しない）
  if (!isMeaningful(touchParams) && !fbclid && !gclid) {
    return current
  }

  const touch: AttributionTouch = { ...touchParams, at: nowIso }

  const next: Attribution = {
    firstTouch: current.firstTouch ?? (isMeaningful(touchParams) ? touch : current.firstTouch),
    lastTouch: isMeaningful(touchParams) ? touch : current.lastTouch,
    fbclid: fbclid ?? current.fbclid,
    gclid: gclid ?? current.gclid,
    landing: current.landing ?? path,
    referrer: current.referrer ?? (referrer || undefined),
  }

  writeCookie(COOKIE_NAME, JSON.stringify(next), MAX_AGE_SEC)

  // 後方互換: legacy な個別 Cookie も last-touch の値で書き続ける
  if (touch.source) writeCookie("utm_source", touch.source, LEGACY_MAX_AGE_SEC)
  if (touch.medium) writeCookie("utm_medium", touch.medium, LEGACY_MAX_AGE_SEC)

  return next
}
