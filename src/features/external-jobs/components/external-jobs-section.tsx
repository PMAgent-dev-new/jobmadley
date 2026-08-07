"use client"

import Link from "next/link"
import { useState } from "react"
import type { ExternalJob } from "@/features/external-jobs/types"

/**
 * 提携媒体から取り込んだ求人のセクション（ハブ内）。
 * 表示方針（2026-07-21 三木さん決定）: 取得元の表記は出さず、カード・CTAとも他の求人と同じ扱いにする。
 * データ側の担保は維持: 求人票画像・企業画像・地図は保持しない（テキストのみ）／掲載終了・取消は非表示。
 *
 * 「もっと見る」で追加読み込みする（2026-08-06）。
 * 旧実装は先頭24件を出したあと、唯一の導線が「条件を絞り込んで探す」＝自社求人だけの /search だった。
 * ハブの掲載件数は自社＋転載の合計なので、例えば東京都×トラックは「248件」と表示しながら
 * その導線の先が 0 件という段差が生じていた。追加読み込みで全件に到達できるようにし、
 * /search への導線は自社求人が実在するときだけ出す。
 * ページネーションURL（?page=）は作らない: ハブは index 対象で、URLを増やす方針は取っていない。
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

const jobKey = (j: ExternalJob) => `${j.source}:${j.sourceId}`

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
      {/* 掲載企業は伏せる（2026-08-07決定）。api 側で companyName は返らないが、
          カードの体裁を他の求人と揃えるため同じ位置に一行置く。 */}
      <p className="mt-1 text-sm text-gray-500">掲載企業：非公開</p>
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
  /** さらに探すためのリンク先（自社求人の絞り込み検索） */
  selfJobsHref: string
  /** 自社求人の件数。0 のときは selfJobsHref の先が 0 件になるため導線を出さない。 */
  selfJobsCount: number
  /** 「もっと見る」用。/api/external-jobs にそのまま渡す。 */
  query: { cat: string; pref?: string; muni?: string }
}

export default function ExternalJobsSection({
  jobs,
  count,
  region,
  catName,
  selfJobsHref,
  selfJobsCount,
  query,
}: Props) {
  const [items, setItems] = useState<ExternalJob[]>(jobs)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  if (jobs.length === 0) return null

  const remaining = count - items.length

  const loadMore = async () => {
    setLoading(true)
    setFailed(false)
    try {
      const p = new URLSearchParams({ cat: query.cat, offset: String(items.length) })
      if (query.pref) p.set("pref", query.pref)
      if (query.muni) p.set("muni", query.muni)
      const res = await fetch(`/api/external-jobs?${p.toString()}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { jobs: ExternalJob[] }
      // 取り込みバッチが走って並びがずれても重複を出さないよう、キーで排除する。
      setItems((prev) => {
        const seen = new Set(prev.map(jobKey))
        return [...prev, ...data.jobs.filter((j) => !seen.has(jobKey(j)))]
      })
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mt-12" aria-labelledby="hub-external">
      <h2
        id="hub-external"
        className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3"
      >
        {region}の{catName}の求人をもっと見る
      </h2>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {items.map((j) => (
          <ExternalJobCard key={jobKey(j)} job={j} />
        ))}
      </div>

      {remaining > 0 && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "読み込み中…" : `もっと見る（残り${remaining}件）`}
          </button>
          {failed && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              求人を読み込めませんでした。時間をおいてもう一度お試しください。
            </p>
          )}
        </div>
      )}

      {selfJobsCount > 0 && (
        <div className="mt-6 text-center">
          <Link href={selfJobsHref} className="text-sm text-primary underline">
            条件を絞り込んで探す
          </Link>
        </div>
      )}
    </section>
  )
}
