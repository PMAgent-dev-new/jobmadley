import { describe, expect, test } from "vitest"
import {
  assessCatalogTouch,
  compareCatalogAndAppliedJob,
  looksLikeMetaCatalogTraffic,
} from "./catalog-attribution"

const NOW = Date.parse("2026-09-17T00:00:00.000Z")

describe("catalog attribution validation", () => {
  test("accepts a recent Meta catalog touch", () => {
    expect(assessCatalogTouch({
      catalogJobId: "job-1",
      catalogClickedAt: "2026-09-16T23:00:00.000Z",
      catalogSource: "ig",
      catalogMedium: "ad",
      catalogEvidence: "utm",
    }, NOW)).toEqual({ jobId: "job-1", clickedAtMillis: Date.parse("2026-09-16T23:00:00.000Z") })
  })

  test("rejects hostile ids and future timestamps", () => {
    expect(assessCatalogTouch({
      catalogJobId: "<script>",
      catalogClickedAt: "2026-09-17T00:00:00.000Z",
      catalogEvidence: "fbclid",
      fbclid: "fb-click-1",
    }, NOW).status).toBe("invalid")
    expect(assessCatalogTouch({
      catalogJobId: "job-1",
      catalogClickedAt: "2026-09-18T00:00:00.000Z",
      catalogEvidence: "fbclid",
      fbclid: "fb-click-1",
    }, NOW).status).toBe("invalid")
  })

  test("rejects a claimed fbclid evidence without the actual click id", () => {
    expect(assessCatalogTouch({
      catalogJobId: "job-1",
      catalogClickedAt: "2026-09-16T23:00:00.000Z",
      catalogEvidence: "fbclid",
    }, NOW).status).toBe("invalid")
  })

  test("marks seven-day-old touches stale", () => {
    expect(assessCatalogTouch({
      catalogJobId: "job-1",
      catalogClickedAt: "2026-09-10T00:00:00.000Z",
      catalogEvidence: "fbclid",
      fbclid: "fb-click-1",
    }, NOW).status).toBe("stale")
  })

  test("reports missing marker only for recognizable Meta catalog traffic", () => {
    const input = { utmSource: "meta", utmMedium: "catalog" }
    expect(looksLikeMetaCatalogTraffic(input)).toBe(true)
    expect(assessCatalogTouch(input, NOW).status).toBe("missing")
    expect(assessCatalogTouch({ utmSource: "google", utmMedium: "cpc" }, NOW).status).toBeUndefined()
  })

  test("uses the legacy utm_content job id for older catalog links", () => {
    expect(assessCatalogTouch({
      utmSource: "meta",
      utmMedium: "catalog",
      utmContent: "job-legacy",
      utmLastTouchAt: "2026-09-16T23:00:00.000Z",
    }, NOW)).toEqual({
      jobId: "job-legacy",
      clickedAtMillis: Date.parse("2026-09-16T23:00:00.000Z"),
    })
  })

  test("does not infer a Hello Work catalog click from an ad name", () => {
    expect(assessCatalogTouch({
      utmSource: "fb",
      utmMedium: "ad",
      utmContent: "Catalog_Mechanic",
      utmLastTouchAt: "2026-09-16T23:00:00.000Z",
      appliedJobId: "hw-27010-41545161",
    }, NOW)).toEqual({})
  })

  test("does not treat a regular Meta ad name as a job id", () => {
    expect(assessCatalogTouch({
      utmSource: "fb",
      utmMedium: "ad",
      utmContent: "Catalog_Mechanic",
      utmLastTouchAt: "2026-09-16T23:00:00.000Z",
      appliedJobId: "job-1",
    }, NOW)).toEqual({})
  })

  test("does not misclassify a missing applied job as a changed job", () => {
    expect(compareCatalogAndAppliedJob("job-a", undefined)).toBe("applied_job_missing")
  })

  test("compares raw external id and hw-prefixed apply id", () => {
    expect(compareCatalogAndAppliedJob("27010-41545161", "hw-27010-41545161")).toBe("same_job")
    expect(compareCatalogAndAppliedJob("job-a", "job-b")).toBe("changed_job")
  })
})
