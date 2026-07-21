import type { Metadata } from "next"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import RidejobMediaSection from "@/features/media/components/ridejob-media-section"
import { getPrefectureById, getPrefectureGroups } from "@/features/master/prefectures"
import { getJobsPaged } from "@/features/jobs/api"
import { getMunicipalityById } from "@/features/master/municipalities"
import { getTags } from "@/features/master/tags"
import { getJobCategories } from "@/features/master/job-categories"
import { getMediaArticles } from "@/features/media/api"
import { buildSearchQuery } from "@/shared/lib/utils"
import { withErrorHandling } from "@/shared/lib/error-handling"
import SearchHeader from "./components/search-header"
import SearchConditionSummary from "./components/search-condition-summary"
import JobList from "./components/job-list"
import SearchPagination from "./components/search-pagination"
import SortTabs from "./components/sort-tabs"
import FilterSidebar from "./components/filter-sidebar"
import { generateSearchMetadata } from "@/shared/lib/metadata"
import { normalizeSearchParams } from "@/shared/lib/search-params"

// 検索はリアルタイム性が重要（掲載終了/新着の即時反映）。共有 fetcher が付与する
// revalidate:3600 をこのルートでは打ち消し、求人取得を常にフレッシュにする。
// （/job/[id]・ハブは ISR キャッシュを維持。ここだけ force-no-store で上書き。）
export const fetchCache = "force-no-store"

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(): Promise<Metadata> {
  const base = generateSearchMetadata({})

  // /search はUI用の絞り込み画面であり、パラメータの組み合わせで無限にURLが生える。
  // index面の主役は /jobs/[prefecture]/[jobCategory] のハブページで、素の /search を
  // index させると同じ求人集合をハブと食い合う（重複競合）。よってパラメータの有無に
  // よらず一律 noindex にする。hub.ts の searchUrl コメント「/search はUI用・noindex」
  // が本来の設計意図で、実装だけが素の /search を index させて乖離していた。
  //
  // follow は残す: ハブ・求人詳細への内部リンクは辿らせてクロールを流したいため。
  //
  // canonical は出さない: noindex ページに canonical を併記すると矛盾シグナルになり
  // Google 非推奨。generateSearchMetadata が常に canonical を返すので明示的に打ち消す。
  //
  // googleBot も明示的に false にする: 親（layout.tsx の baseMetadata）が
  // robots.googleBot.index = true を持っており、万一マージで残ると
  // <meta name="googlebot"> が noindex を上書きして静かに効かなくなるため。
  return {
    ...base,
    alternates: undefined,
    robots: {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    },
  }
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawParams = await searchParams
  const { normalized } = normalizeSearchParams(rawParams)

  const keyword = normalized.q
  const prefectureId = normalized.prefecture
  const municipalityId = normalized.municipality
  const tagIds = normalized.tags ? normalized.tags.split(",") : []
  const jobCategoryId = normalized.jobCategory
  const page = normalized.page ? Number(normalized.page) : 1
  const sort = normalized.sort ?? "recommended"

  const [
    prefectureData,
    selectedMunicipality,
    { contents: jobs, totalCount },
    tags,
    jobCategories,
    mediaArticles,
    prefectureGroups,
  ] = await Promise.all([
    prefectureId
      ? withErrorHandling(() => getPrefectureById(prefectureId), "getPrefectureById")
      : null,
    municipalityId
      ? withErrorHandling(() => getMunicipalityById(municipalityId), "getMunicipalityById")
      : null,
    withErrorHandling(
      () =>
        getJobsPaged({
          prefectureId,
          municipalityId,
          tagIds,
          jobCategoryId,
          keyword,
          limit: 10,
          offset: (page - 1) * 10,
          orders: "-publishedAt",
        }),
      "getJobsPaged"
    ),
    withErrorHandling(() => getTags(), "getTags"),
    withErrorHandling(() => getJobCategories(), "getJobCategories"),
    withErrorHandling(() => getMediaArticles(), "getMediaArticles"),
    withErrorHandling(() => getPrefectureGroups(), "getPrefectureGroups"),
  ])

  const { companyArticles, interviewArticles } = mediaArticles

  const prefectureName = prefectureData?.region ?? "都道府県未選択"
  const totalPages = Math.ceil(totalCount / 10)
  const currentPage = Math.min(Math.max(page, 1), totalPages || 1)

  const jobCategoryName = jobCategoryId
    ? jobCategories.find((c) => c.id === jobCategoryId)?.name ?? ""
    : ""

  const heroImageSrc = (() => {
    if (jobCategoryName.includes("タクシー")) return "/images/taxi.png"
    if (jobCategoryName.includes("看護") || jobCategoryName.includes("介護")) return "/images/nurse-hero.png"
    return "/placeholder.svg"
  })()

  const buildPageHref = (p: number) => {
    const query = buildSearchQuery({
      keyword,
      prefectureId,
      municipalityId,
      tagIds,
      jobCategoryId,
      page: p,
      sort,
    })
    return query ? `/search?${query}` : "/search"
  }

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <SearchHeader
        jobCategoryName={jobCategoryName}
        prefectureName={prefectureName}
        selectedMunicipality={selectedMunicipality}
        heroImageSrc={heroImageSrc}
        totalCount={totalCount}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8">
          <div className="order-1 md:order-none">
            <FilterSidebar
              keyword={keyword}
              prefectureId={prefectureId}
              prefectureName={prefectureName}
              municipalityId={municipalityId}
              jobCategories={jobCategories}
              jobCategoryId={jobCategoryId}
              tags={tags}
              tagIds={tagIds}
              prefectureGroups={prefectureGroups}
            />
          </div>

          <div className="order-2 md:order-none">
            <SearchConditionSummary
              keyword={keyword}
              prefectureName={prefectureName}
              selectedMunicipality={selectedMunicipality}
              jobCategoryName={jobCategoryName}
              tags={tags}
              tagIds={tagIds}
              jobCategories={jobCategories}
              jobCategoryId={jobCategoryId}
            />

            <div className="mb-4">
              <SortTabs />
            </div>

            <JobList jobs={jobs} />

            <SearchPagination
              currentPage={currentPage}
              totalPages={totalPages}
              buildPageHref={buildPageHref}
            />
          </div>
        </div>
      </div>

      <RidejobMediaSection companyArticles={companyArticles} interviewArticles={interviewArticles} />
      <SiteFooter />
    </div>
  )
}
