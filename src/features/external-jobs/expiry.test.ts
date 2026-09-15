import { describe, expect, it } from "vitest"
import { isExternalJobExpired } from "./expiry"

describe("isExternalJobExpired", () => {
  const seen = "2026-09-15T00:00:00.000Z"

  it("keeps a listing active through the stated end date in Japan", () => {
    expect(isExternalJobExpired("9月30日", seen, new Date("2026-09-30T14:59:59.000Z"))).toBe(false)
    expect(isExternalJobExpired("9月30日", seen, new Date("2026-09-30T15:00:00.000Z"))).toBe(true)
  })

  it("fails closed when the expiry inputs are invalid", () => {
    expect(isExternalJobExpired("", seen)).toBe(true)
    expect(isExternalJobExpired("9月30日", "")).toBe(true)
    expect(isExternalJobExpired("2月31日", seen, new Date("2026-02-20T00:00:00.000Z"))).toBe(true)
  })
})
