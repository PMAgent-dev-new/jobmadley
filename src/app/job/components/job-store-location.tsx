import Link from "next/link"
import type { StoreLocationInfo } from "@/features/jobs/lib/store-location"

interface Props {
  info: StoreLocationInfo | null
}

/**
 * 勤務地（店舗）固有セクション。多店舗企業が同一本文を全店で使い回すことによる
 * ページ重複を、店舗ごとに必ず異なる実データ（住所・アクセス・地域ハブ導線）で解消する。
 *
 * ⚠️ 実データにある値だけを出す。無い項目は行ごと出さない（창作しない）。
 * ⚠️ 地図は出さない（転載求人と同じ扱い。画像・地図を持たない方針）。
 */
export default function JobStoreLocation({ info }: Props) {
  if (!info) return null
  const { areaLabel, region, prefectureSlug, fullAddress, access, categoryName, categorySlug } = info

  // 地域ハブへの導線（同じ勤務地の他求人へ回遊させ、店舗ページを孤立させない）
  const links: Array<{ label: string; href: string }> = []
  if (prefectureSlug && categorySlug && region && categoryName) {
    links.push({ label: `${region}の${categoryName}求人`, href: `/jobs/${prefectureSlug}/${categorySlug}` })
  }
  if (prefectureSlug && region) {
    links.push({ label: `${region}の求人をすべて見る`, href: `/jobs/${prefectureSlug}` })
  }
  if (categorySlug && categoryName) {
    links.push({ label: `${categoryName}の求人（全国）`, href: `/jobs/category/${categorySlug}` })
  }

  return (
    <section className="mt-12 border rounded-lg p-6" aria-labelledby="job-store-location">
      <h2 id="job-store-location" className="text-xl font-semibold text-gray-800">
        {areaLabel}での勤務について
      </h2>
      <dl className="mt-4 space-y-3 text-gray-700">
        {fullAddress && (
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="w-full shrink-0 text-sm text-gray-500 sm:w-28">勤務地</dt>
            <dd className="break-words">{fullAddress}</dd>
          </div>
        )}
        {access && (
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="w-full shrink-0 text-sm text-gray-500 sm:w-28">アクセス</dt>
            <dd className="whitespace-pre-wrap break-words">{access}</dd>
          </div>
        )}
      </dl>

      {links.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-500">この地域・職種の求人をまとめて見る</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-[40px] items-center rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-primary hover:text-primary"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
