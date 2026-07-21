import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import {
  getExternalJob,
  hubSlugForExternalCategory,
  externalApplyId,
} from "@/features/external-jobs/api"
import { getJobCategories } from "@/features/master/job-categories"

/**
 * 提携媒体から取り込んだ求人の詳細ページ。
 * - robots: noindex（薄い/重複コンテンツ回避。follow で内部リンクは辿らせる）
 * - JobPosting 構造化データは付けない（重複 JobPosting 回避）
 * - 求人票画像・企業画像・地図は出さない（テキストのみ）
 * - 表示方針（2026-07-21 三木さん決定）: 取得元の表記は出さず、CTAは他の求人と同じ応募導線
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
  return {
    title: `${job.title ?? "求人"}｜${job.companyName ?? ""}`,
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
        {job.companyName && <p className="mt-1 text-gray-600">{job.companyName}</p>}

        <dl className="mt-6">
          <Row label="勤務地" value={job.address || job.prefecture} />
          <Row label="給与" value={salary} />
          <Row label="雇用形態" value={job.employmentType} />
          <Row label="就業時間" value={job.workHours} />
          <Row label="仕事内容" value={job.description} />
        </dl>

        {/* 応募導線は他の求人と同じ */}
        <div className="mt-8">
          <Link
            href={applyHref}
            className="flex min-h-[52px] w-full items-center justify-center rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            応募画面へ進む
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
