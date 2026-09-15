import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import EntryCtaLink from "@/shared/components/entry-cta-link"
import JobViewTracker from "@/app/job/components/job-view-tracker"
import {
  getExternalJob,
  getExternalJobDetail,
  EXTERNAL_DETAIL_GROUPS,
  hubSlugForExternalCategory,
  externalApplyId,
} from "@/features/external-jobs/api"
import { getJobCategories } from "@/features/master/job-categories"
import { isExternalJobExpired } from "@/features/external-jobs/expiry"
import { isExternalMetaCatalogJob } from "@/features/external-jobs/catalog-eligibility"

/**
 * 提携媒体から取り込んだ求人の詳細ページ。
 * - robots: noindex（薄い/重複コンテンツ回避。follow で内部リンクは辿らせる）
 * - JobPosting 構造化データは付けない（重複 JobPosting 回避）
 * - 求人票画像・企業画像・地図は出さない（テキストのみ）
 * - 出典と運営主体を明記し、掲載期限後は相談CTAを停止する
 */
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { source: string; id: string }[] {
  return []
}

interface Props {
  params: Promise<{ source: string; id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { source, id } = await params
  const job = await getExternalJob(source, decodeURIComponent(id))
  if (!job) return { title: "求人が見つかりません", robots: { index: false, follow: false } }
  // 社名はタイトルに出さない（転載求人は掲載企業を伏せる方針）。job.companyName は
  // api 側で常に undefined になるが、ここで参照しないこと自体を仕様として明示しておく。
  return {
    title: `${job.title ?? "求人"}｜${job.prefecture ?? ""}の求人`,
    description: `${job.prefecture ?? ""}の${job.title ?? "求人"}の求人情報。`,
    robots: { index: false, follow: true },
  }
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 py-3 sm:flex-row sm:gap-4">
      <dt className="w-full shrink-0 text-sm text-gray-500 sm:w-32">{label}</dt>
      <dd className="whitespace-pre-wrap text-gray-800">{value}</dd>
    </div>
  )
}

export default async function Page({ params }: Props) {
  const { source, id } = await params
  const job = await getExternalJob(source, decodeURIComponent(id))
  if (!job) notFound()

  const expired = isExternalJobExpired(job.expiresAt, job.lastSeen)
  const isMechanic = ["自動車整備士", "バイク整備士"].includes(job.jobCategory || "")
  // 整備士の原文詳細には、登録社名と異なる店舗ブランド・勤務先別名が入るため、
  // 公開は構造化済みの概要に限定する。既存の他職種の詳細表示は変えない。
  const detail = isMechanic ? null : await getExternalJobDetail(job.source, job.sourceId)
  const catalogEligible = isExternalMetaCatalogJob(job)
  const hubSlug = hubSlugForExternalCategory(job.jobCategory)
  const applyHref = `/apply/${externalApplyId(job.source, job.sourceId)}`
  // パンくずのラベルはリンク先ハブの職種名を使う。外部側のカテゴリ名（例「配送・宅配ドライバー」）を
  // そのまま出すと、リンク先の /jobs/category/truck-driver＝「トラックドライバー」と表示がずれる。
  const hubCatName = hubSlug
    ? (await getJobCategories()).find((c) => c.slug === hubSlug)?.name
    : undefined
  const salary =
    job.salaryRaw ||
    (job.salaryMin || job.salaryMax
      ? `${job.salaryKind ?? ""} ${(job.salaryMin ?? job.salaryMax)?.toLocaleString()}円${
          job.salaryMax && job.salaryMin && job.salaryMax !== job.salaryMin
            ? `〜${job.salaryMax.toLocaleString()}円`
            : ""
        }`.trim()
      : undefined)

  return (
    <div className="min-h-screen bg-white">
      {catalogEligible && (
        <JobViewTracker
          id={job.sourceId}
          name={job.title}
          catalogEligible
        />
      )}
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <nav aria-label="パンくずリスト" className="mb-4 text-sm text-gray-500">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:underline">
                トップ
              </Link>
            </li>
            <li className="text-gray-400">/</li>
            {hubSlug && hubCatName && (
              <>
                <li>
                  <Link href={`/jobs/category/${hubSlug}`} className="hover:underline">
                    {hubCatName}
                  </Link>
                </li>
                <li className="text-gray-400">/</li>
              </>
            )}
            <li className="text-gray-700">求人詳細</li>
          </ol>
        </nav>

        <h1 className="text-2xl font-bold text-gray-900">{job.title ?? "求人"}</h1>
        {/* 掲載企業は伏せる。空欄にすると情報の欠落に見えるため、伏せていることを明示する。 */}
        <p className="mt-1 text-gray-600">掲載企業：非公開</p>

        <aside className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-gray-700">
          <p>出典：{job.sourceName || "ハローワークインターネットサービス"}の公開求人情報</p>
          <p>運営：株式会社PM Agent（RIDE JOB）</p>
          <p>RIDE JOBはハローワーク公式サイトではありません。内容は最新の求人票と異なる場合があります。</p>
        </aside>

        {/* 概要。勤務地は本体レコード由来＝市区町村まで（詳細ページの住所は番地まで載っており、
            検索すると掲載企業が特定できてしまうため取り込んでいない）。 */}
        <dl className="mt-6">
          <Row label="勤務地" value={job.address || job.prefecture} />
          <Row label="給与" value={salary} />
          <Row label="雇用形態" value={job.employmentType} />
          <Row label="就業時間" value={job.workHours} />
          <Row label="掲載期限" value={job.expiresAt} />
          {!detail && <Row label="仕事内容" value={job.description} />}
        </dl>

        {detail &&
          EXTERNAL_DETAIL_GROUPS.map(({ group, items }) => {
            const rows = items.filter(([col]) => detail[col])
            if (rows.length === 0) return null
            return (
              <section key={group} className="mt-8">
                <h2 className="border-l-4 border-primary pl-3 text-lg font-bold text-gray-900">
                  {group}
                </h2>
                <dl className="mt-3">
                  {rows.map(([col, label]) => (
                    <Row key={col} label={label} value={detail[col]} />
                  ))}
                </dl>
              </section>
            )
          })}

        <div className="mt-8">
          {expired ? (
            <div className="rounded-lg bg-gray-100 px-6 py-4 text-center font-bold text-gray-700">
              この求人は掲載期間を終了しました
            </div>
          ) : (
            <>
              <EntryCtaLink
                href={applyHref}
                className="flex min-h-[52px] w-full items-center justify-center rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {isMechanic ? "RIDE JOBに相談する" : "応募画面へ進む"}
              </EntryCtaLink>
              {isMechanic && (
                <p className="mt-2 text-center text-xs text-gray-500">
                  ハローワークへの直接応募ではなく、RIDE JOBへの転職相談です。
                </p>
              )}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
