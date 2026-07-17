import Link from "next/link"
import Image from "next/image"
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

/** ハブ→メディア記事の相互リンク（P1-1）。href はメディア（別ゾーン）の絶対URL。 */
export interface HubArticleLink {
  title: string
  href: string
  image?: string
  date?: string
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
  /** 「すべて見る」CTA のリンク先（絞り込み済み /search）。表示件数<総件数なら件数付きラベル */
  moreHref?: string
  related?: HubRelatedGroup[]
  /** 関連お役立ち記事（メディア）へのリンク */
  relatedArticles?: HubArticleLink[]
  /** クロール用の求人リンク一覧（表示カードより広く各求人詳細へ内部リンクを張る / SEO内部リンク深化） */
  jobLinks?: Array<{ id: string; name: string }>
  /** 企業ハブなどでH1の横に表示する識別画像。通常ハブでは省略。 */
  heroImage?: { src: string; alt: string }
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
  bodyHtml,
  faqs = [],
  moreHref,
  related = [],
  relatedArticles = [],
  jobLinks = [],
  heroImage,
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

        <div className={heroImage ? "flex flex-col gap-5 sm:flex-row sm:items-center" : undefined}>
          {heroImage && (
            <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-4 sm:w-64">
              <div className="relative h-16 w-full">
                <Image
                  src={heroImage.src}
                  alt={heroImage.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 256px"
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          )}
          <div>
            {heroImage && <p className="mb-1 text-sm font-semibold text-primary">企業から求人を探す</p>}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{h1}</h1>
            <p className="mt-3 text-gray-600 leading-relaxed">{lead}</p>
          </div>
        </div>

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

        {/* CMS(hub-contents)の手書き本文（登録があれば） */}
        {bodyHtml && (
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
          {moreHref && (
            <div className="mt-8 text-center">
              <Link
                href={moreHref}
                className="inline-flex items-center justify-center min-h-[48px] px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity"
              >
                {jobs.length < totalCount
                  ? `この条件の求人をすべて見る（全${totalCount}件）`
                  : "条件を絞り込んで探す"}
              </Link>
            </div>
          )}

          {/* クロール用の求人リンク一覧（各求人詳細への内部リンクを深める / SEO） */}
          {jobLinks.length > 0 && (
            <div className="mt-10 border-t border-gray-100 pt-6">
              <h3 className="text-sm font-semibold text-gray-500">
                {summaryLabel}の求人一覧（{jobLinks.length}件）
              </h3>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                {jobLinks.map((j) => (
                  <li key={j.id} className="truncate">
                    <Link
                      href={`/job/${j.id}`}
                      className="text-gray-600 hover:text-primary hover:underline"
                    >
                      {j.name}
                    </Link>
                  </li>
                ))}
              </ul>
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

        {/* 関連お役立ち記事（ハブ→メディアの相互リンク / P1-1） */}
        {relatedArticles.length > 0 && (
          <section className="mt-12" aria-labelledby="hub-articles">
            <h2 id="hub-articles" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
              {summaryLabel}の仕事を知る・役立つ記事
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {relatedArticles.map((a) => (
                <a
                  key={a.href}
                  href={a.href}
                  className="group block overflow-hidden rounded-lg border border-gray-200 transition-colors hover:border-primary"
                >
                  {a.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image} alt="" loading="lazy" className="h-32 w-full object-cover" />
                  )}
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:underline">
                      {a.title}
                    </p>
                    {a.date && <p className="mt-1 text-xs text-gray-500">{a.date}</p>}
                  </div>
                </a>
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
