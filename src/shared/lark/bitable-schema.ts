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
  /** 応募経由マスタ の record_id (RideJob の 応募経由(マスタ連動) SingleLink 用、lookup 済みのときのみセット) */
  applicationSourceRecordId?: string
  jobLocation?: string
  applicationSource?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  appliedAtMillis?: number
  /** 全サービス共通で対応履歴メモに載せる補助テキスト（チャネル / 最終接触日時 等）。 */
  extraNotes?: string[]
  /** 流入チャネル / 初回接触 / fbclid / gclid 等。RideJob はメモに載せない（mechanic/liftjob のみ）。 */
  attributionNotes?: string[]
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

/** 応募経由マスタ テーブル（サービス別。テキスト列で照合する）。 */
const APPLICATION_SOURCE_MASTER: Partial<Record<LarkServiceId, { tableId: string; field: string }>> = {
  ridejob: { tableId: "tbl6w045SNt0hJKD", field: "テキスト" },
  mechanic: { tableId: "tblzMUVSWmTzmGfA", field: "テキスト" },
}

/** applicationSource（正規化済み）→ 応募経由マスタの選択肢名（ridejob/mechanic 共通。テキスト列の値）。 */
const applicationSourceMasterName = (applicationSource: string | undefined): string => {
  const s = applicationSource?.trim().toLowerCase()
  if (s === "standby") return "スタンバイ"
  if (s === "kyujinbox") return "kbox/feed"
  return "RIDEJOB HP"
}

/**
 * 応募経由(マスタ連動) SingleLink 用に、応募経由マスタの record_id を取得（ridejob / mechanic）。
 * standby→"スタンバイ" / kyujinbox→"kbox/feed" / それ以外→"RIDEJOB HP" を テキスト列で照合。
 * 3つの既定値はいずれのマスタにも存在するため通常は必ずヒットする。マスタ未定義サービスは undefined。
 */
export const resolveApplicationSourceRecordId = async (
  service: LarkServiceId,
  applicationSource: string | undefined,
): Promise<string | undefined> => {
  const master = APPLICATION_SOURCE_MASTER[service]
  if (!master) return undefined
  return findRecordIdByField({
    service,
    tableId: master.tableId,
    fieldName: master.field,
    value: applicationSourceMasterName(applicationSource),
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

const buildNotes = (
  input: ApplicationFields,
  includeKeys: Array<keyof ApplicationFields>,
  includeAttribution = false,
): string => {
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
  if (includeAttribution && input.attributionNotes && input.attributionNotes.length > 0) {
    lines.push(...input.attributionNotes)
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
  utmCampaign: "キャンペーン",
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

/**
 * Lark の URL(ハイパーリンク)型フィールド用に文字列を {link, text} に変換する。
 * URL型フィールドは文字列を直接受け付けず、渡すと URLFieldConvFail でレコード作成全体が失敗する。
 * 空文字/未指定なら undefined（dropEmpty で除外）。
 */
const urlField = (url: string | undefined): { link: string; text: string } | undefined => {
  const u = url?.trim()
  return u ? { link: u, text: u } : undefined
}

// === サービス別マッピング ===

const buildRidejobFields = (input: ApplicationFields): Record<string, unknown> => {
  // 会社名は CRM 一致時に SingleLink、未一致時のみ 対応履歴メモ にテキスト補足。
  const linked = !!input.companyRecordId
  const noteKeys: Array<keyof ApplicationFields> = linked
    ? []
    : (["companyName"] as Array<keyof ApplicationFields>)
  // 専用の求人URL列が無いため、求人名セルに求人URLを併記する（求人名↵URL）。
  const jobNameWithUrl = [input.jobName, input.jobUrl].filter((v) => v && v.trim()).join("\n") || undefined
  return dropEmpty({
    求職者名: joinName(input.lastName, input.firstName),
    フリガナ: joinName(input.lastNameKana, input.firstNameKana),
    生年月日: input.birthDate,
    電話番号: input.phone,
    メールアドレス: input.email,
    求人名: jobNameWithUrl,
    媒体応募先企業名: linked ? [input.companyRecordId] : undefined,
    "応募経由(マスタ連動)": input.applicationSourceRecordId ? [input.applicationSourceRecordId] : undefined,
    勤務地: input.jobLocation,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    応募日: input.appliedAtMillis,
    // 求人ID / 応募経由(生) / 流入チャネル / 初回接触 / fbclid / gclid は載せない（列化 or 不要）。
    // チャネル / 最終接触日時 は extraNotes 経由で残す（includeAttribution=false）。
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
    Indeed応募者URL: urlField(input.jobUrl),
    "応募経由(マスタ連動)": input.applicationSourceRecordId ? [input.applicationSourceRecordId] : undefined,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    応募日: input.appliedAtMillis,
    // 求人ID / 勤務地 / 応募経由(生) / 流入チャネル / チャネル / 初回接触 / 最終接触日時 / fbclid / gclid は載せない。
    // 求人ボックス経由の応募者詳細（extraNotes）は残す。
    対応履歴メモ: buildNotes(input, []),
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
    // 応募経由(マスタ連動) は MultiSelect（インライン選択肢）。SingleLink と違い record_id ではなく
    // 選択肢名の配列で書く。standby→"スタンバイ" / kyujinbox→"kbox/feed" / 他→"RIDEJOB HP"。
    "応募経由(マスタ連動)": [applicationSourceMasterName(input.applicationSource)],
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
    応募日: input.appliedAtMillis,
    対応履歴メモ: buildNotes(input, ["jobId", "companyName", "jobLocation"], true),
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
