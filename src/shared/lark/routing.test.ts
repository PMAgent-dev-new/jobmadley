import { describe, expect, it } from "vitest"
import { classifyChannel } from "./routing"

describe("classifyChannel — AIアシスタント", () => {
  it("ChatGPT広告を「リスティング広告」に誤分類しない", () => {
    // utm_medium=cpc は汎用の有料判定にも当たるため、AI判定を前に置かないと
    // 検索広告の実績にChatGPT広告が混ざる。
    expect(classifyChannel("openai", "cpc")).toEqual({
      channel: "paid_ai",
      label: "AIアシスタント広告",
    })
    expect(classifyChannel("openai", "ad").channel).toBe("paid_ai")
  })

  it("回答内引用からの自然流入は広告と分ける", () => {
    expect(classifyChannel("chatgpt.com", "referral")).toEqual({
      channel: "ai_search",
      label: "AI検索",
    })
    expect(classifyChannel("openai", "").channel).toBe("ai_search")
  })

  it("表記ゆれを吸収する", () => {
    expect(classifyChannel("OpenAI", "CPC").channel).toBe("paid_ai")
    expect(classifyChannel(" chat.openai.com ", "referral").channel).toBe("ai_search")
  })
})

describe("classifyChannel — 既存分類の回帰", () => {
  it.each([
    ["meta", "ad", "paid_social"],
    ["facebook", "catalog", "paid_social"],
    ["google", "cpc", "paid_search"],
    ["google", "organic", "organic_search"],
    ["yahoo", "", "organic_search"],
    ["indeed", "", "job_board"],
    ["unknown-site.com", "referral", "referral"],
    ["", "", "direct"],
    // AI判定を足したせいで、SNS広告が検索広告に化けたりしないことの固定
    ["tiktok", "ad", "other"],
  ])("%s / %s → %s", (source, medium, expected) => {
    expect(classifyChannel(source, medium).channel).toBe(expected)
  })
})
