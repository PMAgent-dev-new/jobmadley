import { describe, expect, it } from "vitest"
import { isExternalMetaCatalogJob } from "./catalog-eligibility"
import type { ExternalJob } from "./types"

const job: ExternalJob = {
  source: "hellowork",
  sourceId: "13010-12345678",
  sourceName: "ハローワークインターネットサービス",
  companyRedactionVerified: true,
  title: "自動車整備士",
  prefecture: "東京都",
  municipalityName: "千代田区",
  jobCategory: "自動車整備士",
  employmentType: "正社員",
  salaryKind: "月給",
  salaryMin: 250000,
  description: "自動車の点検と整備を担当します。",
  expiresAt: "9月30日",
  lastSeen: "2026-09-15T00:00:00Z",
}

const now = new Date("2026-09-15T00:00:00Z")

describe("isExternalMetaCatalogJob", () => {
  it("accepts a complete active mechanic job", () => {
    expect(isExternalMetaCatalogJob(job, now)).toBe(true)
  })

  it("rejects a row omitted from the feed because municipality is missing", () => {
    expect(isExternalMetaCatalogJob({ ...job, municipalityName: undefined }, now)).toBe(false)
  })

  it("rejects a row when the employer name was unavailable for redaction", () => {
    expect(isExternalMetaCatalogJob({ ...job, companyRedactionVerified: false }, now)).toBe(false)
  })

  it("rejects an expired row", () => {
    expect(isExternalMetaCatalogJob({ ...job, expiresAt: "9月14日" }, now)).toBe(false)
  })

  it("rejects a salary kind omitted from the Meta feed", () => {
    expect(isExternalMetaCatalogJob({ ...job, salaryKind: "日給月給" }, now)).toBe(false)
  })
})
