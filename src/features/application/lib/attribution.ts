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
  /**
   * ChatGPT広告のクリック識別子。OpenAI が着地URLへ自動付与する。
   * 送信先はまだ無いが、後から Pixel / Conversions API を入れても保存していなかった期間は
   * 遡って紐づけられないため、先に保存だけしておく。
   * ⚠️ form_applicant と同じ Cookie(rj_attr) を共有しているのでスキーマを揃えること。
   */
  oppref?: string
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
    if (!key) return acc
    // ⚠️ decode は1本ずつ try で囲む。`%` を生で含む Cookie が1つでもあると
    // decodeURIComponent が URIError を投げ、**このドメインの全 Cookie の読み取りが失敗する**。
    // UTMCapture は root layout で全ページ動くため、effect の未捕捉例外＝サイト全体が
    // エラー画面になる。Cookie を書く主体は GTM 経由の計測タグを含め複数ある。
    try {
      acc[key] = decodeURIComponent(value)
    } catch {
      acc[key] = value
    }
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

/** 参照元ホスト名 → 検索エンジンの source 名。該当なしは undefined。 */
const SEARCH_ENGINE_HOSTS: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)(search\.)?yahoo\./, "yahoo"],
  [/(^|\.)bing\./, "bing"],
  [/(^|\.)duckduckgo\./, "duckduckgo"],
  [/(^|\.)ecosia\./, "ecosia"],
  [/(^|\.)baidu\./, "baidu"],
  [/(^|\.)naver\./, "naver"],
]

/**
 * UTM が無い着地で、document.referrer から touch を推定する。
 * 自然検索は UTM を持たないため、これが無いと organic が全て direct に落ちてしまう
 * （＝自然検索経由の応募が計測できない）。
 * - 検索エンジン → { source: "google" 等, medium: "organic" }
 * - 自サイト内遷移 / referrer 無し → undefined（direct のまま。既存挙動を変えない）
 * - その他の外部サイト → { source: ホスト名, medium: "referral" }
 */
/**
 * ネイティブアプリからの遷移は `android-app://<パッケージ名>` で来る。
 *
 * ⚠️ 特別扱いしないと、パッケージ名がホスト名として扱われ
 * `com.google.android.youtube` が上の `/(^|\.)google\./` に**マッチしてしまう**。
 * つまり Android の YouTube アプリからの流入が「Google自然検索」として記録され、
 * 自然検索KPIに他チャネルが混ざる。
 *
 * ⚠️ この表は form_applicant（ridejob.jp/entry）と同一に保つこと。
 * 同一オリジンで `rj_attr` Cookie を共有しているため、片方が別の値を書くと
 * もう片方がその値を読んで集計する。
 */
const APP_PACKAGE_SOURCES: Record<string, { source: string; medium: string }> = {
  "com.google.android.youtube": { source: "youtube.com", medium: "referral" },
  "com.google.android.googlequicksearchbox": { source: "google", medium: "organic" },
  "com.google.android.gm": { source: "gmail", medium: "referral" },
}

export const touchFromReferrer = (
  referrer: string,
  currentHost: string,
): Partial<AttributionTouch> | undefined => {
  if (!referrer) return undefined
  let url: URL
  try {
    url = new URL(referrer)
  } catch {
    return undefined
  }
  const host = url.hostname.toLowerCase()
  if (!host) return undefined

  // http(s) 以外はホスト名がドメインではないので、検索エンジン判定に通さない。
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    const known = APP_PACKAGE_SOURCES[host]
    return known ? { ...known } : { source: host, medium: "referral" }
  }

  // 自ドメイン（サブドメイン含む）からの遷移は流入ではない
  const self = currentHost.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "")
  if (self && (host === self || host.endsWith(`.${self}`))) return undefined

  for (const [pattern, name] of SEARCH_ENGINE_HOSTS) {
    if (pattern.test(host)) return { source: name, medium: "organic" }
  }
  return { source: host.replace(/^www\./, ""), medium: "referral" }
}

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
  currentHost?: string,
): Attribution {
  const params = new URLSearchParams(search)
  const touchParams = readTouchParams(params)
  const fbclid = params.get("fbclid")?.trim() || undefined
  const gclid = params.get("gclid")?.trim() || undefined
  const oppref = params.get("oppref")?.trim() || undefined

  const current = readAttribution()

  // UTM もクリックIDも無い着地。自然検索/参照元はここに該当するため、
  // referrer から touch を推定して「既存の touch が無いときだけ」記録する。
  //
  // なぜ「無いときだけ」か: 既存の lastTouch（広告など）を後続の自然検索で上書きすると
  // 広告の成果計測（CPA）が変わってしまうため。ここでは direct に落ちていた分だけを
  // organic/referral として救い、有料の帰属には一切影響を与えない。
  // oppref を含めないと、UTMが欠けたChatGPT広告のクリックが referrer 推定に落ち、
  // chatgpt.com からの自然流入として記録される（＝広告費がAIO成果に混入する）。
  if (!isMeaningful(touchParams) && !fbclid && !gclid && !oppref) {
    if (current.lastTouch || current.firstTouch) return current

    const host =
      currentHost ?? (typeof window !== "undefined" ? window.location.host : "")
    const derived = touchFromReferrer(referrer, host)
    if (!derived) return current

    const referrerTouch: AttributionTouch = { ...derived, at: nowIso }
    const nextFromReferrer: Attribution = {
      ...current,
      firstTouch: referrerTouch,
      lastTouch: referrerTouch,
      landing: current.landing ?? path,
      referrer: current.referrer ?? (referrer || undefined),
    }
    writeCookie(COOKIE_NAME, JSON.stringify(nextFromReferrer), MAX_AGE_SEC)
    // 後方互換 Cookie も揃える（GTM 等が参照）
    if (referrerTouch.source) writeCookie("utm_source", referrerTouch.source, LEGACY_MAX_AGE_SEC)
    if (referrerTouch.medium) writeCookie("utm_medium", referrerTouch.medium, LEGACY_MAX_AGE_SEC)
    return nextFromReferrer
  }

  const touch: AttributionTouch = { ...touchParams, at: nowIso }

  const next: Attribution = {
    firstTouch: current.firstTouch ?? (isMeaningful(touchParams) ? touch : current.firstTouch),
    lastTouch: isMeaningful(touchParams) ? touch : current.lastTouch,
    fbclid: fbclid ?? current.fbclid,
    gclid: gclid ?? current.gclid,
    oppref: oppref ?? current.oppref,
    landing: current.landing ?? path,
    referrer: current.referrer ?? (referrer || undefined),
  }

  writeCookie(COOKIE_NAME, JSON.stringify(next), MAX_AGE_SEC)

  // 後方互換: legacy な個別 Cookie も last-touch の値で書き続ける
  if (touch.source) writeCookie("utm_source", touch.source, LEGACY_MAX_AGE_SEC)
  if (touch.medium) writeCookie("utm_medium", touch.medium, LEGACY_MAX_AGE_SEC)

  return next
}
