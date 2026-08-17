/**
 * 求人の companyName から「どの法人ページに属するか」を決めるロジック（副作用なし・テスト対象）。
 *
 * 以前は microCMS の `companyName[contains]` を OR 連結していたが、日本語の法人名に対して
 * contains は安全ではない。実データ1,370件では270組の衝突があり、
 * 「日本交通株式会社」で東京・日本交通株式会社（別法人・大阪）まで、
 * 「株式会社ホワイトハウス」で株式会社ホワイトハウスオートモービル（別法人）まで吸い込んでいた。
 *
 * 代わりに「前方一致＋境界チェック＋最長一致」で判定する。これで衝突は270→50に落ち、
 * 残る50は全て「短い方が長い方の真の接頭辞」なので最長一致で機械的に解ける。
 */

const CORP_SUFFIXES = ["株式会社", "有限会社", "合同会社", "合資会社"] as const

/**
 * 表記ゆれを吸収して比較用の形に揃える。
 *
 * - NFKC で全角英数（ＵＤトラックス→UDトラックス）と全角スペースを正規化する
 * - 連続する空白を1つに畳む
 * - 「東京・日本交通 株式会社」のように法人格の直前だけ空いている表記を詰める。
 *   後株（社名＋法人格）の形だけを対象にするため、後ろに空白か終端が続く場合に限る。
 *   これを無条件にやると「◯◯グループ 株式会社ホワイトハウス」の前株まで連結してしまう。
 */
export const canonicalizeCompanyName = (raw: string | undefined): string => {
  if (!raw) return ""
  const suffixes = CORP_SUFFIXES.join("|")
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(new RegExp(`\\s+(${suffixes})(?=\\s|$)`, "g"), "$1")
}

/** 「newmoグループ 株式会社未来都 …」の先頭グループ名を1つだけ落とす。長い接頭辞から試す。 */
export const stripGroupPrefix = (canonicalName: string, groupPrefixes: string[]): string => {
  for (const prefix of groupPrefixes) {
    if (!canonicalName.startsWith(prefix)) continue
    const rest = canonicalName.slice(prefix.length).trimStart()
    // 「日本交通グループ」だけの求人を空文字にしてしまわない
    if (rest) return rest
  }
  return canonicalName
}

/**
 * alias が name の「法人名部分」と前方一致するか。
 *
 * 境界の条件は2つだけ:
 * 1. alias の直後が空白か終端 … 「オートアールズ」+「 前橋モール店」
 * 2. alias 自体が法人格で閉じている … 「エミタスタクシー株式会社」+「稲毛営業所」（空白なしの表記が実在する）
 *
 * 逆に言うと、法人格で閉じていない alias が空白なしで続く文字列に一致することは無い。
 * これが「株式会社ホワイトハウス」が「株式会社ホワイトハウスオートモービル」を吸わない理由。
 */
export const aliasMatches = (canonicalName: string, alias: string): boolean => {
  if (!canonicalName.startsWith(alias)) return false
  const rest = canonicalName.slice(alias.length)
  if (rest === "") return true
  if (/^\s/.test(rest)) return true
  return CORP_SUFFIXES.some((suffix) => alias.endsWith(suffix))
}

/** slug ごとの別名を1本の配列に潰したもの。長い alias から評価するため事前にソートしておく。 */
export interface CompanyAliasEntry {
  alias: string
  slug: string
}

export const buildAliasIndex = (
  companies: Array<{ slug: string; aliases: string[] }>,
): CompanyAliasEntry[] =>
  companies
    .flatMap((company) =>
      company.aliases.map((alias) => ({ alias: canonicalizeCompanyName(alias), slug: company.slug })),
    )
    .sort((a, b) => b.alias.length - a.alias.length)

/**
 * companyName を法人ページの slug に解決する。該当が無ければ null（＝どの企業ページにも載せない）。
 *
 * グループ接頭辞は「素の名前で解決できなかったときだけ」剥がす。先に無条件で剥がすと、
 * 将来グループ名そのものを alias に持たせたくなったときに素通りしてしまうため。
 */
export const resolveCompanySlug = (
  companyName: string | undefined,
  aliasIndex: CompanyAliasEntry[],
  groupPrefixes: string[],
): string | null => {
  const canonical = canonicalizeCompanyName(companyName)
  if (!canonical) return null

  // aliasIndex は長い順なので、最初に一致したものが最長一致になる
  const direct = aliasIndex.find((entry) => aliasMatches(canonical, entry.alias))
  if (direct) return direct.slug

  const stripped = stripGroupPrefix(canonical, groupPrefixes)
  if (stripped === canonical) return null

  const viaGroup = aliasIndex.find((entry) => aliasMatches(stripped, entry.alias))
  return viaGroup?.slug ?? null
}
