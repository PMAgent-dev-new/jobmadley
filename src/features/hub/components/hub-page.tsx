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
  /** CMS(hub-contents)の手書き本文HTML（あれば表示） */
  bodyHtml?: string
  faqs?: HubFaq[]
  moreHref?: string
  related?: HubRelatedGroup[]
  /** 現在ページ（1始まり） */
  page?: number
  /** 総ページ数 */
  totalPages?: number
  /** ページリンク生成（n→href） */
  pageHref?: (n: number) => string
}

const jsonLd = (obj: unknown) => JSON.stringify(obj).replace(/</g, "\\u003c")

/** 表示するページ番号（先頭・末尾・現在周辺）を省略記号付きで返す */
function pageWindow(current: number, total: number): number[] {
  const s = new Set<number>([1, total, current, current - 1, current + 1])
  return [...s].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
}

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
  bodyHtml,
  faqs = [],
  moreHref,
  related = [],
  page = 1,
  totalPages = 1,
  pageHref,
}: HubPageProps) {
  const isFirstPage = page <= 1
  const breadcrumbLd = generateBreadcrumbStructuredData(breadcrumb)
  const itemListLd = generateItemListStructuredData(
    jobs.map((j) => ({ url: `/job/${j.id}`, name: j.jobName ?? j.title })),
  )
  // 独自コンテンツ（傾向/仕事内容/FAQ）は1ページ目のみ。2ページ目以降は求人一覧の続き。
  const faqLd = isFirstPage && faqs.length > 0 ? generateFaqStructuredData(faqs) : null

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

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          {h1}{!isFirstPage && `（${page}ページ目）`}
        </h1>
        {isFirstPage && <p className="mt-3 text-gray-600 leading-relaxed">{lead}</p>}

        {/* 概要・傾向（実データ由来の一次情報。1ページ目のみ） */}
        {isFirstPage && (
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
        )}

        {/* 職種の解説（Know意図。1ページ目のみ） */}
        {isFirstPage && categoryContent && (
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

        {/* CMS(hub-contents)の手書き本文（1ページ目のみ・登録があれば） */}
        {isFirstPage && bodyHtml && (
          <section
            className="mt-10 text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-4 [&_p]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mt-2 [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
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
          {totalPages > 1 && pageHref && (
            <nav aria-label="ページ送り" className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="inline-flex items-center min-h-[44px] px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:border-primary hover:text-primary">
                  前へ
                </Link>
              )}
              {pageWindow(page, totalPages).map((n, idx, arr) => (
                <span key={n} className="flex items-center gap-2">
                  {idx > 0 && n - arr[idx - 1] > 1 && <span className="text-gray-400">…</span>}
                  {n === page ? (
                    <span aria-current="page" className="inline-flex items-center min-h-[44px] px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm font-bold">{n}</span>
                  ) : (
                    <Link href={pageHref(n)} className="inline-flex items-center min-h-[44px] px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:border-primary hover:text-primary">{n}</Link>
                  )}
                </span>
              ))}
              {page < totalPages && (
                <Link href={pageHref(page + 1)} className="inline-flex items-center min-h-[44px] px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:border-primary hover:text-primary">
                  次へ
                </Link>
              )}
            </nav>
          )}
          {moreHref && (
            <div className="mt-6 text-center">
              <Link href={moreHref} className="text-sm text-primary hover:underline">
                条件を絞り込んで探す
              </Link>
            </div>
          )}
        </section>

        {/* よくある質問（AIO / FAQPage。1ページ目のみ） */}
        {isFirstPage && faqs.length > 0 && (
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
                        className="inline-flex items-center min-h-[40px] px-3 py-1.5 rounded-full border border-gray-300 text-sm text-gray-700 hover:border-primary hover:text-primary transition-colors"
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
