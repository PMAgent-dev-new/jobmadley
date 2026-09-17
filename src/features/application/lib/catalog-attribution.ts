export type CatalogAttributionStatus =
  | "same_job"
  | "changed_job"
  | "missing"
  | "applied_job_missing"
  | "stale"
  | "invalid"

export type CatalogTouchInput = {
  catalogJobId?: string
  catalogClickedAt?: string
  catalogSource?: string
  catalogMedium?: string
  catalogEvidence?: "utm" | "fbclid"
  fbclid?: string
  utmSource?: string
  utmMedium?: string
  utmContent?: string
  utmLastTouchAt?: string
  appliedJobId?: string
}

export type CatalogTouchAssessment = {
  status?: CatalogAttributionStatus
  jobId?: string
  clickedAtMillis?: number
}

const META_SOURCES = new Set(["meta", "facebook", "fb", "instagram", "ig", "msg", "an", "th"])
const META_PAID_MEDIUMS = new Set(["catalog", "ad", "cpc", "paid_social", "paid-social"])
const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/
const FBCLID = /^[A-Za-z0-9._-]{1,512}$/
const DAY_MS = 24 * 60 * 60 * 1000
const ATTRIBUTION_WINDOW_MS = 7 * DAY_MS
const CLOCK_SKEW_MS = 5 * 60 * 1000

const norm = (value: string | undefined): string => value?.trim().toLowerCase() || ""

export const looksLikeMetaCatalogTraffic = (input: CatalogTouchInput): boolean => {
  const source = norm(input.utmSource)
  const medium = norm(input.utmMedium)
  // 広告名(utm_content)にcatalogという語が含まれるだけでは、通常広告と区別できない。
  // 明示されたcatalog mediumだけを旧リンクの証拠とし、新リンクはcatalog_job_id側で判定する。
  return META_SOURCES.has(source) && medium === "catalog"
}

/** Cookie由来のカタログ接触を、サーバー側で求人照合する前に検証する。 */
export const assessCatalogTouch = (
  input: CatalogTouchInput,
  now = Date.now(),
): CatalogTouchAssessment => {
  const source = norm(input.utmSource)
  const medium = norm(input.utmMedium)
  const content = input.utmContent?.trim() || ""
  // 旧フィードの自社求人は utm_medium=catalog / utm_content=求人ID だった。
  // Hello Work求人は medium=ad / content=広告名だったため、旧リンクは安全に識別できない。
  // 新フィードのcatalog_job_idだけを採用し、Catalog_Mechanic等の広告名を照合しない。
  const legacyCatalogJobId = META_SOURCES.has(source) && medium === "catalog" && JOB_ID.test(content)
    ? content
    : undefined
  const jobId = input.catalogJobId?.trim() || legacyCatalogJobId
  if (!jobId) {
    return looksLikeMetaCatalogTraffic(input) ? { status: "missing" } : {}
  }
  if (!JOB_ID.test(jobId)) return { status: "invalid" }

  const catalogSource = norm(input.catalogSource)
  const catalogMedium = norm(input.catalogMedium)
  const evidence = input.catalogEvidence
  const validEvidence = Boolean(legacyCatalogJobId)
    || (evidence === "fbclid" && FBCLID.test(input.fbclid?.trim() || ""))
    || (META_SOURCES.has(catalogSource) && META_PAID_MEDIUMS.has(catalogMedium))
  if (!validEvidence) return { status: "invalid", jobId }

  const clickedAtMillis = Date.parse(input.catalogClickedAt || input.utmLastTouchAt || "")
  if (!Number.isFinite(clickedAtMillis)) return { status: "invalid", jobId }
  const age = now - clickedAtMillis
  if (age < -CLOCK_SKEW_MS) return { status: "invalid", jobId, clickedAtMillis }
  if (age >= ATTRIBUTION_WINDOW_MS) return { status: "stale", jobId, clickedAtMillis }
  return { jobId, clickedAtMillis }
}

export const compareCatalogAndAppliedJob = (
  catalogJobId: string,
  appliedJobId: string | undefined,
): CatalogAttributionStatus => {
  const applied = appliedJobId?.trim().replace(/^hw-/, "")
  if (!applied) return "applied_job_missing"
  return applied === catalogJobId ? "same_job" : "changed_job"
}
