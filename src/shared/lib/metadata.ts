import type { Metadata } from 'next'
import type { JobDetail, Job } from '@/features/jobs/types'

// =====================
// メタデータ設定
// =====================

// ブランド名（titleテンプレートのサフィックス）。旧値は説明文入り全角38字で、
// 求人詳細のtitleが60〜80字になりSERPで切断・書き換えが発生していた（基準28〜32字）。
export const SITE_NAME = 'ライドジョブ'
// トップページ専用のフルタイトル（主要KWを含む説明付き）
export const TOP_TITLE = 'ライドジョブ | タクシードライバー・自動車整備士・デリバリーの求人・転職サイト'
export const SITE_DESCRIPTION = 'タクシードライバー、自動車整備士、フードデリバリー営業など、暮らしと街を支える仕事の求人情報サイト。あなたにぴったりの転職先を見つけよう。'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ridejob.jp'
export const OPERATOR_NAME = '株式会社PM Agent'
const OGP_IMAGE = '/images/OGP.png'
const LOGO_IMAGE = '/images/logo-ridejob.png'

/**
 * 基本のメタデータ
 */
export const baseMetadata: Metadata = {
  title: {
    template: `%s | ${SITE_NAME}`,
    default: TOP_TITLE,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'タクシー運転手',
    'タクシードライバー',
    '自動車整備士',
    '整備士',
    'フードデリバリー',
    'デリバリー',
    'ドライバー求人',
    '転職',
    '求人',
    'RIDE JOB',
    'ライドジョブ',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: OPERATOR_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: TOP_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: OGP_IMAGE,
        width: 1200,
        height: 630,
        alt: TOP_TITLE,
      },
    ],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TOP_TITLE,
    description: SITE_DESCRIPTION,
    images: [OGP_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

/**
 * トップページのメタデータ
 */
export const generateHomeMetadata = (): Metadata => ({
  // トップはテンプレートを使わずフルタイトルをそのまま出す
  title: { absolute: TOP_TITLE },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: TOP_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    images: [OGP_IMAGE],
  },
})

/**
 * 検索結果ページのメタデータ
 */
export const generateSearchMetadata = (params: {
  prefectureName?: string
  municipalityName?: string
  jobCategoryName?: string
  totalCount?: number
}): Metadata => {
  const { prefectureName, municipalityName, jobCategoryName, totalCount } = params
  
  const locationText = municipalityName 
    ? `${municipalityName}（${prefectureName}）`
    : prefectureName || '全国'
  
  const jobText = jobCategoryName || 'ドライバー・整備士・デリバリー'
  const title = `${locationText}の${jobText}求人一覧`
  const description = `${locationText}の${jobText}求人情報。${totalCount ? `${totalCount}件の求人` : '多数の求人'}を掲載中。あなたにぴったりの求人を見つけよう。`
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [OGP_IMAGE],
    },
    alternates: {
      canonical: '/search',
    },
  }
}

/**
 * 求人詳細ページのメタデータ
 */
export const generateJobMetadata = (job: JobDetail): Metadata => {
  const title = `${job.jobName ?? job.title} - ${job.companyName ?? '企業名非公開'}`
  const locationText = job.municipality?.name 
    ? `${job.municipality.name}（${job.prefecture?.region}）`
    : job.prefecture?.region || '勤務地未定'
  
  const salaryText = job.salaryMin && job.salaryMax
    ? `月給${job.salaryMin.toLocaleString()}円～${job.salaryMax.toLocaleString()}円`
    : job.salaryMin
    ? `月給${job.salaryMin.toLocaleString()}円〜`
    : '給与応相談'
  
  const description = `${locationText}の${job.jobCategory?.name || 'ドライバー'}求人。${salaryText}。${job.descriptionAppeal || job.descriptionWork || '詳細情報をご確認ください。'}`
  
  const imageUrl = job.images?.[0]?.url || job.imageUrl || OGP_IMAGE
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    alternates: {
      canonical: `/job/${job.id}`,
    },
  }
}

