import type { Metadata } from "next"
import { notFound } from "next/navigation"
import HubPage from "@/features/hub/components/hub-page"
import { computeHubStats, HUB_LIST_LIMIT, hubUrl, type HubFaq } from "@/features/hub/lib/hub"
import { FEATURED_COMPANIES, findFeaturedCompany } from "@/features/companies/data"
import { getFeaturedCompanyJobs } from "@/features/companies/api"
import { generateHubMetadata } from "@/shared/lib/metadata"

export const revalidate = 3600
export const dynamicParams = false

interface Props {
  params: Promise<{ company: string }>
}

export function generateStaticParams() {
  return FEATURED_COMPANIES.map((company) => ({ company: company.slug }))
}

const countNames = (values: Array<{ name?: string; slug?: string } | undefined>) => {
  const counts = new Map<string, { name: string; slug?: string; count: number }>()
  for (const value of values) {
    if (!value?.name) continue
    const current = counts.get(value.name)
    counts.set(value.name, {
      name: value.name,
      slug: value.slug || current?.slug,
      count: (current?.count ?? 0) + 1,
    })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"))
}

const joinTopNames = (items: Array<{ name: string }>, fallback: string) =>
  items.length > 0 ? items.slice(0, 5).map((item) => item.name).join("・") : fallback

const buildFaqs = (params: {
  name: string
  count: number
  regions: Array<{ name: string }>
  categories: Array<{ name: string }>
  salaryText?: string
  hasBeginnerJobs: boolean
}): HubFaq[] => {
  const { name, count, regions, categories, salaryText, hasBeginnerJobs } = params
  const regionText = joinTopNames(regions, "求人詳細に記載された地域")
  const categoryText = joinTopNames(categories, "求人詳細に記載された職種")
  const faqs: HubFaq[] = [
    {
      question: `${name}の求人は何件ありますか？`,
      answer: `RIDE JOB（ライドジョブ）では、${name}に関連する求人を${count}件掲載しています。募集状況は更新されるため、各求人の掲載内容と更新日をご確認ください。`,
    },
    {
      question: `${name}ではどの地域の求人を募集していますか？`,
      answer: `現在の掲載求人では、${regionText}などの勤務地を確認できます。実際の配属先や通勤条件は求人ごとに異なります。`,
    },
    {
      question: `${name}ではどのような職種を募集していますか？`,
      answer: `現在は${categoryText}などの求人を掲載しています。仕事内容や必要な免許・資格は各求人の募集内容をご確認ください。`,
    },
  ]

  faqs.push({
    question: `${name}は未経験でも応募できますか？`,
    answer: hasBeginnerJobs
      ? `未経験者を対象にした求人が掲載されています。研修、免許取得支援、給与保証などの有無は求人によって異なるため、応募前に条件をご確認ください。`
      : `経験要件は求人によって異なります。未経験可否や研修・資格取得支援の有無は、各求人の応募条件をご確認ください。`,
  })

  if (salaryText) {
    faqs.push({
      question: `${name}の求人の給与はどのくらいですか？`,
      answer: `現在掲載中の求人では${salaryText}です。歩合、手当、保証給、賞与などを含む支給条件は求人ごとに異なります。`,
    })
  }

  return faqs
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company: slug } = await params
  const company = findFeaturedCompany(slug)
  if (!company) return { title: "企業が見つかりません", robots: { index: false, follow: false } }

  const jobs = await getFeaturedCompanyJobs(slug)
  const title = `${company.name}の求人・転職｜${jobs.length}件`
  const description = `${company.name}の求人を${jobs.length}件掲載。勤務地、職種、給与、勤務形態、未経験可否などを比較して、自分に合う募集を探せます。`
  const metadata = generateHubMetadata({
    title,
    description,
    canonicalPath: `/companies/${company.slug}`,
  })

  // 求人0件のページを検索結果へ出さず、ロゴからの導線と将来の求人追加には備える。
  return jobs.length > 0 ? metadata : { ...metadata, robots: { index: false, follow: true } }
}

