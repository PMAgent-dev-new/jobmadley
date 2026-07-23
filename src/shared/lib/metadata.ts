import type { Metadata } from 'next'
import type { JobDetail, Job } from '@/features/jobs/types'
import { normalizeCmsText } from '@/shared/lib/utils'

// =====================
// メタデータ設定
// =====================

// ブランド名（titleテンプレートのサフィックス）。旧値は説明文入り全角38字で、
// 求人詳細のtitleが60〜80字になりSERPで切断・書き換えが発生していた（基準28〜32字）。
export const SITE_NAME = 'ライドジョブ'
// トップページ専用のフルタイトル。主要KW（タクシー転職・求人）を先頭に置く
// （GSC実測: 「タクシー 転職/求人」系クエリで9〜13位・クリック0のため、ブランド先頭→KW先頭に変更）
export const TOP_TITLE = 'タクシードライバー・自動車整備士の求人・転職サイト｜ライドジョブ'
export const SITE_DESCRIPTION = 'タクシードライバー・自動車整備士・ドライバー職の求人・転職サイト「ライドジョブ」。未経験歓迎・高収入・寮完備などの条件から探せて、専任アドバイザーが転職を無料でサポートします。'
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

// =====================
// meta description 整形ヘルパー
// =====================

/** meta description の目安長。日本語SERPは全角120字前後で切られるため、この範囲に収める */
const JOB_DESCRIPTION_MAX_LENGTH = 120

/**
 * CMS本文を meta description 用の1行テキストへ整形する。
 * 実体は shared/lib/utils の normalizeCmsText（FAQ生成と同じ整形を使うため共通化）。
 */
const normalizeDescriptionSource = (raw?: string): string => normalizeCmsText(raw)

/**
 * 指定字数に収まるよう切り詰める。語の途中で切れて意味が壊れないよう、
 * 句点 → 読点・括弧閉じ・項目区切り の順に切断位置を探し、見つからない場合のみ字数で切る。
 * 句点で終われた場合は文として完結しているので「…」は付けない。
 */
const truncateForDescription = (text: string, maxLength: number): string => {
  // 「…」で1字使うため、2字未満の予算しか無ければ何も入れない
  if (!text || maxLength < 2) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text

  // 末尾の「…」1字ぶんを空けて候補を切り出す
  const head = chars.slice(0, maxLength - 1).join('')
  // 極端に短く切れるのを避けるため、切断位置は候補の後半にある場合のみ採用する
  const minCut = head.length / 2
  const sentenceEnd = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('！'),
    head.lastIndexOf('？'),
  )
  if (sentenceEnd >= minCut) return head.slice(0, sentenceEnd + 1)

  const softBreak = Math.max(
    head.lastIndexOf('、'),
    head.lastIndexOf('，'),
    head.lastIndexOf('）'),
    head.lastIndexOf(' '),
  )
  const cut = softBreak >= minCut ? softBreak + 1 : head.length
  return `${head.slice(0, cut).replace(/[、，\s]+$/, '')}…`
}

/**
 * 求人詳細ページのメタデータ
 */