/**
 * 応募ページのメタデータ
 */
export const generateApplyMetadata = (job: JobDetail): Metadata => {
  const title = `応募フォーム - ${job.jobName ?? job.title}`
  const description = `${job.companyName ?? '企業'} の${job.jobName ?? job.title}への応募フォームです。`
  
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
    alternates: {
      canonical: `/apply/${job.id}`,
    },
  }
}

// =====================
// 構造化データ用ヘルパー
// =====================

/** 日本語の雇用形態 → Google JobPosting employmentType enum */
const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  '正社員': 'FULL_TIME',
  '契約社員': 'CONTRACTOR',
  'パート': 'PART_TIME',
  'アルバイト': 'PART_TIME',
  'パート・アルバイト': 'PART_TIME',
  'パートタイム': 'PART_TIME',
  '業務委託': 'CONTRACTOR',
  '委託': 'CONTRACTOR',
  '派遣社員': 'TEMPORARY',
  '派遣': 'TEMPORARY',
  '紹介予定派遣': 'TEMPORARY',
  'インターン': 'INTERN',
  'インターンシップ': 'INTERN',
  'ボランティア': 'VOLUNTEER',
  '日雇い': 'PER_DIEM',
  'その他': 'OTHER',
}

/** employmentType を Google enum 配列へ変換（未知値は OTHER、空なら FULL_TIME） */
const mapEmploymentType = (values?: string[]): string[] => {
  if (!values || values.length === 0) return ['FULL_TIME']
  const mapped = values
    .map((v) => EMPLOYMENT_TYPE_MAP[v?.trim()] ?? 'OTHER')
  return Array.from(new Set(mapped))
}

/** 日本語の給与種別 → baseSalary.unitText */
const WAGE_UNIT_MAP: Record<string, string> = {
  '時給': 'HOUR',
  '日給': 'DAY',
  '週給': 'WEEK',
  '月給': 'MONTH',
  '年収': 'YEAR',
  '年俸': 'YEAR',
}

const mapWageUnit = (values?: string[]): string => {
  const v = values?.[0]?.trim()
  return (v && WAGE_UNIT_MAP[v]) || 'MONTH'
}

/** prefecture/municipality 参照が無い場合に addressPrefMuni から都道府県・市区町村を抽出 */
const parseAddressPrefMuni = (
  s?: string,
): { region?: string; locality?: string } => {
  if (!s) return {}
  const m = s.match(/^(.+?[都道府県])((?:.+?郡)?.+?[市区町村])?/)
  if (!m) return {}
  return { region: m[1], locality: m[2] }
}

