import { fetchList } from "@/shared/microcms/fetcher"
import type { BlogArticle } from "./types"

const fetchArticlesByCategory = async (categoryId: string): Promise<BlogArticle[]> => {
  const data = await fetchList<BlogArticle>({
    endpoint: "blogs",
    // 実際に表示するのは3件のみ。抽出プールは12件で十分（旧: 100件×2カテゴリの過剰フェッチ）
    queries: { filters: `category[equals]${categoryId}`, limit: 12, orders: "-publishedAt" },
    context: `getMediaArticles:category=${categoryId}`,
    client: "media",
  })
  return data.contents
}

const pickThreeRandom = (articles: BlogArticle[]): BlogArticle[] => {
  const shuffled = [...articles]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, 3)
}

export async function getMediaArticles() {
  const [companyPool, voicePool] = await Promise.all([
    fetchArticlesByCategory("2"),
    fetchArticlesByCategory("3"),
  ])

  return {
    companyArticles: pickThreeRandom(companyPool),
    interviewArticles: pickThreeRandom(voicePool),
  }
}

/**
 * キーワードに関連するお役立ち記事（category=4）を取得。
 * ハブ（地域×職種・職種）→ メディア記事の相互リンクでトピッククラスタを双方向化する
 * ために使用（従来はメディア→求人の片方向のみ＝クラスタが片方向だった / P1-1）。
 * 失敗時は空配列（ハブ本体の描画は止めない）。
 */
export async function getMediaArticlesByKeyword(keyword: string, limit = 3): Promise<BlogArticle[]> {
  try {
    const data = await fetchList<BlogArticle>({
      endpoint: "blogs",
      // q(全文検索)だと「運転代行」「軽貨物」などキーワードを言及するだけの記事が
      // 混入するため、title[contains] で本題の記事に限定する（例: title に「タクシー」を
      // 含む＝タクシー運転手の年収/適性/個人タクシー等。運転代行等はタイトルに含まず除外）。
      queries: {
        filters: `category[equals]4[and]title[contains]${keyword}`,
        limit,
        orders: "-publishedAt",
      },
      context: `getMediaArticlesByKeyword:${keyword}`,
      client: "media",
    })
    return data.contents
  } catch {
    return []
  }
}
