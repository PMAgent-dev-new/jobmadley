import { describe, expect, it } from "vitest"
import { buildApplicantAutoReply } from "./applicantAutoReply"

describe("buildApplicantAutoReply consultation", () => {
  it("describes an external mechanic conversion as a RIDE JOB consultation", () => {
    const message = buildApplicantAutoReply(
      { isMechanic: true, isCpOne: false, isPmAgent: false },
      {
        email: "user@example.com",
        name: "山田 太郎",
        jobName: "自動車整備士",
        intent: "consult",
      },
    )

    expect(message.subject).toContain("転職相談")
    expect(message.text).toContain("ハローワークへの直接応募ではありません")
    expect(message.text).not.toContain("選考に際して")
  })
})
