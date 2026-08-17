import type { Metadata } from "next"
import { notFound } from "next/navigation"
import HubPage from "@/features/hub/components/hub-page"
import { computeHubStats, HUB_LIST_LIMIT, hubUrl, type HubFaq } from "@/features/hub/lib/hub"
import { COMPANY_KEEP_JOBS, FEATURED_COMPANIES, findFeaturedCompany } from "@/features/companies/data"
import { getFeaturedCompanyJobs } from "@/features/companies/api"
import { generateHubMetadata } from "@/shared/lib/metadata"

/**
 * 法人単位の企業ページ。生成対象は companies.data.json（人がレビューして足す表）で固定し、
 * 在庫の増減では増えも減りもしない。
 *
 * 生成と維持で閾値を分ける（ヒステリシス）:
 * - 新規に行を足す下限 … COMPANY_MIN_JOBS（人の判断。実行時には効かない）
 * - 公開済みページを index し続ける下限 … COMPANY_KEEP_JOBS
 * 在庫が下限を割っても 404 にはしない。インデックス済みURLを月次の在庫変動で失うほうが損で、
 * 畳むと決めたら RETIRED_COMPANIES へ移して301で送る（next.config.mjs）。
 *
 * ⚠️ index/noindex の判定は generateMetadata と本体で必ず同じ条件にすること。
 * PR #86 の初版は generateMetadata を直し忘れて「200を返すのに noindex」を出した。
 */
export const revalidate = 3600
export const dynamicParams = false

interface Props {
  params: Promise<{ company: string }>
}

export function generateStaticParams() {
  return FEATURED_COMPANIES.map((company) => ({ company: company.slug }))
}

/** 掲載中の求人がこの件数以上あれば index する。generateMetadata と本体で共有する唯一の判定。 */
const shouldIndex = (jobCount: number) => jobCount >= COMPANY_KEEP_JOBS

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

/**
 * 職種別の「応募前に見るところ」。掲載中の職種にだけ出す。
 * 以前はタクシードライバー向けの段落を全ページに固定で出していたが、法人単位に作り直した結果
 * 整備士しか募集していない会社（レッドバロン、オートアールズ等）が多数を占めるようになり、
 * 本文と掲載求人が噛み合わなくなるため。
 */
const CATEGORY_ADVICE: Record<string, string> = {
  タクシードライバー:
    "普通自動車第二種免許の取得支援、研修中の給与、勤務シフト（隔日勤務・日勤・夜勤）、配車アプリや無線の利用環境などを比較すると、入社後の働き方を具体的に判断しやすくなります。",
  ハイヤードライバー:
    "配車先の業種、拘束時間と待機の扱い、接遇研修の内容、第二種免許の要否を確認しましょう。同じ会社でもタクシー乗務とは勤務形態が大きく異なります。",
  自動車整備士:
    "扱う車種（国産・輸入車・商用車）、自動車検査員や整備士資格の要否と資格手当、指定工場か認証工場か、繁忙期の残業時間を比較しましょう。工場の設備と扱う車種で身につく技術が変わります。",
  バイク整備士:
    "扱うメーカーと車種、二輪自動車整備士資格の要否と手当、店舗での接客業務の比重、未経験者向け研修の期間を確認しましょう。",
  バスドライバー:
    "大型自動車第二種免許の取得支援、路線・貸切・送迎のどれを担当するか、拘束時間と泊まり勤務の有無を確認しましょう。",
  運行管理者:
    "運行管理者資格の要否と取得支援、担当する営業所の車両数、点呼のシフト（早朝・深夜の有無）、乗務との兼務があるかを確認しましょう。",
  営業:
    "扱う商材（車両・部品・サービス）、既存顧客中心か新規開拓か、インセンティブの比率、社用車と担当エリアの広さを比較しましょう。",
}

/** 掲載件数の多い職種から最大2つぶんのアドバイスをHTMLで返す。 */
const buildCategoryAdvice = (categories: Array<{ name: string }>): string =>
  categories
    .map((category) => ({ name: category.name, advice: CATEGORY_ADVICE[category.name] }))
    .filter((item): item is { name: string; advice: string } => Boolean(item.advice))
    .slice(0, 2)
    .map((item) => `<h3>${item.name}求人を検討する場合</h3>\n    <p>${item.advice}</p>`)
    .join("\n    ")

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
      // 「関連する求人」ではなく「その法人の求人」。ページ自体が法人単位になったので言い切る。
      answer: `RIDE JOB（ライドジョブ）では、${name}の求人を${count}件掲載しています。募集状況は更新されるため、各求人の掲載内容と更新日をご確認ください。`,
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

  // 中身の薄いページを検索結果へ出さない。導線と将来の求人追加のため follow は残す。
  return shouldIndex(jobs.length) ? metadata : { ...metadata, robots: { index: false, follow: true } }
}

export default async function CompanyPage({ params }: Props) {
  const { company: slug } = await params
  const company = findFeaturedCompany(slug)
  if (!company) notFound()

  const allJobs = await getFeaturedCompanyJobs(slug)
  const jobs = allJobs.slice(0, HUB_LIST_LIMIT)
  // 会社ページの求人はすべて同一企業のものなので、母数1件でも「その企業の提示額」であって
  // 集計の外れ値ではない。地域ハブ用の下限（5件）をここに当てると純粋な情報損失になる。
  const stats = computeHubStats(allJobs, { minSample: 1 })
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
    <p>同じ会社の求人でも、営業所・店舗や職種によって勤務時間、給与体系、研修内容、必要な免許・資格は異なります。求人票では、配属先までの通勤方法、歩合・手当・保証給を含む給与条件、休日、研修期間、資格取得支援の対象範囲を確認しましょう。</p>
    ${buildCategoryAdvice(categories)}
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
          ? `${company.name}の求人を${allJobs.length}件掲載しています。${regionText}の求人を、職種・給与・勤務条件から比較できます。`
          : `${company.name}の求人ページです。現在は掲載中の求人がありません。募集が追加されると、このページで勤務地や採用条件を比較できます。`
      }
      // ロゴは既に持っている社のみ。33社ぶんの他社ロゴを新規に集める運用と商標リスクを避け、
      // 無い場合は社名タイポグラフィ（heroLabel）にフォールバックする。
      heroImage={company.logoUrl ? { src: company.logoUrl, alt: `${company.name}のロゴ` } : undefined}
      heroLabel={company.logoUrl ? undefined : company.name}
      heroEyebrow="企業から求人を探す"
      singleCompany
      summaryLabel={company.name}
      summary={`${summaryParts.join("、")}。掲載内容は求人ごとに更新されます。`}
      stats={stats}
      totalCount={allJobs.length}
      jobs={jobs}
      bodyHtml={bodyHtml}
      faqs={faq}
      moreHref={allJobs.length > HUB_LIST_LIMIT ? `/search?q=${encodeURIComponent(company.aliases[0])}` : undefined}
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

