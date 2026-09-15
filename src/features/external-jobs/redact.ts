/** 法人格と空白を除いた社名の中核。短すぎる語は誤爆防止のため使わない。 */
export const companyCore = (name?: string): string => {
  const value = (name ?? "")
    .replace(/(株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|（株）|\(有\)|（有）)/g, "")
    .replace(/[\s　]/g, "")
  return value.length >= 2 ? value : ""
}

const CORP_WORD = /(株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|（株）|\(有\)|（有）)/
const WITHHELD_COMPANY = /事業所.{0,12}(?:意向|希望).{0,12}(?:公開していません|非公開)|事業所名.{0,8}非公開/
const PREFECTURE_NAMES = new Set([
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
  "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
])

/** 括弧内のブランド名・地域名を落とした社名中核。 */
export const companyCoreWithoutBrackets = (name?: string): string => {
  const value = (name ?? "")
    .replace(/[「『（(\[][^」』）)\]]{1,20}[」』）)\]]/g, "")
    .replace(/(株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|（株）|\(有\)|（有）)/g, "")
    .replace(/[\s　]/g, "")
  return value.length >= 3 ? value : ""
}

/** 登録社名の括弧内にだけ記録された店舗ブランド等。地域注記は別名として扱わない。 */
export const companyAliases = (name?: string): string[] => {
  const aliases = [...(name ?? "").matchAll(/[「『（(\[]([^」』）)\]]{3,30})[」』）)\]]/g)]
    .map((match) => match[1]
      .replace(CORP_WORD, "")
      .replace(/[\s　]/g, "")
      .trim())
    .filter((value) => value.length >= 3)
    .filter((value) => !PREFECTURE_NAMES.has(value))
    .filter((value) => !/^(?:本社|支店|営業所|事業所|工場)$/.test(value))
  return [...new Set(aliases)]
}

export const isWithheldCompanyName = (name?: string): boolean =>
  WITHHELD_COMPANY.test((name ?? "").trim())

export const withheldExternalJobTitle = (category?: string): string =>
  category?.trim() || "求人"

export const withheldExternalJobDescription = ({
  category,
  prefecture,
  municipality,
  employmentType,
}: {
  category?: string
  prefecture?: string
  municipality?: string
  employmentType?: string
}): string => {
  const location = `${prefecture ?? ""}${municipality ?? ""}` || "勤務地記載地域"
  const role = withheldExternalJobTitle(category)
  const employment = employmentType ? `雇用形態は${employmentType}です。` : ""
  return `ハローワークインターネットサービスに掲載された${location}の${role}求人です。`
    + `${employment}掲載企業名と企業を特定できる仕事内容は公開していません。`
    + "詳しい業務内容や応募条件は、RIDE JOBへの転職相談で確認できます。"
}

const CORP_NAME = "[^\\s　（）()／/、。・\\[\\]【】「」『』：:！!？?※★☆◆◇■□●○◎▲△▼▽〜～＊*＜＞<>；;，,＆&〒]{2,12}"
const CORP_SUFFIXED = new RegExp(CORP_NAME + CORP_WORD.source, "g")
const CORP_PREFIXED = new RegExp(CORP_WORD.source + CORP_NAME, "g")

const cleanupOrphanCorpWord = (text: string): string =>
  text
    .replace(new RegExp("非公開[\\s　]*" + CORP_WORD.source, "g"), "非公開")
    .replace(new RegExp(CORP_WORD.source + "[\\s　]*非公開", "g"), "非公開")

/**
 * 外部求人の公開テキストから登録社名を伏せる。
 * corpFallback は区切りのある短いタイトル専用。本文では前後の文脈を巻き込むため使わない。
 */
export const redactExternalJobText = (
  text: string | undefined,
  name?: string,
  { corpFallback = false }: { corpFallback?: boolean } = {},
): string | undefined => {
  if (!text) return text
  let out = text
  const full = (name ?? "").trim()
  for (const value of [full, companyCore(name), companyCoreWithoutBrackets(name), ...companyAliases(name)]
    .filter((x) => x.length >= 2)) {
    const pattern = value.split("").map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s　]*")
    out = out.replace(new RegExp(pattern, "g"), "非公開")
  }
  out = cleanupOrphanCorpWord(out)
  if (corpFallback) {
    out = out.replace(CORP_SUFFIXED, "非公開").replace(CORP_PREFIXED, "非公開")
    out = cleanupOrphanCorpWord(out)
  }
  return out.replace(/(非公開[\s　]*){2,}/g, "非公開")
}
