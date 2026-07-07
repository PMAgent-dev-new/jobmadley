// 応募データを各サービスの Lark Base レコード形式 (fields) に変換する。
// 参照型 (SingleLink / SingleSelect with master) は対応履歴メモにテキストとして集約する。

import type { LarkServiceId } from "@/shared/config/env"
import { findRecordIdByField } from "@/shared/lark/bitable"

export interface ApplicationFields {
  lastName?: string
  firstName?: string
  lastNameKana?: string
  firstNameKana?: string
  birthDate?: string
  phone?: string
  email?: string
  jobId?: string
  jobName?: string
  jobUrl?: string
  companyName?: string
  /** 得意先CRM の record_id (RideJob で SingleLink 設定用、lookup 済みのときのみセット) */
  companyRecordId?: string
  jobLocation?: string
  applicationSource?: string
  utmSource?: string
  utmMedium?: string
  appliedAtMillis?: number
  extraNotes?: string[]
}

/** RideJob の 得意先CRM テーブル定義 */
const RIDEJOB_CRM_TABLE_ID = "tblLmZuOXs5QYiQI"
const RIDEJOB_CRM_PRIMARY_FIELD = "企業名"

/**
 * RideJob の 得意先CRM テーブルから companyName に一致する record_id を取得。
 * 見つからない場合は undefined（SingleLink は未設定のままにする）。
 */
export const resolveRidejobCompanyRecordId = async (
  companyName: string | undefined,
): Promise<string | undefined> => {
  if (!companyName || !companyName.trim()) return undefined
  return findRecordIdByField({
    service: "ridejob",
    tableId: RIDEJOB_CRM_TABLE_ID,
    fieldName: RIDEJOB_CRM_PRIMARY_FIELD,
    value: companyName,
  })
}

interface ServiceTableConfig {
  tableId: string
}

// 各サービスのテーブル ID をハードコード（user 指定）
export const SERVICE_TABLES: Record<LarkServiceId, ServiceTableConfig> = {
  ridejob: { tableId: "tblO0pPqFyHqpVcj" },
  mechanic: { tableId: "tblXcvtQJqoD2PIV" },
  liftjob: { tableId: "tblVBAB0nVCgWVWJ" },
}

const joinName = (last?: string, first?: string): string => {
  const l = (last ?? "").trim()
  const f = (first ?? "").trim()
  return `${l} ${f}`.trim()
}

const buildNotes = (input: ApplicationFields, includeKeys: Array<keyof ApplicationFields>): string => {
  const lines: string[] = []
  for (const key of includeKeys) {
    const value = input[key]
    if (value == null || value === "") continue
    const label = NOTE_LABELS[key] ?? String(key)
    lines.push(`${label}: ${value}`)
  }
  if (input.extraNotes && input.extraNotes.length > 0) {
    lines.push(...input.extraNotes)
  }
  return lines.join("\n")
}

const NOTE_LABELS: Partial<Record<keyof ApplicationFields, string>> = {
  jobId: "求人ID",
  jobUrl: "求人URL",
  companyName: "会社名",
  jobLocation: "勤務地",
  applicationSource: "応募経由",
  utmSource: "UTM source",
  utmMedium: "UTM medium",
}

const dropEmpty = (fields: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue
    if (typeof v === "string" && v.trim() === "") continue
    out[k] = v
  }
  return out
}

// === サービス別マッピング ===

const buildRidejobFields = (input: ApplicationFields): Record<string, unknown> => {
  // companyRecordId が解決済みなら SingleLink、未解決なら 対応履歴メモ で会社名を補足
  const linked = !!input.companyRecordId
  const noteKeys: Array<keyof ApplicationFields> = [
    "jobId",
    "jobUrl",
    ...(linked ? [] : (["companyName"] as Array<keyof ApplicationFields>)),
    "jobLocation",
    "applicationSource",
    "utmSource",
    "utmMedium",
  ]
  return dropEmpty({
    求職者名: joinName(input.lastName, input.firstName),
    フリガナ: joinName(input.lastNameKana, input.firstNameKana),
    生年月日: input.birthDate,
    電話番号: input.phone,
    メールアドレス: input.email,
    求人名: input.jobName,
    媒体応募先企業名: linked ? [input.companyRecordId] : undefined,
    応募日: input.appliedAtMillis,
    対応履歴メモ: buildNotes(input, noteKeys),
  })
}

const buildMechanicFields = (input: ApplicationFields): Record<string, unknown> =>
  dropEmpty({
    求職者名: joinName(input.lastName, input.firstName),
    フリガナ: joinName(input.lastNameKana, input.firstNameKana),
    生年月日: input.birthDate,
    電話番号: input.phone,
    メールアドレス: input.email,
    求人情報: input.jobName,
    媒体応募先企業名: input.companyName,
    Indeed応募者URL: input.jobUrl,
    応募日: input.appliedAtMillis,
    対応履歴メモ: buildNotes(input, [
      "jobId",
      "jobLocation",
      "applicationSource",
      "utmSource",
      "utmMedium",
    ]),
  })

const buildLiftjobFields = (input: ApplicationFields): Record<string, unknown> =>
  dropEmpty({
    求職者名: joinName(input.lastName, input.firstName),
    フリガナ: joinName(input.lastNameKana, input.firstNameKana),
    生年月日: input.birthDate,
    電話番号: input.phone,
    メールアドレス: input.email,
    求人名: input.jobName,
    求人URL: input.jobUrl,
    応募日: input.appliedAtMillis,
    対応履歴メモ: buildNotes(input, [
      "jobId",
      "companyName",
      "jobLocation",
      "applicationSource",
      "utmSource",
      "utmMedium",
    ]),
  })

export const buildFieldsForService = (
  service: LarkServiceId,
  input: ApplicationFields,
): Record<string, unknown> => {
  switch (service) {
    case "ridejob":
      return buildRidejobFields(input)
    case "mechanic":
      return buildMechanicFields(input)
    case "liftjob":
      return buildLiftjobFields(input)
  }
}
