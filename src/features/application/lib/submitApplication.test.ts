import { afterEach, describe, expect, it, vi } from "vitest"
import { postApplication, selectApplicationSource } from "./submitApplication"

const payload = {
  lastName: "山田",
  firstName: "太郎",
  lastNameKana: "ヤマダ",
  firstNameKana: "タロウ",
  birthDate: "1990-01-01",
  phone: "09000000000",
  email: "user@example.com",
  companyName: "",
  jobName: "自動車整備士",
  jobUrl: "https://ridejob.jp/external-job/hellowork/13010-12345678",
  jobId: "hw-13010-12345678",
  applyEmail: "ridejob.mechanic@pmagent.jp",
  applicationSource: "meta",
  submissionId: "submission-test-1",
}

afterEach(() => vi.unstubAllGlobals())

describe("postApplication", () => {
  it("rejects a non-2xx response so Lead tracking and completion navigation do not run", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 502 }),
    ))
    await expect(postApplication(payload)).rejects.toThrow("HTTP 502")
  })

  it("accepts only an explicit success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ))
    await expect(postApplication(payload)).resolves.toBeUndefined()
  })
})

describe("selectApplicationSource", () => {
  it("uses the current Meta UTM before a stale stored job-board source", () => {
    expect(selectApplicationSource(null, "Meta", "standby")).toBe("meta")
  })

  it("keeps an explicit source before UTM and stored values", () => {
    expect(selectApplicationSource("kyujinbox", "meta", "standby")).toBe("kyujinbox")
  })
})
