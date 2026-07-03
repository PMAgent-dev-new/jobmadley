/**
 * 地域×職種ハブページ共通ロジック（URL・しきい値・リード文・共有データ）。
 */
import { unstable_cache } from "next/cache"
import { getPrefectures } from "@/features/master/prefectures"
import { getJobCategories } from "@/features/master/job-categories"
import { getJobCountMatrix, type JobCountMatrix } from "@/features/jobs/api"
import type { Prefecture, JobCategory } from "@/features/master/types"

/** 県×職種ハブを生成する最小求人数（これ未満の組合せは薄いページになるため作らない） */
export const HUB_MIN_JOBS = 5

/** 1ハブに表示する求人カードの上限（超過分は絞り込み検索へ誘導） */
export const HUB_LIST_LIMIT = 60

/** ハブURL生成（ルート相対） */
export const hubUrl = {
  prefecture: (prefSlug: string) => `/jobs/${prefSlug}`,
  prefectureCategory: (prefSlug: string, catSlug: string) => `/jobs/${prefSlug}/${catSlug}`,
  category: (catSlug: string) => `/jobs/category/${catSlug}`,
}

/** 全件を見るための絞り込み検索URL（/search はUI用・noindex） */
export const searchUrl = (params: { prefectureId?: string; jobCategoryId?: string }) => {
  const q = new URLSearchParams()
  if (params.prefectureId) q.set('prefecture', params.prefectureId)
  if (params.jobCategoryId) q.set('jobCategory', params.jobCategoryId)
  const s = q.toString()
  return s ? `/search?${s}` : '/search'
}

/** リード文（テンプレ＋地域/職種/件数で可変。将来CMSの説明文に差し替え可能） */
export const hubLead = {
  prefectureCategory: (region: string, catName: string, count: number) =>
    `${region}の${catName}求人を${count}件掲載しています。未経験歓迎・寮完備・高収入など、${region}で働く${catName}の最新求人情報をまとめました。気になる求人はそのまま応募・相談できます。`,
  prefecture: (region: string, count: number) =>
    `${region}のタクシードライバー・自動車整備士・ドライバー職などの求人を${count}件掲載しています。職種から絞り込んで、${region}で働ける最新の求人情報を探せます。`,
  category: (catName: string, count: number) =>
    `${catName}の求人を全国で${count}件掲載しています。地域から絞り込んで、未経験歓迎や高収入などの条件に合う${catName}の求人を探せます。`,
}

export const hubTitle = {
  prefectureCategory: (region: string, catName: string) => `${region}の${catName}求人・転職`,
  prefecture: (region: string) => `${region}のドライバー・整備士求人・転職`,
  category: (catName: string) => `${catName}の求人・転職（全国）`,
}

/**
 * マスタ（都道府県・職種）と件数マトリクスを1時間キャッシュでまとめて取得する。
 * generateStaticParams・generateMetadata・各ページ描画で共有し、CMSコールを最小化する。
 */
export const getHubData = unstable_cache(
  async (): Promise<{
    prefectures: Prefecture[]
    categories: JobCategory[]
    matrix: JobCountMatrix
  }> => {
    const [prefectures, categories, matrix] = await Promise.all([
      getPrefectures(),
      getJobCategories(),
      getJobCountMatrix(),
    ])
    return { prefectures, categories, matrix }
  },
  ["hub-master-data"],
  { revalidate: 3600 },
)

/** 県×職種の件数 */
export const prefCatCount = (m: JobCountMatrix, prefId: string, catId: string): number =>
  m.byPrefectureCategory[`${prefId}:${catId}`] ?? 0

/** slug を持ち、かつ件数条件を満たすものだけを対象にする小ヘルパー */
export const withSlug = <T extends { slug?: string }>(items: T[]): (T & { slug: string })[] =>
  items.filter((i): i is T & { slug: string } => Boolean(i.slug))
