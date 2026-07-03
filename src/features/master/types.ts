/** 都道府県 */
export interface Prefecture {
  id: string
  region: string
  area: string
  /** URL用スラッグ（例: tokyo）。ハブページのパスに使用 */
  slug?: string
}

/** 市区町村 */
export interface Municipality {
  id: string
  name: string
  prefecture: Prefecture
}

/** タグ */
export interface Tag {
  id: string
  name: string
}

/** 職種カテゴリ */
export interface JobCategory {
  id: string
  name: string
  category?: string
  /** URL用スラッグ（例: taxi-driver）。ハブページのパスに使用 */
  slug?: string
}

/** 都道府県グループ (area 別 Prefecture[]) */
export interface PrefectureGroup {
  [area: string]: Prefecture[]
}
