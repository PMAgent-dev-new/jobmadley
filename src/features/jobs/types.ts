import type { JobCategory, Municipality, Prefecture, Tag } from "@/features/master/types"

/** 画像 */
export interface JobImage {
  url: string
  height?: number
  width?: number
}

/** 求人基本情報 */
export interface JobBase {
  id: string
  title: string
  jobName?: string
  companyName?: string
  prefecture?: Prefecture
  municipality?: Municipality
  imageUrl?: string
  images?: JobImage[]
  tags?: Tag[]
  jobCategory?: JobCategory
  salaryMin?: number
  salaryMax?: number
  wageType?: string[]
  employmentType?: string[]
  // --- 求人シンジケーション対応（CMSにフィールド追加後に有効化。未設定時は現挙動のまま） ---
  /** 掲載終了日。JobPosting.validThrough に使用（無ければ更新日+30日にフォールバック） */
  expiresAt?: string
  /** 実雇用主の公式サイトURL。hiringOrganization.url / sameAs に使用 */
  companyUrl?: string
  /** 実雇用主ロゴ。hiringOrganization.logo に使用（許諾範囲内で） */
  companyLogo?: JobImage
  /** 実雇用主名を非公開にする（人材紹介の掲載許諾が無い求人向け。true で name=非公開） */
  hideCompanyName?: boolean
  // microCMS メタデータ
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
  revisedAt?: string
}

/** 求人一覧表示用 */
export interface Job extends JobBase {
  // 一覧表示に必要な最低限の情報
}

/** 求人詳細情報 */
export interface JobDetail extends JobBase {
  catchCopy?: string
  addressZip?: string
  addressPrefMuni?: string
  addressLine?: string
  addressBuilding?: string
  workStyle?: string
  avgScheduledHours?: number
  socialInsurance?: string
  ssReason?: string
  salaryNote?: string
  descriptionAppeal?: string
  descriptionWork?: string
  descriptionPerson?: string
  descriptionBenefits?: string
  workHours?: string
  holidays?: string
  descriptionOther?: string
  access?: string
  dlNote?: string
  applyEmail?: string
}
