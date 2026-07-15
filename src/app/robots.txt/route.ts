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
    // クロールキュー汚染対策（2026-07 GSCドリルダウン診断）:
    // /apply/(応募フォーム=noindex,nofollow), /job/standby/(スタンバイ由来の死んだ名前空間=全404),
    // /search?param(絞り込み結果=noindex) は、いずれも検索価値ゼロで大量にクロールされ、
    // 鮮度が命の /job/{id}(約1,400) の再クロール・新規発見を圧迫している。
    // ★以前は「noindexを読ませるため意図的に非Disallow」だった(旧PR #24)が、実測で
    // 上記3空間は既に de-index 完了(noindex除外/404/canonical代替=非インデックス)。
    // de-index 完了後のブロックはGoogle推奨手順であり「宙吊り」は起きないため、
    // クロールを /job・/jobs・sitemap掲載URL・/media に集中させるためブロックへ切替。
    // 注: 素の /search・/job/{id}・/jobs/*・/_next/* は前方一致しないため対象外（誤爆なし）。
    "Disallow: /apply/",
    "Disallow: /job/standby/",
    "Disallow: /search?",
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
