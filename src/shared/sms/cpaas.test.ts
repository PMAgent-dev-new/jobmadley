import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 「届いていないのに送信済みに見える」事故を二度と起こさないための固定。
 *
 * CPaaS NOW の sandbox は配信しない別環境（ベンダー公式 OpenAPI に明記）なのに
 * 202 + delivery_order_id を返す。したがって本番で CPAASNOW_BASE_URL が
 * 未設定のまま sandbox へフォールバックすると、送信は成功と判定され
 * eeasy にも「送信済み」として記録され、KPI 上は何も異常が見えない。
 */
describe("sendShortMessage — 本番での宛先ガード", () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ delivery_order_id: 1, accepted_at: "x" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchSpy)
    vi.stubEnv("CPAASNOW_API_TOKEN", "test-token")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("本番で CPAASNOW_BASE_URL が未設定なら、sandbox へ流さず送信を中止する", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("CPAASNOW_BASE_URL", "")
    const { sendShortMessage } = await import("./cpaas")

    const r = await sendShortMessage({ to: "09011224488", text: "t" }, "test")

    expect(r.skipped).toBe(true)
    expect(r.message).toBe("base_url_not_configured")
    // 一番大事なのはここ。sandbox に対して1回も投げていないこと
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("本番でも値が入っていれば、そのホストへ送る", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("CPAASNOW_BASE_URL", "https://cpaasnow.com")
    const { sendShortMessage } = await import("./cpaas")

    const r = await sendShortMessage({ to: "09011224488", text: "t" }, "test")

    expect(r.ok).toBe(true)
    expect(new URL(String(fetchSpy.mock.calls[0][0])).hostname).toBe("cpaasnow.com")
  })

  it("本番以外は従来どおり sandbox へフォールバックする（検証用に潰さない）", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("CPAASNOW_BASE_URL", "")
    const { sendShortMessage } = await import("./cpaas")

    await sendShortMessage({ to: "09011224488", text: "t" }, "test")

    expect(new URL(String(fetchSpy.mock.calls[0][0])).hostname).toBe("sandbox.cpaasnow.com")
  })

  it("トークンが無ければ、宛先の設定に関係なく送らない", async () => {
    vi.stubEnv("CPAASNOW_API_TOKEN", "")
    vi.stubEnv("CPAASNOW_BASE_URL", "https://cpaasnow.com")
    const { sendShortMessage } = await import("./cpaas")

    const r = await sendShortMessage({ to: "09011224488", text: "t" }, "test")

    expect(r.skipped).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