/** HTML 特殊文字をエスケープ */
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 複数の説明セクションを結合した完全な求人説明 HTML を生成 */
const buildJobDescriptionHtml = (job: JobDetail): string => {
  const sections: Array<[string, string | undefined]> = [
    ['仕事内容', job.descriptionWork],
    ['アピールポイント', job.descriptionAppeal],
    ['求める人物像', job.descriptionPerson],
    ['給与', job.salaryNote],
    ['待遇・福利厚生', job.descriptionBenefits],
    ['勤務時間', job.workHours],
    ['休日・休暇', job.holidays],
    ['アクセス', job.access],
    ['その他', job.descriptionOther],
  ]
  const html = sections
    .filter(([, body]) => body && body.trim())
    .map(
      ([heading, body]) =>
        `<h3>${escapeHtml(heading)}</h3><p>${escapeHtml(body!.trim()).replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
  return html || escapeHtml(job.descriptionWork ?? job.descriptionAppeal ?? job.title ?? '')
}

/** 掲載期限のフォールバック日数（microCMSに掲載終了日フィールドが追加されるまでの暫定運用） */
const VALID_THROUGH_FALLBACK_DAYS = 30

/**
 * 構造化データの生成 (Google JobPosting 準拠)
 * @see https://developers.google.com/search/docs/appearance/structured-data/job-posting
 *
 * companyName が無い求人は hiringOrganization を正しく宣言できないため
 * markup 自体を出力しない（不正確なエンティティ宣言はペナルティリスク）。
 * その場合は null を返すので、呼び出し側で条件付きレンダリングすること。
 */
export const generateJobPostingStructuredData = (job: JobDetail) => {
  const baseUrl = SITE_URL

  if (!job.companyName) {
    console.warn(`[JobPosting] companyName missing, skipping markup: job=${job.id}`)
    return null
  }

  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const addressRegion = job.prefecture?.region ?? parsed.region
  const addressLocality = job.municipality?.name ?? parsed.locality

  if (!addressRegion) {
    // 住所欠損は Google しごと検索の掲載要件（jobLocation）を満たせない。
    // 無言で国コードのみに縮退せず、検知できるよう警告を出す（catalogスクリプトと同パターン）。
    console.warn(`[JobPosting] addressRegion unresolved: job=${job.id}`)
  }

  // 掲載期限: 更新日（なければ公開日）+30日。期限が近い求人は revisedAt の更新で延長する運用。
  // 期限切れ求人に markup を残すことは Google の品質ガイドライン違反（手動対応リスク）のため必須。
  const validThroughBase =
    job.revisedAt ?? job.updatedAt ?? job.publishedAt ?? job.createdAt
  const validThrough = validThroughBase
    ? new Date(
        new Date(validThroughBase).getTime() +
          VALID_THROUGH_FALLBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString()
    : undefined

  const streetAddress =
    [job.addressLine, job.addressBuilding].filter(Boolean).join(' ') || undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.jobName ?? job.title,
    description: buildJobDescriptionHtml(job),
    identifier: {
      '@type': 'PropertyValue',
      name: job.companyName,
      value: job.id,
    },
    datePosted: job.publishedAt ?? job.createdAt,
    validThrough,
    employmentType: mapEmploymentType(job.employmentType),
    hiringOrganization: {
      '@type': 'Organization',
      // sameAs に媒体URL(ridejob.jp)を入れると全雇用主が同一エンティティ扱いになるため出力しない
      name: job.companyName,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'JP',
        addressRegion,
        addressLocality,
        postalCode: job.addressZip,
        streetAddress,
      },
    },
    baseSalary: job.salaryMin ? {
      '@type': 'MonetaryAmount',
      currency: 'JPY',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.salaryMin,
        maxValue: job.salaryMax ?? job.salaryMin,
        unitText: mapWageUnit(job.wageType),
      },
    } : undefined,
    directApply: true,
    url: `${baseUrl}/job/${job.id}`,
  }
}

/**
 * サイト共通の Organization 構造化データ（エンティティ確立 = AIO引用の基盤）
 * 電話番号は /about 記載の窓口と一致させること。
 */
export const generateOrganizationStructuredData = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  alternateName: 'RIDE JOB',
  url: SITE_URL,
  logo: `${SITE_URL}${LOGO_IMAGE}`,
  description: SITE_DESCRIPTION,
  parentOrganization: {
    '@type': 'Organization',
    name: OPERATOR_NAME,
    url: 'https://pmagent.jp/',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+81-3-6824-7476',
    contactType: 'customer service',
    areaServed: 'JP',
    availableLanguage: 'Japanese',
  },
})

/**
 * サイト共通の WebSite 構造化データ（サイト内検索のSearchAction付き）
 */
export const generateWebSiteStructuredData = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  alternateName: 'RIDE JOB',
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
})

/**
 * パンくずリストの構造化データ
 */
export const generateBreadcrumbStructuredData = (items: Array<{ name: string; url?: string }>) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url ? `${SITE_URL}${item.url}` : undefined,
    })),
  }
} 
