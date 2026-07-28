/**
 * 店舗（勤務地）固有セクションの組み立て。
 *
 * 背景: 自社1,405件のうち937件が本文（descriptionWork）完全重複。多店舗企業が同一原稿を
 * 全店に使い回すため（レッドバロン304店・UDトラックス69店・ホワイトハウス44店 等）。
 * Google からはドアウェイ的な重複ページ群に見え、GSC で「クロール済み—未登録」が発生し、
 * Google しごと検索でも同一求人として dedupe されて1件しか出ない要因になる。
 *
 * ただし実データ上、重複937件すべてが「住所」を、96%が「アクセス」を固有値として持つ
 * （住所714通り・アクセス695通り）。この店舗固有の実データを本文とは別セクションとして
 * 描画すれば、入稿を改修しなくてもページ単位の独自性を出せる。
 *
 * 原則: 実データにあるものだけを出す。存在しない情報を文章で補わない（創作しない）。
 */
import type { JobDetail } from "@/features/jobs/types"
import { parseAddressPrefMuni } from "@/shared/lib/metadata"

export interface StoreLocationInfo {
  /** 見出しに使う勤務地ラベル（例: 岡山県倉敷市） */
  areaLabel: string
  /** 都道府県（ハブへのリンクに使う） */
  region?: string
  prefectureSlug?: string
  /** 市区町村名 */
  locality?: string
  /** 住所（番地・建物まで結合したもの） */
  fullAddress?: string
  access?: string
  /** 職種名（同地域の求人一覧リンク用） */
  categoryName?: string
  categorySlug?: string
}

/**
 * 求人から店舗固有セクションの材料を組み立てる。
 * 勤務地が全く分からない求人では null を返し、呼び出し側でセクションごと出さない。
 */
export const buildStoreLocation = (job: JobDetail): StoreLocationInfo | null => {
  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const region = job.prefecture?.region ?? parsed.region
  const locality = job.municipality?.name ?? parsed.locality
  if (!region && !locality) return null

  const fullAddress =
    [job.addressPrefMuni, job.addressLine, job.addressBuilding].filter(Boolean).join(" ") || undefined

  return {
    areaLabel: [region, locality].filter(Boolean).join(""),
    region,
    prefectureSlug: job.prefecture?.slug,
    locality,
    fullAddress,
    access: job.access,
    categoryName: job.jobCategory?.name,
    categorySlug: job.jobCategory?.slug,
  }
}
