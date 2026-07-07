/**
 * テスト応募の判定。動作確認用の投稿が実績（Base 登録・応募者メール/SMS・CAPI）を
 * 汚染しないよう、送信前にフラグ立てするためのユーティリティ。
 *
 * 判定は保守的（実応募を誤判定しない方を優先）に組み、疑わしきは「テスト扱いにしない」。
 * 追加のテスト用メール/電話は環境変数で明示指定できる:
 *   - TEST_APPLICATION_EMAILS   カンマ区切り（完全一致, 小文字比較）
 *   - TEST_APPLICATION_PHONES   カンマ区切り（数字のみ比較）
 */

export type TestDetection = {
  isTest: boolean
  /** 判定理由（ログ/通知表示用） */
  reason?: string
}

type ApplicantLike = {
  lastName?: string
  firstName?: string
  lastNameKana?: string
  firstNameKana?: string
  email?: string
  phone?: string
}

/** 明らかにテスト用途のメールドメイン（RFC 2606 の予約ドメイン等）。 */
const TEST_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "mailinator.com",
])

/** 氏名に含まれていればテスト判定する語（全角/半角・大小無視）。 */
const TEST_NAME_TOKENS = ["テスト", "てすと", "test", "ダミー", "だみー", "dummy", "サンプル", "sample"]

const parseEnvList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

const digitsOnly = (value: string | undefined): string => (value ?? "").replace(/[^0-9]/g, "")

const normalize = (value: string | undefined): string => (value ?? "").trim().toLowerCase()

/** メールがテスト用途か。 */
const isTestEmail = (email: string | undefined): boolean => {
  const e = normalize(email)
  if (!e) return false
  if (parseEnvList(process.env.TEST_APPLICATION_EMAILS).map(normalize).includes(e)) return true
  const [local, domain] = e.split("@")
  if (domain && TEST_EMAIL_DOMAINS.has(domain)) return true
  // ローカル部が test / テスト系（test, test+xxx, test.xxx, testuser など）
  if (local && /^(test|dummy|sample)([.+_-].*)?$/.test(local)) return true
  return false
}

/** 氏名（漢字/かな）にテスト語が含まれるか。 */
const isTestName = (a: ApplicantLike): boolean => {
  const joined = normalize(
    [a.lastName, a.firstName, a.lastNameKana, a.firstNameKana].filter(Boolean).join(" "),
  )
  if (!joined) return false
  return TEST_NAME_TOKENS.some((token) => joined.includes(token.toLowerCase()))
}

/** 電話番号が環境変数指定のテスト番号、または明らかなダミー（全桁同一/連番）か。 */
const isTestPhone = (phone: string | undefined): boolean => {
  const d = digitsOnly(phone)
  if (!d) return false
  if (parseEnvList(process.env.TEST_APPLICATION_PHONES).map(digitsOnly).includes(d)) return true
  const body = d.replace(/^0/, "")
  // 全桁同一（例: 09000000000）や 1234567890 のような連番はダミーとみなす
  if (/^(\d)\1{8,}$/.test(d)) return true
  if (body.length >= 9 && ("1234567890".includes(body) || "0123456789".includes(body))) return true
  return false
}

/** 応募がテスト用途かを判定する。 */
export const detectTestApplication = (a: ApplicantLike): TestDetection => {
  const reasons: string[] = []
  if (isTestName(a)) reasons.push("氏名")
  if (isTestEmail(a.email)) reasons.push("メール")
  if (isTestPhone(a.phone)) reasons.push("電話番号")
  if (reasons.length === 0) return { isTest: false }
  return { isTest: true, reason: reasons.join("・") }
}
