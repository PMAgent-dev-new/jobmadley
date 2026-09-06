/**
 * ハブに出す関連記事の地域判定。
 *
 * ⚠️ microCMS クライアントを読み込まない葉モジュールにしておくこと。
 * api.ts に置くと、テストが Supabase / microCMS の環境変数を要求して落ちる。
 */

/**
 * 都道府県名（「県/府/都/道」を落とした短い形も含む）。記事タイトルの地域判定に使う。
 * ⚠️ 「東京」は「東京都」の部分文字列なので、判定は長い方から行うこと。
 */
const PREFECTURE_WORDS: ReadonlyArray<readonly [full: string, short: string]> = [
  ["北海道", "北海道"], ["青森県", "青森"], ["岩手県", "岩手"], ["宮城県", "宮城"],
  ["秋田県", "秋田"], ["山形県", "山形"], ["福島県", "福島"], ["茨城県", "茨城"],
  ["栃木県", "栃木"], ["群馬県", "群馬"], ["埼玉県", "埼玉"], ["千葉県", "千葉"],
  ["東京都", "東京"], ["神奈川県", "神奈川"], ["新潟県", "新潟"], ["富山県", "富山"],
  ["石川県", "石川"], ["福井県", "福井"], ["山梨県", "山梨"], ["長野県", "長野"],
  ["岐阜県", "岐阜"], ["静岡県", "静岡"], ["愛知県", "愛知"], ["三重県", "三重"],
  ["滋賀県", "滋賀"], ["京都府", "京都"], ["大阪府", "大阪"], ["兵庫県", "兵庫"],
  ["奈良県", "奈良"], ["和歌山県", "和歌山"], ["鳥取県", "鳥取"], ["島根県", "島根"],
  ["岡山県", "岡山"], ["広島県", "広島"], ["山口県", "山口"], ["徳島県", "徳島"],
  ["香川県", "香川"], ["愛媛県", "愛媛"], ["高知県", "高知"], ["福岡県", "福岡"],
  ["佐賀県", "佐賀"], ["長崎県", "長崎"], ["熊本県", "熊本"], ["大分県", "大分"],
  ["宮崎県", "宮崎"], ["鹿児島県", "鹿児島"], ["沖縄県", "沖縄"],
] as const

/** タイトルが言及している都道府県（正式名）。無ければ undefined。 */
export const prefectureInTitle = (title: string): string | undefined => {
  // 長い名前から先に見る（「東京」が「東京都」より先にヒットしないように）
  for (const [full] of PREFECTURE_WORDS) if (title.includes(full)) return full
  for (const [full, short] of PREFECTURE_WORDS) if (title.includes(short)) return full
  return undefined
}

/**
 * ハブに出す関連記事を、そのページの地域に合わせて並べ替える。
 *
 * ⚠️ 他県の記事を出さないこと。実際に /jobs/tokyo の見出し
 * 「東京都の仕事を知る・役立つ記事」の直下に
 * 「大阪府の送迎ドライバー求人データ」が並んでいた（2026-09-06 本番実測）。
 * 記事は公開日順で引いているだけなので、地域を見ないと他県の記事が普通に混ざる。
 *
 * @param region ページの対象都道府県（正式名）。全国ハブでは undefined を渡すこと。
 *               undefined のときは**県名を含む記事をすべて落とす**
 *               （「送迎ドライバー（全国）」の先頭が大阪の記事、という状態を防ぐ）。
 */
export const orderArticlesForRegion = <T extends { title: string }>(
  articles: T[],
  region?: string,
): T[] => {
  const kept = articles.filter((a) => {
    const inTitle = prefectureInTitle(a.title)
    if (!inTitle) return true // 地域に触れていない記事はどこでも出してよい
    return inTitle === region
  })
  // 自県の記事を先頭へ（現状は公開日順でたまたま入っているだけなので明示的に並べる）
  return kept.sort((a, b) => {
    const av = region && prefectureInTitle(a.title) === region ? 0 : 1
    const bv = region && prefectureInTitle(b.title) === region ? 0 : 1
    return av - bv
  })
}
