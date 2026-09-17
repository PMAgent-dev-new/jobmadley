import { createHash } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

const stubEnv = () => {
  vi.stubEnv("APP_ID_RIDEJOB", "test-app-id")
  vi.stubEnv("APP_SECRET_RIDEJOB", "test-app-secret")
  vi.stubEnv("APP_TOKEN_RIDEJOB", "test-app-token")
  vi.stubEnv("LARK_DOMAIN_RIDEJOB", "open.larksuite.com")
}

describe("Lark IM idempotent send", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("sends a stable hashed uuid capped at 50 characters", async () => {
    stubEnv()
    const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("tenant_access_token")) {
        return Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      }
      const body = JSON.parse(String(init?.body))
      expect(body.uuid).toBe(createHash("sha256").update("x".repeat(80)).digest("hex").slice(0, 50))
      expect(body.receive_id).toBe("oc_test")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Response.json({ code: 0, data: { message_id: "om_test" } })
    })
    vi.stubGlobal("fetch", fetchSpy)

    const { sendLarkMessage } = await import("./im")
    await expect(sendLarkMessage({
      service: "ridejob",
      chatId: "oc_test",
      card: { elements: [] },
      context: "test",
      idempotencyKey: "x".repeat(80),
    })).resolves.toMatchObject({ ok: true, messageId: "om_test" })
  })

  it("reports a transport timeout as an ambiguous result", async () => {
    stubEnv()
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      if (String(input).includes("tenant_access_token")) {
        return Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      }
      throw new DOMException("timed out", "TimeoutError")
    }))

    const { sendLarkMessage } = await import("./im")
    await expect(sendLarkMessage({
      service: "ridejob",
      chatId: "oc_test",
      card: { elements: [] },
      context: "test",
      idempotencyKey: "submission-1",
    })).resolves.toMatchObject({ ok: false, status: 0 })
  })
})
