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
