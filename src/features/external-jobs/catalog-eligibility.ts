import { isExternalJobExpired } from "./expiry"
import type { ExternalJob } from "./types"

const CATALOG_CATEGORIES = new Set(["自動車整備士", "バイク整備士"])
const SALARY_KINDS = new Set(["月給", "時給", "日給", "年俸", "年収", "週給"])

/**
 * 公開ページ・応募計測側で、外部求人がMetaカタログの商品条件を満たすかを判定する。
 * フィード生成より取得列が少ないため、公開ビューで確認できない項目は商品IDを送らない。
 */
export function isExternalMetaCatalogJob(job: ExternalJob, now = new Date()): boolean {
  const hasSalary = Boolean(job.salaryRaw?.trim() || job.salaryMin || job.salaryMax)
  return job.source === "hellowork"
    && /^\d{5}-\d{8}$/.test(job.sourceId)
    && job.companyRedactionVerified === true
    && Boolean(job.title?.trim())
    && Boolean(job.prefecture?.trim())
    && Boolean(job.municipalityName?.trim())
    && Boolean(job.employmentType?.trim())
    && SALARY_KINDS.has(job.salaryKind?.trim() || "")
    && hasSalary
    && Boolean(job.description?.trim())
    && Boolean(job.expiresAt?.trim())
    && Boolean(job.lastSeen?.trim())
    && CATALOG_CATEGORIES.has(job.jobCategory?.trim() || "")
    && !isExternalJobExpired(job.expiresAt, job.lastSeen, now)
}
