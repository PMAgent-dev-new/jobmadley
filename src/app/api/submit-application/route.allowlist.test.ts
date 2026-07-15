import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 送信先ホストの許可リストガード（/api/submit-application）。
 *
 * これは happy path の確認ではなく、応募者の個人情報が許可リスト外のホストへ
 * 送られる変更を CI で止めるための番人。auto-merge パイプラインの安全性は、
 * 「CI は PII が"どこへ"送られるかを検証できない」という穴をこのテストが塞ぐ前提で成り立つ。
 *
 * 仕組み: global.fetch をスパイに差し替え、外部送信の全経路（Lark 通知 Webhook /
 * tenant_access_token 認証 / Base(bitable) 登録・lookup / 応募者SMS(CPaaS) /
 * SMS送信ログ(eeasy) / Meta CAPI）を「許可リスト内ホスト」に向けて有効化した状態で
 * POST ハンドラを実走させ、記録された fetch 先ホストがすべて許可リストに収まることを検証する。
 * route.ts に新しい fetch 先が紛れ込めば、そのホストは許可リストに無いので fail する。
 *
 * 限界（意図的）:
 * - 応募者向け自動返信メールは Gmail API（src/shared/mail/gmail.ts）経由。送信には有効な
 *   サービスアカウント秘密鍵での JWT 署名が要るため、このテストでは Gmail を未設定にして
 *   経路を手前でスキップさせる。宛先は oauth2.googleapis.com / gmail.googleapis.com の
 *   ハードコード定数（env 由来ではない）なので、リダイレクト耐性は静的レビューで担保する。
 * - ランタイムテストなので、与えた入力で実行される経路しかカバーしない。送信先を
 *   「リクエスト本文やテストが設定しない env」から動的に組み立てる細工は検出できない
 *   （route.ts の残存リスクとして受容）。
 */

// env 由来（＝サイレントにリダイレクトされ得る）ホストを含む、実行時に接触してよい全ホスト。
const ALLOWED_HOSTS = new Set([
  "open.larksuite.com", // Lark 通知 Webhook / tenant_access_token / bitable(Base)
  "sandbox.cpaasnow.com", // CPaaS NOW（応募者SMS。CPAASNOW_BASE_URL 未設定時の既定）
  "leomeet.pmagent.jp", // eeasy /api/sms/log（SMS送信ログ。EEASY_BASE_URL 既定）
  "graph.facebook.com", // Meta Conversions API（Lead）
])

function hostOf(input: unknown): string {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input instanceof Request
          ? input.url
          : String((input as { url?: string })?.url ?? input)
  return new URL(url).hostname
}

// 各外部経路を「許可リスト内ホストへ向けて」有効化する env。値はダミーで良い（スパイが応答するため）。
// Gmail(GMAIL_SA_*) は敢えて未設定にして経路をスキップさせる（上記「限界」参照）。
const ALLOWLISTED_ENV: Record<string, string> = {
  // Lark 通知は Webhook 経路（LARK_CHAT_ID を設定しないことで im API ではなく Webhook を使う）
  LARK_WEBHOOK: "https://open.larksuite.com/open-apis/bot/v2/hook/aaaaaaaa",
  // Base(bitable) 登録・lookup・認証に必要な Lark アプリ資格情報（ridejob サービスの fallback 経路）
  LARK_APP_ID: "test-app-id",
  LARK_APP_SECRET: "test-app-secret",
  LARK_BASE_APP_TOKEN: "test-app-token",
  // 応募者SMS（CPaaS）と送信ログ（eeasy）
  CPAASNOW_API_TOKEN: "test-cpaas-token",
  SMS_LOG_SECRET: "test-sms-log-secret",
  // Meta CAPI（capi.ts は module ロード時に env を固定するため、import 前に stub する）
  NEXT_PUBLIC_META_PIXEL_ID: "1234567890",
  META_CAPI_ACCESS_TOKEN: "test-capi-token",
  // 防御的: 何かが microCMS クライアントを間接 import してもモジュール初期化で throw しないように
  NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN: "dummy-domain",
  MICROCMS_API_KEY: "dummy-key",
  NEXT_PUBLIC_MICROCMS_SERVICE_DOMAIN_2: "dummy-domain-2",
  MICROCMS_API_KEY_2: "dummy-key-2",
}

function makeRequest(body: unknown) {
  return new Request("https://ridejob.jp/api/submit-application", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      referer: "https://ridejob.jp/",
      "user-agent": "vitest",
    },
    body: JSON.stringify(body),
  })
}

// testDetection に「テスト応募」と判定されない実応募相当のペイロード
// （氏名/メール/電話にテスト語・予約ドメイン・連番/ゾロ目を含めない）。
// テスト判定されると Base/メール/SMS/CAPI がスキップされ、このガードが骨抜きになる。
const applicantBody = {
  lastName: "田中",
  firstName: "太郎",
  lastNameKana: "たなか",
  firstNameKana: "たろう",
  birthDate: "1990-01-01",
  phone: "09011224488",
  email: "taro.tanaka@gmail.com",
  companyName: "山田運輸株式会社",
  jobName: "ドライバー",
  jobId: "job-abc",
  applicationSource: "meta",
  utmSource: "meta",
  utmMedium: "cpc",
  metaEventId: "evt-allowlist-test",
}

describe("submit-application POST — outbound host allowlist", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    for (const [key, value] of Object.entries(ALLOWLISTED_ENV)) {
      vi.stubEnv(key, value)
    }
    // 全経路が「成功」して次段へ進むよう、全消費者を満たすスーパーセット応答を返す。
    // status 202 は CPaaS が必須とする値（他モジュールは res.ok=2xx 判定なので 202 でも OK）。
    fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            msg: "ok",
            StatusCode: 0,
            tenant_access_token: "test-tenant-token",
            expire: 7200,
            delivery_order_id: 123,
            accepted_at: "2026-07-15T00:00:00+09:00",
            data: { record: { record_id: "rec1" }, items: [{ record_id: "rec1" }] },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
    )
    vi.stubGlobal("fetch", fetchSpy)
    // capi.ts などが module ロード時に env を snapshot するため、fresh な module graph を強制する。
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("only contacts allowlisted hosts while handling a full submission", async () => {
    const { POST } = await import("./route")
    const res = await POST(makeRequest(applicantBody))
    expect(res.status).toBe(200)

    const hosts = fetchSpy.mock.calls.map((call) => hostOf(call[0]))
    expect(hosts.length).toBeGreaterThan(0)

    const offlist = hosts.filter((host) => !ALLOWED_HOSTS.has(host))
    expect(offlist, `unexpected outbound host(s): ${[...new Set(offlist)].join(", ")}`).toEqual([])
  })

  it("actually exercises the Lark, SMS log and CAPI paths (guard is not vacuous)", async () => {
    const { POST } = await import("./route")
    await POST(makeRequest(applicantBody))

    const hosts = new Set(fetchSpy.mock.calls.map((call) => hostOf(call[0])))
    expect(hosts.has("open.larksuite.com")).toBe(true)
    expect(hosts.has("sandbox.cpaasnow.com")).toBe(true)
    expect(hosts.has("leomeet.pmagent.jp")).toBe(true)
    expect(hosts.has("graph.facebook.com")).toBe(true)
  })

  it("the allowlist check itself has teeth", () => {
    // fetch('https://evil.example/...') を足す退行は必ず捕まること。
    expect(ALLOWED_HOSTS.has(hostOf("https://evil.example/steal"))).toBe(false)
  })
})
