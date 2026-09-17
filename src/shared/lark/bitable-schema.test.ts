import { describe, expect, it } from "vitest"
import { applicationSourceMasterName, buildFieldsForService } from "./bitable-schema"

describe("mechanic consultation fields", () => {
  it("writes catalog click and applied job fields into dedicated columns", () => {
    const fields = buildFieldsForService("mechanic", {
      submissionId: "submission-1",
      catalogAppliedJobId: "job-1",
      catalogJobId: "job-1",
      catalogJobName: "自動車整備士（正社員）",
      catalogClickedAtMillis: 1_700_000_000_000,
      catalogAttributionStatus: "same_job",
    })

    expect(fields).toMatchObject({
      submission_id: "submission-1",
      応募求人ID: "job-1",
      広告クリック求人ID: "job-1",
      広告クリック求人名: "自動車整備士（正社員）",
      カタログクリック日時: 1_700_000_000_000,
      カタログ求人一致判定: "same_job",
    })
  })

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

describe("ridejob catalog attribution compatibility", () => {
  it("stores the attribution and idempotency markers in the existing memo column", () => {
    const fields = buildFieldsForService("ridejob", {
      submissionId: "submission-ridejob-1",
      catalogAppliedJobId: "job-2",
      catalogJobId: "job-1",
      catalogJobName: "タクシードライバー",
      catalogClickedAtMillis: Date.parse("2026-09-17T00:00:00.000Z"),
      catalogAttributionStatus: "changed_job",
    })

    expect(fields.submission_id).toBeUndefined()
    expect(fields.対応履歴メモ).toContain("[submission_id:submission-ridejob-1]")
    expect(fields.対応履歴メモ).toContain("広告クリック求人ID: job-1")
    expect(fields.対応履歴メモ).toContain("広告クリック求人名: タクシードライバー")
    expect(fields.対応履歴メモ).toContain("応募求人ID: job-2")
    expect(fields.対応履歴メモ).toContain("カタログ求人一致判定: changed_job")
  })
})

describe("liftjob schema compatibility", () => {
  it("does not send RIDE JOB-only idempotency or catalog columns", () => {
    const fields = buildFieldsForService("liftjob", {
      submissionId: "submission-liftjob-1",
      catalogAppliedJobId: "job-1",
      catalogJobId: "job-1",
      catalogAttributionStatus: "same_job",
      jobName: "LIFT JOB求人",
    })

    expect(fields).not.toHaveProperty("submission_id")
    expect(fields).not.toHaveProperty("Lark通知送信済み")
    expect(fields).not.toHaveProperty("広告クリック求人ID")
    expect(fields).toMatchObject({ 求人名: "LIFT JOB求人" })
  })
})

describe("application source master mapping", () => {
  it("maps Meta catalog traffic to the Meta advertising master row", () => {
    expect(applicationSourceMasterName("meta")).toBe("Meta広告")
    expect(applicationSourceMasterName("instagram")).toBe("Meta広告")
  })
})
