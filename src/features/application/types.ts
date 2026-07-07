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
  jobUrl: string
  applicationSource: string
  utmSource?: string
  utmMedium?: string
  utmSourceFirst?: string
  utmMediumFirst?: string
  utmCampaign?: string
  utmLastTouchAt?: string
  utmFirstTouchAt?: string
  fbclid?: string
  gclid?: string
}
