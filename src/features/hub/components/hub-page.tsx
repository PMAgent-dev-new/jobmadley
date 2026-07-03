import Link from "next/link"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import JobCard from "@/features/jobs/components/job-card"
import type { Job } from "@/features/jobs/types"
import {
  generateBreadcrumbStructuredData,
  generateItemListStructuredData,
  generateFaqStructuredData,
} from "@/shared/lib/metadata"
import type { HubStats, HubFaq } from "@/features/hub/lib/hub"

export interface HubRelatedGroup {
  title: string
  links: Array<{ label: string; href: string }>
}

export interface HubCategoryContent {
  catName: string
  work: string
  license: string
  career: string
}

interface HubPageProps {
  breadcrumb: Array<{ name: string; url?: string }>
  h1: string
  lead: string
  /** 概要見出しに使うラベル（例: 東京都のタクシードライバー） */
  summaryLabel: string
  /** 実データ由来の傾向要約文 */
  summary: string
  stats: HubStats
  totalCount: number
  jobs: Job[]
  /** 職種の解説（県×職種・職種ハブで表示。県ハブでは省略） */
  categoryContent?: HubCategoryContent
  faqs?: HubFaq[]
  moreHref?: string
  related?: HubRelatedGroup[]
}

const jsonLd = (obj: unknown) => JSON.stringify(obj).replace(/</g, "\\u003c")

export default function HubPage({
  breadcrumb,
  h1,
  lead,
  summaryLabel,
  summary,
  stats,
  totalCount,
  jobs,
  categoryContent,
  faqs = [],
  moreHref,
  related = [],
}: HubPageProps) {
  const breadcrumbLd = generateBreadcrumbStructuredData(breadcrumb)
  const itemListLd = generateItemListStructuredData(
    jobs.map((j) => ({ url: `/job/${j.id}`, name: j.jobName ?? j.title })),
  )
  const faqLd = faqs.length > 0 ? generateFaqStructuredData(faqs) : null

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }} />}
      <SiteHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav aria-label="パンくずリスト" className="text-sm text-gray-500 mb-4">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumb.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {b.url ? (
                  <Link href={b.url} className="hover:underline">{b.name}</Link>
                ) : (
                  <span className="text-gray-700">{b.name}</span>
                )}
                {i < breadcrumb.length - 1 && <span className="mx-1 text-gray-400">/</span>}
              </li>
            ))}
          </ol>
        </nav>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{h1}</h1>
        <p className="mt-3 text-gray-600 leading-relaxed">{lead}</p>

        {/* 概要・傾向（実データ由来の一次情報） */}
        <section className="mt-8" aria-labelledby="hub-overview">
          <h2 id="hub-overview" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
            {summaryLabel}の求人の傾向
          </h2>
          {summary && <p className="mt-3 text-gray-700 leading-relaxed">{summary}</p>}
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">掲載件数</dt>
              <dd className="text-lg font-bold text-gray-900">{totalCount}件</dd>
            </div>
            {stats.salaryText && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs text-gray-500">給与レンジ</dt>
                <dd className="text-lg font-bold text-gray-900">{stats.salaryText}</dd>
              </div>
            )}
            {stats.companyCount > 0 && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs text-gray-500">掲載企業</dt>
                <dd className="text-lg font-bold text-gray-900">{stats.companyCount}社</dd>
              </div>
            )}
            {stats.employmentText && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs text-gray-500">雇用形態</dt>
                <dd className="text-sm font-semibold text-gray-900">{stats.employmentText}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* 職種の解説（Know意図） */}
        {categoryContent && (
          <section className="mt-10" aria-labelledby="hub-about-job">
            <h2 id="hub-about-job" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
              {categoryContent.catName}の仕事内容・必要な資格
            </h2>
            <div className="mt-3 space-y-4 text-gray-700 leading-relaxed">
              <div>
                <h3 className="font-semibold text-gray-900">仕事内容</h3>
                <p className="mt-1">{categoryContent.work}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">必要な資格・免許</h3>
                <p className="mt-1">{categoryContent.license}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">未経験からのキャリア</h3>
                <p className="mt-1">{categoryContent.career}</p>
              </div>
            </div>
          </section>
        )}

        {/* 求人一覧 */}
        <section className="mt-10" aria-labelledby="hub-jobs">
          <h2 id="hub-jobs" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
            {summaryLabel}の求人一覧
          </h2>
          {jobs.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-gray-500">現在この条件に一致する求人はありません。</p>
          )}
          {moreHref && totalCount > jobs.length && (
            <div className="mt-8 text-center">
              <Link
                href={moreHref}
                className="inline-block px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
              >
                この条件の求人をすべて見る（{totalCount}件）
              </Link>
            </div>
          )}
        </section>

        {/* よくある質問（AIO / FAQPage） */}
        {faqs.length > 0 && (
          <section className="mt-12" aria-labelledby="hub-faq">
            <h2 id="hub-faq" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
              よくある質問
            </h2>
            <div className="mt-4 space-y-4">
              {faqs.map((f, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900">Q. {f.question}</h3>
                  <p className="mt-2 text-gray-700 leading-relaxed">A. {f.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 関連の地域・職種 */}
        {related.map(
          (g) =>
            g.links.length > 0 && (
              <section key={g.title} className="mt-12">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">{g.title}</h2>
                <ul className="flex flex-wrap gap-2">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-block px-3 py-1.5 rounded-full border border-gray-300 text-sm text-gray-700 hover:border-primary hover:text-primary transition-colors"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
