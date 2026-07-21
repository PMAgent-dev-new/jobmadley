import { fetchDetailOrNull, fetchList, MASTER_REVALIDATE_SECONDS } from "@/shared/microcms/fetcher"
import type { Prefecture, PrefectureGroup } from "./types"

/** 都道府県一覧を取得 */
export const getPrefectures = async (): Promise<Prefecture[]> => {
  const data = await fetchList<Prefecture>({
    endpoint: "prefectures",
    queries: { limit: 100 },
    context: "getPrefectures",
    // マスタは短TTL。ここが古いとカテゴリ追加がハブに反映されない
    revalidate: MASTER_REVALIDATE_SECONDS,
  })
  return data.contents
}

/** 都道府県を地方別にグループ化 */
export const getPrefectureGroups = async (): Promise<PrefectureGroup> => {
  const prefectures = await getPrefectures()
  const groups: PrefectureGroup = {}
  prefectures.forEach((pref) => {
    const { area } = pref
    if (!groups[area]) groups[area] = []
    groups[area].push({ id: pref.id, region: pref.region, area: pref.area, slug: pref.slug })
  })
  return groups
}

/** 都道府県を ID で取得（存在しなければ null） */
export const getPrefectureById = async (prefectureId: string): Promise<Prefecture | null> =>
  fetchDetailOrNull<Prefecture>({
    endpoint: "prefectures",
    contentId: prefectureId,
    context: "getPrefectureById",
  })

/** 都道府県を slug で取得（存在しなければ null）。ハブページのURL解決に使用 */
export const getPrefectureBySlug = async (slug: string): Promise<Prefecture | null> => {
  const data = await fetchList<Prefecture>({
    endpoint: "prefectures",
    queries: { filters: `slug[equals]${slug}`, limit: 1 },
    context: "getPrefectureBySlug",
  })
  return data.contents[0] ?? null
}
