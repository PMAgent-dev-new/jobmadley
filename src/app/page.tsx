import type { Metadata } from "next"
import { getPrefectureGroups } from "@/features/master/prefectures"
import { getJobCountsByPrefecture, getJobs } from "@/features/jobs/api"
import { getMediaArticles } from "@/features/media/api"
import { withErrorHandling } from "@/shared/lib/error-handling"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import RegionSearchSection from "@/features/master/components/prefecture-region-section"
import ComicHeroSection from "./components/comic-hero-section"
import MarqueeSection from "./components/marquee-section"
import ValueStripSection from "./components/value-strip-section"
import LatestJobsSection from "./components/latest-jobs-section"
import MediaSection from "./components/media-section"
import FeaturedCompaniesSection from "./components/featured-companies-section"
import { getTags } from "@/features/master/tags"
import PopularTagsSection from "@/features/master/components/popular-tags-section"
import { getJobCategories } from "@/features/master/job-categories"
import JobCategoriesSection from "@/features/jobs/components/job-categories-section"
import { generateHomeMetadata } from "@/shared/lib/metadata"

// revalidate=0（毎リクエストSSR）は1ビューで microCMS を約52コール消費し
// レート制限超過時に都道府県件数が0表示へ縮退していたため、5分ISRに変更。
export const revalidate = 300
export const metadata: Metadata = generateHomeMetadata()

export default async function HomePage() {
  const [prefectures, latestJobs, mediaArticles, tags, jobCategories, countMap] = await Promise.all([
    withErrorHandling(() => getPrefectureGroups(), "getPrefectureGroups"),
    withErrorHandling(() => getJobs({ limit: 4, orders: "-publishedAt" }), "getLatestJobs"),
    withErrorHandling(() => getMediaArticles(), "getMediaArticles"),
    withErrorHandling(() => getTags(), "getTags"),
    withErrorHandling(() => getJobCategories(), "getJobCategories"),
    // 47都道府県×個別カウントを廃止し、fields絞りの全件ページング+集計（数コール）へ
    withErrorHandling(() => getJobCountsByPrefecture(), "getJobCountsByPrefecture"),
  ])

  const { companyArticles, interviewArticles } = mediaArticles

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <ComicHeroSection />
      <MarqueeSection />
      <ValueStripSection />
      <RegionSearchSection prefectures={prefectures} countMap={countMap} />
      <PopularTagsSection tags={tags} />
      <JobCategoriesSection categories={jobCategories} />
      <FeaturedCompaniesSection />
      <LatestJobsSection jobs={latestJobs} />
      <MediaSection
        companyArticles={companyArticles}
        interviewArticles={interviewArticles}
      />
      <SiteFooter />
    </div>
  )
}
