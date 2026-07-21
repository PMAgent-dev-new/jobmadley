import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import { getExternalJob, hubSlugForExternalCategory } from "@/features/external-jobs/api"
import { getJobCategories } from "@/features/master/job-categories"

/**
 * ハローワーク転載求人の詳細ページ（Tier2）。
 * - robots: noindex（薄い/重複コンテンツ回避。follow でハブ等への内部リンクは辿らせる）
 * - JobPosting 構造化データは付けない（重複 JobPosting は Google しごと検索で禁止。原本は既に掲載済）
 * - 求人票画像・企業画像・地図は出さない（テキストのみ）
 * - 応募は自社フォームに流さず、RIDE JOB 紹介求人へクロスセル
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
    title: `${job.title ?? "求人"}｜${job.companyName ?? ""}（ハローワーク公開求人）`,
    description: `${job.prefecture ?? ""}の${job.title ?? "求人"}。出典：ハローワークインターネットサービス（転載）。`,
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
  const selfHref = hubSlug ? `/jobs/category/${hubSlug}` : "/search"
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
            <li className="text-gray-700">公開求人</li>
          </ol>
        </nav>

        <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          ハローワーク公開求人
        </span>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{job.title ?? "求人"}</h1>
        {job.companyName && <p className="mt-1 text-gray-600">{job.companyName}</p>}

        {/* コンプラ: 出典・公式誤認防止・運営者 */}
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
          出典：<strong className="font-semibold text-gray-600">ハローワークインターネットサービス</strong>。
          本ページは公開求人を転載したもので、ハローワーク公式サイトではありません。最新の募集状況・詳細条件は
          ハローワークの求人票をご確認ください。RIDE JOB（運営：株式会社PM Agent）が紹介・仲介する求人ではありません。
        </p>

        <dl className="mt-6">
          <Row label="勤務地" value={job.address || job.prefecture} />
          <Row label="給与" value={salary} />
          <Row label="雇用形態" value={job.employmentType} />
          <Row label="就業時間" value={job.workHours} />
          <Row label="仕事内容" value={job.description} />
          <Row label="受付日" value={job.receivedAt} />
          <Row label="有効期限" value={job.expiresAt} />
          <Row label="所轄ハローワーク" value={job.hwOffice} />
          <Row label="求人番号" value={job.sourceId} />
        </dl>

        {/* 応募導線の切り分け: 自社（RIDE JOB紹介）求人へ */}
        <div className="mt-8 rounded-lg border border-primary/30 bg-primary/5 p-5">
          <p className="text-sm text-gray-700">
            この求人はハローワークの公開情報です。RIDE JOB のキャリアアドバイザーに応募・相談できる求人を
            お探しの場合は、こちらから探せます。
          </p>
          <Link
            href={selfHref}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            RIDE JOB が紹介する求人を見る
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
