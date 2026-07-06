import { SITE_URL } from "@/shared/lib/metadata"

/**
 * robots.txt (Route Handler)
 *
 * Next.js の robots.ts (MetadataRoute.Robots) は `Content-Signal:` 行を出力できないため、
 * Content-Signal を含める目的でこの Route Handler に置き換えている（旧 src/app/robots.ts を削除）。
 *
 * Content-Signal ポリシー: search=yes, ai-input=yes, ai-train=no
 *   - search   : 検索インデックスでの利用を許可
 *   - ai-input : AI 回答での引用 / RAG 利用を許可（← 今回追加）
 *   - ai-train : AI モデルの学習利用は不許可
 *
 * あわせて学習・スクレイピング系クローラーは Disallow で明示ブロックする。
 * （※実ブロックは Cloudflare の AI Crawl Control 側でも実施。Cloudflare の
 *   「管理された robots.txt」はこのファイルで代替するため無効化する想定。）
 */
export const dynamic = "force-static"

// 学習・スクレイピング用クローラー（ai-train=no と整合させてブロック宣言）
const AI_TRAINING_BOTS = [
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ClaudeBot",
  "Google-Extended",
  "GPTBot",
  "meta-externalagent",
]

export function GET() {
  const body = [
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /preview/",
    // 注: /job/standby/ と /apply/ は意図的に Disallow しない（PR #24）。
    // 両ページは noindex メタを SSR 出力済みで、Disallow すると Googlebot が
    // noindex を読めず「ブロック中だが索引済み」の宙吊り状態になるため。
    "",
    "# AI 学習・スクレイピング用クローラーはブロック（ai-train=no）",
    ...AI_TRAINING_BOTS.flatMap((bot) => [`User-agent: ${bot}`, "Disallow: /"]),
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    `Sitemap: ${SITE_URL}/media/sitemap.xml`,
    "",
  ].join("\n")

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
