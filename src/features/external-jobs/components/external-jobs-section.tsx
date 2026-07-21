import Link from "next/link"
import type { ExternalJob } from "@/features/external-jobs/types"

/**
 * 提携媒体から取り込んだ求人のセクション（ハブ内）。
 * 表示方針（2026-07-21 三木さん決定）: 取得元の表記は出さず、カード・CTAとも他の求人と同じ扱いにする。
 * データ側の担保は維持: 求人票画像・企業画像・地図は保持しない（テキストのみ）／掲載終了・取消は非表示。
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
    </Link>
  )
}

interface Props {
  jobs: ExternalJob[]
  count: number
  region: string
  catName: string
  /** さらに探すためのリンク先（絞り込み検索） */
  selfJobsHref: string
}

export default function ExternalJobsSection({ jobs, count, region, catName, selfJobsHref }: Props) {
  if (jobs.length === 0) return null
  return (
    <section className="mt-12" aria-labelledby="hub-external">
      <h2
        id="hub-external"
        className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3"
      >
        {region}の{catName}の求人をもっと見る
      </h2>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {jobs.map((j) => (
          <ExternalJobCard key={`${j.source}:${j.sourceId}`} job={j} />
        ))}
      </div>

      {count > jobs.length && (
        <div className="mt-8 text-center">
          <Link
            href={selfJobsHref}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            条件を絞り込んで探す
          </Link>
        </div>
      )}
    </section>
  )
}
