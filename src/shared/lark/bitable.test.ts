import { afterEach, describe, expect, it, vi } from "vitest"

const ENV = {
  APP_ID_RIDEJOB: "test-app-id",
  APP_SECRET_RIDEJOB: "test-app-secret",
  APP_TOKEN_RIDEJOB: "test-app-token",
  LARK_DOMAIN_RIDEJOB: "open.larksuite.com",
}

const stubEnv = () => {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
}

describe("Lark Base submission_id upsert", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("creates exactly one record with a deterministic client token when the id is new", async () => {
    stubEnv()
    const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("tenant_access_token")) {
        return Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      }
      if (url.includes("/records/search")) {
        const body = JSON.parse(String(init?.body))
        expect(body.filter.conditions[0]).toEqual({
          field_name: "submission_id",
          operator: "is",
          value: ["submission-1"],
        })
        return Response.json({ code: 0, data: { items: [] } })
      }
      if (new URL(url).pathname.endsWith("/records") && init?.method === "POST") {
        expect(new URL(url).searchParams.get("client_token")).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        )
        return Response.json({ code: 0, data: { record: { record_id: "rec-created" } } })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchSpy)
    const { upsertBitableRecordByTextField } = await import("./bitable")
    await expect(upsertBitableRecordByTextField({
      service: "ridejob",
      tableId: "tbl-test",
      fieldName: "submission_id",
      value: "submission-1",
      fields: { submission_id: "submission-1" },
    })).resolves.toEqual({ recordId: "rec-created", created: true, previousFields: {} })
  })

  it("updates the matching record and exposes its notification state on retry", async () => {
    stubEnv()
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("tenant_access_token")) {
        return Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      }
      if (url.includes("/records/search")) {
        return Response.json({
          code: 0,
          data: { items: [{ record_id: "rec-existing", fields: { "Lark通知送信済み": true } }] },
        })
      }
      if (url.endsWith("/records/rec-existing") && init?.method === "PUT") {
        return Response.json({ code: 0 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }))
    const { upsertBitableRecordByTextField } = await import("./bitable")
    await expect(upsertBitableRecordByTextField({
      service: "ridejob",
      tableId: "tbl-test",
      fieldName: "submission_id",
      value: "submission-1",
      fields: { submission_id: "submission-1" },
    })).resolves.toEqual({
      recordId: "rec-existing",
      created: false,
      previousFields: { "Lark通知送信済み": true },
    })
  })

  it("can leave a matching submission untouched while exposing its notification state", async () => {
    stubEnv()
    const fetchSpy = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes("tenant_access_token")) {
        return Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      }
      if (url.includes("/records/search")) {
        return Response.json({
          code: 0,
          data: { items: [{ record_id: "rec-existing", fields: { "対応履歴メモ": "[lark_notified:submission-1]" } }] },
        })
      }
      throw new Error(`unexpected write on retry: ${url}`)
    })
    vi.stubGlobal("fetch", fetchSpy)
    const { upsertBitableRecordByTextField } = await import("./bitable")
    await expect(upsertBitableRecordByTextField({
      service: "ridejob",
      tableId: "tbl-test",
      fieldName: "対応履歴メモ",
      value: "[submission_id:submission-1]",
      fields: { "対応履歴メモ": "[submission_id:submission-1]" },
      operator: "contains",
      updateExisting: false,
    })).resolves.toEqual({
      recordId: "rec-existing",
      created: false,
      previousFields: { "対応履歴メモ": "[lark_notified:submission-1]" },
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("recovers the winning record when a concurrent create reuses client_token", async () => {
    stubEnv()
    let searchCount = 0
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes("tenant_access_token")) {
        return Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      }
      if (url.includes("/records/search")) {
        searchCount += 1
        return Response.json({
          code: 0,
          data: { items: searchCount === 1 ? [] : [{ record_id: "rec-winner", fields: { submission_id: "submission-race" } }] },
        })
      }
      if (new URL(url).pathname.endsWith("/records")) {
        return Response.json({ code: 1254608, msg: "client token duplicate" })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }))
    const { upsertBitableRecordByTextField } = await import("./bitable")
    await expect(upsertBitableRecordByTextField({
      service: "ridejob",
      tableId: "tbl-test",
      fieldName: "submission_id",
      value: "submission-race",
      fields: { submission_id: "submission-race" },
      updateExisting: false,
    })).resolves.toEqual({
      recordId: "rec-winner",
      created: false,
      previousFields: { submission_id: "submission-race" },
    })
  })

  it("can use a unique marker contained in an existing memo field", async () => {
    stubEnv()
    const fetchSpy = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("tenant_access_token")) {
        return Response.json({ code: 0, tenant_access_token: "token", expire: 7200 })
      }
      if (url.includes("/records/search")) {
        const body = JSON.parse(String(init?.body))
        expect(body.filter.conditions[0]).toEqual({
          field_name: "対応履歴メモ",
          operator: "contains",
          value: ["[submission_id:submission-2]"],
        })
        return Response.json({ code: 0, data: { items: [] } })
      }
      return Response.json({ code: 0, data: { record: { record_id: "rec-created" } } })
    })
    vi.stubGlobal("fetch", fetchSpy)
    const { upsertBitableRecordByTextField } = await import("./bitable")
    await upsertBitableRecordByTextField({
      service: "ridejob",
      tableId: "tbl-test",
      fieldName: "対応履歴メモ",
      value: "[submission_id:submission-2]",
      operator: "contains",
      fields: { "対応履歴メモ": "[submission_id:submission-2]" },
    })
  })
})
