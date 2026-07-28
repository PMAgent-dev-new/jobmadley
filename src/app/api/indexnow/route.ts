import { NextResponse } from "next/server"
import { submitToIndexNow } from "@/shared/lib/indexnow"
import { SITE_URL } from "@/shared/lib/metadata"

/**
 * IndexNow 送信エンドポイント（Bing / Yandex / Naver 等へ URL 更新を通知）。
 *
 * 使い方:
 *   POST /api/indexnow?secret=xxx           … sitemap 全URLを送信（定期実行向け）
 *   POST /api/indexnow?secret=xxx  body: {"urls":["https://ridejob.jp/..."]}
 *                                           … 指定URLのみ送信（記事公開直後など）
 *
 * secret は INDEXNOW_SECRET（未設定なら MICROCMS_PREVIEW_SECRET を流用）。
 * 誰でも叩けると他人に大量送信を強いられ、IndexNow 側のレート制限を無駄に消費するため保護する。
 */
export const dynamic = "force-dynamic"

const secret = process.env.INDEXNOW_SECRET || process.env.MICROCMS_PREVIEW_SECRET

/** sitemap.xml と media/sitemap.xml から URL を集める（送信対象＝indexさせたいURLだけ）。 */
async function collectSitemapUrls(): Promise<string[]> {
  const urls: string[] = []
  for (const path of ["/sitemap.xml", "/media/sitemap.xml"]) {
    try {
      const res = await fetch(`${SITE_URL}${path}`, { cache: "no-store" })
      if (!res.ok) continue
      const xml = await res.text()
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1].trim())
    } catch (error) {
      console.error(`[indexnow] failed to read ${path}`, error)
    }
  }
  return urls
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  if (!secret || searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let urls: string[] = []
  try {
    const body = (await request.json()) as { urls?: string[] }
    if (Array.isArray(body?.urls)) urls = body.urls
  } catch {
    // body 無し = sitemap 全件モード
  }
  if (urls.length === 0) urls = await collectSitemapUrls()

  const result = await submitToIndexNow(urls)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
