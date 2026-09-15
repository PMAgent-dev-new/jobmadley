import { describe, expect, it } from "vitest"
import { buildMessage } from "./applicantSms"

describe("buildMessage consultation", () => {
  it("uses consultation wording without claiming a direct job application", () => {
    const message = buildMessage({
      applicantName: "山田 太郎",
      url: "https://example.com/book",
      intent: "consult",
    })

    expect(message).toContain("転職相談")
    expect(message).not.toContain("ご応募いただき")
  })
})
