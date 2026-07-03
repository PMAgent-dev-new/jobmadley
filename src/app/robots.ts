import type { MetadataRoute } from "next"
import { SITE_URL } from "@/shared/lib/metadata"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /job/standby/ と /apply/ は robots.txt でブロックしない。
        // 両ページとも noindex メタを SSR 出力済みで、Disallow すると Googlebot が
        // noindex を読めず「ブロック中だが索引済み」の宙吊り状態になる（standby URL で実発生）。
        // デインデックス完了までは GSC の URL 一時削除を併用する。
        disallow: ["/api/", "/preview/"],
      },
    ],
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      // /media 配下のメディアサイト（ridejob-cms・別アプリ）のサイトマップ。
      // ルート robots.txt に併記することで検索エンジンにメディア記事の存在を通知する。
      `${SITE_URL}/media/sitemap.xml`,
    ],
    // host は非標準ディレクティブ（旧Yandex専用）のため出力しない
  }
}
