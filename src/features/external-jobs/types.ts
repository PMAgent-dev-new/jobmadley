/**
 * 外部媒体（ハローワーク）の転載求人。自社 Job（microCMS）とは別系統。
 * 出典を明記し、画像・地図は持たない（コンプラ: 求人票画像・企業画像・地図は転載しない）。
 */
export interface ExternalJob {
  source: string
  sourceId: string
  /** 出典表示名（例: ハローワークインターネットサービス）。必ず画面に表示する。 */
  sourceName: string
  sourceUrl?: string
  hwOffice?: string
  title?: string
  companyName?: string
  prefecture?: string
  address?: string
  jobCategory?: string
  employmentType?: string
  salaryKind?: string
  salaryMin?: number
  salaryMax?: number
  salaryRaw?: string
  workHours?: string
  description?: string
  receivedAt?: string
  expiresAt?: string
  lastSeen?: string
}
