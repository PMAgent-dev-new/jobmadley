import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =====================
// 給与表示関連
// =====================

/**
 * 給与情報を整形して表示用文字列を生成
 * wageType (microCMS の給与形態) が未指定の場合は「月給」にフォールバック
 */
export const formatSalary = (
  min?: number,
  max?: number,
  wageType?: string[],
): string => {
  const label = wageType?.[0]?.trim() || "月給"
  if (min && max) {
    return `${label} ${min.toLocaleString()}円 ~ ${max.toLocaleString()}円`
  }
  if (min) {
    return `${label} ${min.toLocaleString()}円〜`
  }
  if (max) {
    return `${label} 〜${max.toLocaleString()}円`
  }
  return "給与情報なし"
}

// =====================
// 日付処理関連
// =====================

/**
 * 公開日から新着かどうかを判定 (7日以内)
 */
export const isNew = (publishedDate?: string, createdDate?: string): boolean => {
  const dateStr = publishedDate ?? createdDate
  if (!dateStr) return false
  
  const date = new Date(dateStr)
  const now = Date.now()
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000)
  
  return date.getTime() > sevenDaysAgo
}

/**
 * 日付を日本語形式で表示
 */
export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric"
  })
}

// =====================
// 住所表示関連
// =====================

/**
 * 都道府県と市区町村を結合して表示用文字列を生成
 */
export const formatAddress = (
  municipalityName?: string,
  prefectureName?: string
): string => {
  return [municipalityName, prefectureName].filter(Boolean).join(" ")
}

// =====================
// 画像処理関連
// =====================

/**
 * 求人画像URLを取得（フォールバック付き）
 */
export const getJobImageUrl = (
  images?: { url: string }[],
  imageUrl?: string
): string => {
  return images?.[0]?.url ?? imageUrl ?? "/placeholder.svg"
}

// =====================
// URL生成関連
// =====================

/**
 * 検索パラメータからクエリ文字列を生成
 */
export const buildSearchQuery = (params: {
  prefectureId?: string
  municipalityId?: string
  tagIds?: string[]
  jobCategoryId?: string
  keyword?: string
  page?: number
  sort?: string
}): string => {
  const searchParams = new URLSearchParams()
  
  if (params.keyword?.trim()) {
    searchParams.set("q", params.keyword.trim())
  }
  if (params.prefectureId) {
    searchParams.set("prefecture", params.prefectureId)
  }
  if (params.municipalityId) {
    searchParams.set("municipality", params.municipalityId)
  }
  if (params.tagIds?.length) {
    searchParams.set("tags", params.tagIds.join(","))
  }
  if (params.jobCategoryId) {
    searchParams.set("jobCategory", params.jobCategoryId)
  }
  if (params.page && params.page > 1) {
    searchParams.set("page", String(params.page))
  }
  if (params.sort && params.sort !== "recommended") {
    searchParams.set("sort", params.sort)
  }
  
  return searchParams.toString()
}

// =====================
// バリデーション関連
// =====================

/**
 * メールアドレスの形式チェック
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 電話番号の形式チェック（日本の電話番号）
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^[0-9]{10,11}$/
  return phoneRegex.test(phone.replace(/[-\s]/g, ""))
}

// =====================
// CMS入稿本文の整形
// =====================

/**
 * 行頭の装飾記号（CMS入稿の箇条書きマーカー）。
 * 「・」「-」は語中でも使われる（例:「借上げ社宅・独身寮」）ため、行頭に限定して除去する。
 */
const LEADING_DECORATION_RE = /^[\s✅✔☑◎○●◇◆■□▼▽▶★☆※→・\-–—*+]+/

/**
 * CMS入稿本文（descriptionAppeal / salaryNote など）を1行のプレーンテキストへ整形する。
 * 入稿本文は「✅」始まりの箇条書き＋改行を含むため、そのまま meta description や
 * FAQ の回答に載せると記号と改行が露出する。meta と FAQ で同じ整形を使いたいので
 * ここに集約している（二重管理を避けるため）。
 */
export const normalizeCmsText = (raw?: string): string => {
  if (!raw) return ''
  return raw
    // タグは空文字ではなく改行へ置換する（<br> や </p> で区切られた文が連結するのを防ぐ）
    .replace(/<[^>]*>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .split(/\r?\n/)
    .map((line) => line.replace(LEADING_DECORATION_RE, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