export default async function CompanyPage({ params }: Props) {
  const { company: slug } = await params
  const company = findFeaturedCompany(slug)
  if (!company) notFound()

  const allJobs = await getFeaturedCompanyJobs(slug)
  const jobs = allJobs.slice(0, HUB_LIST_LIMIT)
  const stats = computeHubStats(allJobs)
  const regions = countNames(allJobs.map((job) => job.prefecture && ({ name: job.prefecture.region, slug: job.prefecture.slug })))
  const categories = countNames(allJobs.map((job) => job.jobCategory && ({ name: job.jobCategory.name, slug: job.jobCategory.slug })))
  const regionText = joinTopNames(regions, "全国")
  const categoryText = joinTopNames(categories, "ドライバー・整備士など")
  const hasBeginnerJobs = allJobs.some((job) =>
    job.tags?.some((tag) => tag.name.includes("未経験") || tag.name.includes("無資格")),
  )

  const summaryParts = [
    allJobs.length > 0 ? `掲載求人は${allJobs.length}件` : "現在掲載中の求人は0件",
    regions.length > 0 ? `勤務地は${regionText}` : undefined,
    categories.length > 0 ? `募集職種は${categoryText}` : undefined,
    stats.salaryText ? `給与は${stats.salaryText}` : undefined,
  ].filter(Boolean)

  const faq = buildFaqs({
    name: company.name,
    count: allJobs.length,
    regions,
    categories,
    salaryText: stats.salaryText,
    hasBeginnerJobs,
  })

  const bodyHtml = `
    <h2>${company.name}の求人について</h2>
    <p>${company.overview}</p>
    <h2>応募前に比較したいポイント</h2>
    <p>同じ企業・ブランドの求人でも、営業所や職種によって勤務時間、給与体系、研修内容、必要な免許・資格は異なります。求人票では、配属先までの通勤方法、歩合・手当・保証給を含む給与条件、休日、研修期間、資格取得支援の対象範囲を確認しましょう。</p>
    <h3>タクシードライバー求人を検討する場合</h3>
    <p>普通自動車第二種免許の取得支援、研修中の給与、勤務シフト、配車アプリや無線の利用環境などを比較すると、入社後の働き方を具体的に判断しやすくなります。</p>
  `

  return (
    <HubPage
      breadcrumb={[
        { name: "トップ", url: "/" },
        { name: "企業から探す", url: "/#featured-companies" },
        { name: `${company.name}の求人` },
      ]}
      h1={`${company.name}の求人・転職`}
      lead={
        allJobs.length > 0
          ? `${company.name}に関連する求人を${allJobs.length}件掲載しています。${regionText}の求人を、職種・給与・勤務条件から比較できます。`
          : `${company.name}の求人ページです。現在は掲載中の求人がありません。募集が追加されると、このページで勤務地や採用条件を比較できます。`
      }
      heroImage={{ src: company.logoUrl, alt: `${company.name}のロゴ` }}
      summaryLabel={company.name}
      summary={`${summaryParts.join("、")}。掲載内容は求人ごとに更新されます。`}
      stats={stats}
      totalCount={allJobs.length}
      jobs={jobs}
      bodyHtml={bodyHtml}
      faqs={faq}
      moreHref={allJobs.length > HUB_LIST_LIMIT ? `/search?q=${encodeURIComponent(company.matchTerms[0])}` : undefined}
      jobLinks={allJobs.slice(0, 200).map((job) => ({ id: job.id, name: job.jobName ?? job.title }))}
      related={[
        {
          title: `${company.name}の勤務地から探す`,
          links: regions
            .filter((region) => region.slug)
            .map((region) => ({ label: `${region.name}（${region.count}件）`, href: hubUrl.prefecture(region.slug!) })),
        },
        {
          title: `${company.name}の職種から探す`,
          links: categories
            .filter((category) => category.slug)
            .map((category) => ({ label: `${category.name}（${category.count}件）`, href: hubUrl.category(category.slug!) })),
        },
      ]}
    />
  )
}