export const generateJobMetadata = (job: JobDetail): Metadata => {
  const jobName = job.jobName ?? job.title
  // 非公開指定の求人は実企業名を露出しない（JobPosting と同じ「非公開」表記に統一）
  const company = job.hideCompanyName ? '非公開' : (job.companyName ?? '企業名非公開')

  // 勤務地は JobPosting と同じ堅牢な解決に統一。prefecture リレーション欠損時は
  // addressPrefMuni 文字列からパースする。旧実装は region 欠損で「勤務地未定」と
  // 誤表示し、同ページの JobPosting が県名を持つのと矛盾していた（P1-2 バグ）。
  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const region = job.prefecture?.region ?? parsed.region
  const locality = job.municipality?.name ?? parsed.locality

  // 地域プリフィックスでローカル検索（「地域 職種 求人」）を強化（P1-3）。
  // SERP は末尾から切断されるため、価値の高い地域名を先頭に置いて生存させる。
  const title = `${region ? `${region}｜` : ''}${jobName} - ${company}`

  const locationText =
    locality && region ? `${locality}（${region}）` : region || locality || ''

  // 給与の単位は wageType（microCMS の給与形態）に従う。「月給」固定だと時給・日給の
  // 求人で「月給1,500円〜」という誤表記になり、同ページの JobPosting
  // baseSalary.unitText（HOUR/DAY）とも矛盾するため。未設定は従来どおり月給。
  const wageLabel = wageUnitLabel(job.wageType)
  const salaryText = job.salaryMin && job.salaryMax
    ? `${wageLabel}${job.salaryMin.toLocaleString()}円～${job.salaryMax.toLocaleString()}円`
    : job.salaryMin
    ? `${wageLabel}${job.salaryMin.toLocaleString()}円〜`
    : '給与応相談'

  // 地域・職種・給与の定型部分を先に確定し、残り字数だけCMS本文を入れる。
  // 旧実装は job.descriptionAppeal を無加工で連結していたため、✅ や改行が
  // そのまま meta description に載り、SERPで表示が崩れてCTRを損なっていた。
  const descriptionPrefix = locationText
    ? `${locationText}の${job.jobCategory?.name || 'ドライバー'}求人。${salaryText}。`
    : `${job.jobCategory?.name || 'ドライバー'}求人。${salaryText}。`
  const appeal = truncateForDescription(
    normalizeDescriptionSource(job.descriptionAppeal || job.descriptionWork),
    JOB_DESCRIPTION_MAX_LENGTH - Array.from(descriptionPrefix).length,
  )
  const description = `${descriptionPrefix}${appeal || '詳細情報をご確認ください。'}`
  
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

/**
 * 表示テキスト用の給与単位ラベル（「月給」「時給」など）。
 * JobPosting の unitText と同じ語彙（WAGE_UNIT_MAP）で検証するため、
 * 本文の表記と構造化データの単位が食い違わない。
 * 未設定・未知値は「月給」へフォールバック（microCMS の既定運用が月給のため、
 * wageType を持たない既存求人の表示は変わらない）。
 */
const wageUnitLabel = (values?: string[]): string => {
  const v = values?.[0]?.trim()
  return v && WAGE_UNIT_MAP[v] ? v : '月給'
}

/** prefecture/municipality 参照が無い場合に addressPrefMuni から都道府県・市区町村を抽出 */
const parseAddressPrefMuni = (
  s?: string,
): { region?: string; locality?: string } => {
  if (!s) return {}
  // 非貪欲 [都道府県] は「京都府」を「京都」(京+都)で誤停止させる（都道府県中『京都府』は
  // 手前に『都』を含む唯一の例外）。特殊4県を明示し、残り43県は『.+?県』で受ける。
  const m = s.match(/^(北海道|東京都|京都府|大阪府|.+?県)((?:.+?郡)?.+?[市区町村])?/)
  if (!m) return {}
  return { region: m[1], locality: m[2] }
}

/** HTML 特殊文字をエスケープ */
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 複数の説明セクションを結合した完全な求人説明 HTML を生成 */
export const buildJobDescriptionHtml = (job: JobDetail): string => {
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

  // 人材紹介で実雇用主名の掲載許諾が無い求人は hideCompanyName=true で「非公開」表示。
  // 実名も非公開指定も無い（＝会社情報が無い）求人は markup を出さない。
  if (!job.companyName && !job.hideCompanyName) {
    console.warn(`[JobPosting] companyName missing, skipping markup: job=${job.id}`)
    return null
  }
  const orgName = job.hideCompanyName ? '非公開' : (job.companyName as string)
  const showOrgIdentity = !job.hideCompanyName

  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  const addressRegion = job.prefecture?.region ?? parsed.region
  const addressLocality = job.municipality?.name ?? parsed.locality

  if (!addressRegion) {
    // 住所欠損は Google しごと検索の掲載要件（jobLocation）を満たせない。
    // 無言で国コードのみに縮退せず、検知できるよう警告を出す（catalogスクリプトと同パターン）。
    console.warn(`[JobPosting] addressRegion unresolved: job=${job.id}`)
  }

  // 掲載期限: CMSに掲載終了日(expiresAt)があれば正式値を使用。無ければ更新日(なければ公開日)+30日の暫定。
  // 期限切れ求人に markup を残すことは Google の品質ガイドライン違反（手動対応リスク）のため必須。
  let validThrough: string | undefined
  if (job.expiresAt) {
    validThrough = new Date(job.expiresAt).toISOString()
  } else {
    const validThroughBase =
      job.revisedAt ?? job.updatedAt ?? job.publishedAt ?? job.createdAt
    validThrough = validThroughBase
      ? new Date(
          new Date(validThroughBase).getTime() +
            VALID_THROUGH_FALLBACK_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
      : undefined
  }

  const streetAddress =
    [job.addressLine, job.addressBuilding].filter(Boolean).join(' ') || undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.jobName ?? job.title,
    description: buildJobDescriptionHtml(job),
    identifier: {
      '@type': 'PropertyValue',
      name: orgName,
      value: job.id,
    },
    datePosted: job.publishedAt ?? job.createdAt,
    validThrough,
    employmentType: mapEmploymentType(job.employmentType),
    hiringOrganization: {
      '@type': 'Organization',
      name: orgName,
      // 実雇用主の公式URL/ロゴは許諾済み(=実名表示)の求人のみ付与。
      // 媒体URL(ridejob.jp)は入れない（全雇用主が同一エンティティ扱いになるため）。
      ...(showOrgIdentity && job.companyUrl
        ? { url: job.companyUrl, sameAs: job.companyUrl }
        : {}),
      ...(showOrgIdentity && job.companyLogo?.url
        ? { logo: job.companyLogo.url }
        : {}),
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

/**
 * 地域×職種ハブページのメタデータ。
 * /search（パラメータ付きは noindex）と異なり、ハブは index 対象＋自己参照 canonical を返す。
 * canonicalPath はルート相対（例: '/jobs/tokyo/taxi-driver'）。
 */
export const generateHubMetadata = (params: {
  title: string
  description: string
  canonicalPath: string
}): Metadata => {
  const { title, description, canonicalPath } = params
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonicalPath,
      images: [OGP_IMAGE],
      type: 'website',
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

/**
 * 求人一覧（ハブ）の ItemList 構造化データ（URLのみ列挙）。
 * Google は一覧への JobPosting 多重掲載を非推奨のため、個別 JobPosting は求人詳細のみに置き、
 * ハブでは ItemList（各求人詳細URLへのポインタ）に留める。
 */
export const generateItemListStructuredData = (
  items: Array<{ url: string; name?: string }>,
) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: `${SITE_URL}${item.url}`,
    ...(item.name ? { name: item.name } : {}),
  })),
})

/**
 * FAQPage 構造化データ。question/answer は本文に表示するFAQと完全一致させること。
 */
export const generateFaqStructuredData = (
  faqs: Array<{ question: string; answer: string }>,
) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer },
  })),
})
