import companiesData from "./companies.data.json"
import { buildAliasIndex, resolveCompanySlug, type CompanyAliasEntry } from "./company-match"

/**
 * 企業ページは「法人単位」で作る。ブランドやグループ単位でまとめると、
 * 別法人の求人を「この会社の求人」として1ページに並べることになり、実態と食い違う。
 */
export interface FeaturedCompany {
  slug: string
  /** 表示名。掲載中の companyName に実在する法人名をそのまま使う。 */
  name: string
  /** companyName に対する前方一致キー（グループ接頭辞を剥がした後に評価）。 */
  aliases: string[]
  /** 他社ロゴは新規に集めない方針のため任意。無ければ社名タイポグラフィで表示する。 */
  logoUrl?: string
  /** RIDE JOB上でどの求人を束ねているかを明示する固有説明。 */
  overview: string
}

/** 廃止した slug。既存URLは404にせずここの遷移先へ301で送る（next.config.mjs が読む）。 */
export interface RetiredCompany {
  slug: string
  name: string
  redirectTo: string
  reason: string
}

/**
 * 新しく企業ページを起こす下限。県×職種ハブの HUB_MIN_JOBS と同じ値に揃えている。
 * これを下げると市区町村ハブで一度通った「薄いページの量産」を繰り返すことになる。
 * ⚠️ 実際に適用されるのは companies.data.json に行を足すときの人の判断であって、実行時ではない。
 */
export const COMPANY_MIN_JOBS = 5

/**
 * 公開済みの企業ページを index し続ける下限（ヒステリシス）。
 *
 * 生成と維持で閾値を分ける理由は市区町村ハブ（PR #86）と同じで、求人在庫は日々動くため
 * 同じ閾値だと掲載が1件減った月にインデックス済みURLが noindex に落ちて評価を失う。
 * これを割った slug は「復活を待つ」のではなく、人が retired へ移して301で畳む。
 */
export const COMPANY_KEEP_JOBS = 2

export const FEATURED_COMPANIES: FeaturedCompany[] = companiesData.companies

export const RETIRED_COMPANIES: RetiredCompany[] = companiesData.retired

/** 長い接頭辞から評価しないと「日本交通グループ関西」が「日本交通グループ」に食われる。 */
const GROUP_PREFIXES: string[] = [...companiesData.groupPrefixes].sort((a, b) => b.length - a.length)

const ALIAS_INDEX: CompanyAliasEntry[] = buildAliasIndex(FEATURED_COMPANIES)

export const findFeaturedCompany = (slug: string): FeaturedCompany | undefined =>
  FEATURED_COMPANIES.find((company) => company.slug === slug)

/** 求人が属する企業ページの slug。どこにも属さなければ null。 */
export const companySlugForJob = (job: { companyName?: string; hideCompanyName?: boolean }): string | null => {
  // 企業名を非公開にした求人は、実名の企業ページに載せてはいけない
  if (job.hideCompanyName) return null
  return resolveCompanySlug(job.companyName, ALIAS_INDEX, GROUP_PREFIXES)
}

/** テスト用に、実行時と同じ索引で解決するための入口。 */
export const resolveCompanySlugForTest = (companyName: string): string | null =>
  resolveCompanySlug(companyName, ALIAS_INDEX, GROUP_PREFIXES)
