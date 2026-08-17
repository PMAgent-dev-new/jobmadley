/**
 * 県×職種ハブが「成立しているか」と「リンクに出す件数」の唯一の定義。
 *
 * この判定は sitemap・県ハブのリンク・職種ハブのリンクの3か所で必要になる。
 * 以前はそれぞれが手書きで複製していて、sitemap だけが転載求人を見ていたため
 * **転載だけで成立するハブが sitemap に載るのに親からリンクされない**状態になっていた
 * （本番実測で268本中203本が孤立）。同型の食い違いを繰り返さないよう1箇所に寄せる。
 *
 * ⚠️ このファイルは依存を持たない葉モジュールにしておくこと。
 * hub.ts から import すると microCMS クライアントを引き込み、ユニットテストが
 * 環境変数を要求して落ちる（salary.ts を切り出したのと同じ理由）。
 * しきい値とキーの組み立てもここが出所で、hub.ts / external-jobs/api.ts は
 * ここから再エクスポートする。
 */

/** 県×職種ハブを新規に生成する自社求人の下限。 */
export const HUB_MIN_JOBS = 5

/** 自社求人が下限に満たなくても、転載求人がこの件数あればハブとして成立させる。 */
export const HUB_MIN_EXTERNAL_JOBS = 20

/** 自社求人の件数マトリクスのキー。 */
export const prefCatKey = (prefId: string, catId: string): string => `${prefId}:${catId}`

/** 転載求人の件数マトリクスのキー。prefecture は prefectures.region（例「東京都」）。 */
export const externalHubKey = (prefectureRegion: string, hubCatSlug: string): string =>
  `${prefectureRegion}|${hubCatSlug}`

export type CountMap = Record<string, number>
export interface HubPref {
  id: string
  region: string
}
export interface HubCat {
  id: string
  slug: string
}

const own = (selfCounts: CountMap, pref: HubPref, cat: HubCat) =>
  selfCounts[prefCatKey(pref.id, cat.id)] ?? 0
const ext = (externalCounts: CountMap, pref: HubPref, cat: HubCat) =>
  externalCounts[externalHubKey(pref.region, cat.slug)] ?? 0

/** sitemap への収録と、親ハブからのリンクの両方がこれを使う。 */
export const hubQualifies = (
  selfCounts: CountMap,
  externalCounts: CountMap,
  pref: HubPref,
  cat: HubCat,
): boolean =>
  own(selfCounts, pref, cat) >= HUB_MIN_JOBS || ext(externalCounts, pref, cat) >= HUB_MIN_EXTERNAL_JOBS

/**
 * ハブへのリンクに出す件数。**遷移先ページの掲載件数（自社＋転載）と必ず一致させる。**
 * 自社件数だけを出すと「265件」と書いたリンクの先に2,157件が並ぶ逆向きの食い違いになる。
 */
export const hubLinkCount = (
  selfCounts: CountMap,
  externalCounts: CountMap,
  pref: HubPref,
  cat: HubCat,
): number => own(selfCounts, pref, cat) + ext(externalCounts, pref, cat)
