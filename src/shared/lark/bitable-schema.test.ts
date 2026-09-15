import { describe, expect, it } from "vitest"
import { applicationSourceMasterName, buildFieldsForService } from "./bitable-schema"

describe("mechanic consultation fields", () => {
  it("keeps the raw catalog ID and canonical detail URL in the mechanic record", () => {
    const fields = buildFieldsForService("mechanic", {
      lastName: "山田",
      firstName: "太郎",
      jobId: "13010-12345678",
      jobName: "自動車整備士",
      jobUrl: "https://ridejob.jp/external-job/hellowork/13010-12345678?utm_source=meta",
      extraNotes: [
        "求人ID: 13010-12345678",
        "受付区分: RIDE JOBへの転職相談（求人企業への直接応募ではない）",
      ],
    })

    expect(fields.Indeed応募者URL).toEqual({
      link: "https://ridejob.jp/external-job/hellowork/13010-12345678?utm_source=meta",
      text: "https://ridejob.jp/external-job/hellowork/13010-12345678?utm_source=meta",
    })
    expect(fields.対応履歴メモ).toContain("求人ID: 13010-12345678")
    expect(fields.対応履歴メモ).toContain("転職相談")
  })
})

describe("application source master mapping", () => {
  it("maps Meta catalog traffic to the Meta advertising master row", () => {
    expect(applicationSourceMasterName("meta")).toBe("Meta広告")
    expect(applicationSourceMasterName("instagram")).toBe("Meta広告")
  })
})
