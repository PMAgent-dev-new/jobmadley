import Link from "next/link"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import JobCard from "@/features/jobs/components/job-card"
import type { Job } from "@/features/jobs/types"
import {
  generateBreadcrumbStructuredData,
  generateItemListStructuredData,
} from "@/shared/lib/metadata"

export interface HubRelatedGroup {
  title: string
  links: Array<{ label: string; href: string }>
}

interface HubPageProps {
  /** パンくず（末尾＝現在ページはurl無し） */
  breadcrumb: Array<{ name: string; url?: string }>
  h1: string
  lead: string
  totalCount: number
  jobs: Job[]
  /** 表示上限を超えた場合の「すべて見る」リンク先（絞り込み検索） */
  moreHref?: string
  related?: HubRelatedGroup[]
}

const jsonLd = (obj: unknown) => JSON.stringify(obj).replace(/</g, "\\u003c")

export default function HubPage({
  breadcrumb,
  h1,
  lead,
  totalCount,
  jobs,
  moreHref,
  related = [],
}: HubPageProps) {
  const breadcrumbLd = generateBreadcrumbStructuredData(breadcrumb)
  const itemListLd = generateItemListStructuredData(
    jobs.map((j) => ({ url: `/job/${j.id}`, name: j.jobName ?? j.title })),
  )

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListLd) }} />
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
        <p className="mt-2 text-sm text-gray-500">掲載件数: {totalCount}件</p>

        {jobs.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-gray-500">現在この条件に一致する求人はありません。</p>
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
