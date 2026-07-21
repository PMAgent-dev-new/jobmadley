import Link from "next/link"
import type { ExternalJob } from "@/features/external-jobs/types"

/**
 * ハローワーク転載求人のセクション（ハブ内で自社求人とは別枠・出典明記）。
 * コンプラ担保: ①出典明記 ③「運営：株式会社PM Agent」 ④公式誤認防止の注記
 * ⑧画像・地図は出さない（テキストのみ） ＋ 応募は自社フォームに流さず自社求人へクロスセル。
 */

function salaryText(j: ExternalJob): string | undefined {
  if (j.salaryRaw) return j.salaryRaw
  if (j.salaryMin || j.salaryMax) {
    const k = j.salaryKind ? `${j.salaryKind} ` : ""
    if (j.salaryMin && j.salaryMax && j.salaryMin !== j.salaryMax)
      return `${k}${j.salaryMin.toLocaleString()}〜${j.salaryMax.toLocaleString()}円`
    const v = j.salaryMin || j.salaryMax
    return v ? `${k}${v.toLocaleString()}円` : undefined
  }
  return undefined
}

function ExternalJobCard({ job }: { job: ExternalJob }) {
  const sal = salaryText(job)
  return (
    <Link
      href={`/external-job/${job.source}/${encodeURIComponent(job.sourceId)}`}
      className="group flex flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-primary"
    >
      <span className="mb-2 inline-flex w-fit items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        ハローワーク公開求人
      </span>
      <h3 className="line-clamp-2 font-semibold text-gray-900 group-hover:underline">
        {job.title || "求人"}
      </h3>
      {job.companyName && <p className="mt-1 text-sm text-gray-600">{job.companyName}</p>}
      <dl className="mt-3 space-y-1 text-sm text-gray-700">
        {(job.prefecture || job.address) && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-gray-400">勤務地</dt>
            <dd className="line-clamp-1">{job.address || job.prefecture}</dd>
          </div>
        )}
        {sal && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-gray-400">給与</dt>
            <dd className="line-clamp-1">{sal}</dd>
          </div>
        )}
        {job.employmentType && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-gray-400">雇用</dt>
            <dd className="line-clamp-1">{job.employmentType}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-gray-400">出典：{job.sourceName}</p>
    </Link>
  )
}

interface Props {
  jobs: ExternalJob[]
  count: number
  region: string
  catName: string
  /** 自社（RIDE JOB紹介）求人の一覧・相談へ誘導するリンク先 */
  selfJobsHref: string
}

export default function ExternalJobsSection({ jobs, count, region, catName, selfJobsHref }: Props) {
  if (jobs.length === 0) return null
  return (
    <section className="mt-12" aria-labelledby="hub-external">
      <h2
        id="hub-external"
        className="text-xl font-bold text-gray-900 border-l-4 border-gray-300 pl-3"
      >
        {region}の{catName}の公開求人（ハローワーク）
      </h2>
      {/* コンプラ: 出典・運営・公式誤認防止の注記 */}
      <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
        以下は<strong className="font-semibold text-gray-600">ハローワークインターネットサービス</strong>
        の公開求人を転載したものです。ハローワーク公式サイトではありません。内容は各ハローワークの
        求人票が最新です。RIDE JOB（運営：株式会社PM Agent）が紹介・仲介する求人ではありません。
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {jobs.map((j) => (
          <ExternalJobCard key={`${j.source}:${j.sourceId}`} job={j} />
        ))}
      </div>

      {count > jobs.length && (
        <p className="mt-4 text-sm text-gray-500">
          このほかにも{region}の{catName}の公開求人が{count.toLocaleString()}件あります。
        </p>
      )}

      {/* 応募導線の切り分け: 応募・相談は自社（RIDE JOB紹介）求人へ */}
      <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm text-gray-700">
          RIDE JOB のキャリアアドバイザーに<strong className="font-semibold">応募・相談</strong>
          できるのは、上部で紹介している RIDE JOB 掲載の求人です。
        </p>
        <Link
          href={selfJobsHref}
          className="mt-3 inline-flex items-center justify-center min-h-[44px] rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          RIDE JOB が紹介する{catName}求人を見る
        </Link>
      </div>
    </section>
  )
}
