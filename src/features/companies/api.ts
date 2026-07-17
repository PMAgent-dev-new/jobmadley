import { cache } from "react"
import { getJobsByCompanyTerms } from "@/features/jobs/api"
import { findFeaturedCompany } from "./data"

/** generateMetadata とページ本体で同じ企業求人を二重取得しない。 */
export const getFeaturedCompanyJobs = cache(async (slug: string) => {
  const company = findFeaturedCompany(slug)
  if (!company) return []
  return getJobsByCompanyTerms(company.matchTerms)
})

