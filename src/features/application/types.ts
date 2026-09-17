/** 応募フォームデータ */
export interface ApplicationFormData {
  lastName: string
  firstName: string
  lastNameKana: string
  firstNameKana: string
  birthDate: string
  phone: string
  email: string
  companyName: string
  jobName: string
  jobCategoryName?: string
  jobUrl: string
  applicationSource: string
  utmSource?: string
  utmMedium?: string
  utmSourceFirst?: string
  utmMediumFirst?: string
  utmCampaign?: string
  utmContent?: string
  utmLastTouchAt?: string
  utmFirstTouchAt?: string
  fbclid?: string
  gclid?: string
  catalogJobId?: string
  catalogClickedAt?: string
  catalogLandingPath?: string
  catalogSource?: string
  catalogMedium?: string
  catalogEvidence?: "utm" | "fbclid"
  submissionId?: string
  /** 外部転載求人は求人企業への直接応募ではなく、RIDE JOBへの転職相談。 */
  applicationIntent?: "apply" | "consult"
}
