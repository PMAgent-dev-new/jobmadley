import { SITE_URL } from "@/shared/lib/metadata"

/**
 * llms.txt (Route Handler)
 *
 * AI アシスタント／AI 検索が RIDE JOB の全体像と主要導線を把握しやすいように、
 * サイトの要約と主要 URL を機械可読で提供する（llmstxt.org 準拠の簡易形式）。
 * ridejob.jp の AIO 方針（引用系 AI ボットは許可・学習系はブロック）に沿った補助情報。
 *
 * 注: Google 検索は llms.txt を利用しない（公式見解）。本ファイルは主に AI 検索/
 * アシスタント向けの補助であり、正典のクロール導線は sitemap.xml が担う。
 */
export const dynamic = "force-static"

export function GET() {
  const body = [
    "# RIDE JOB（ライドジョブ）",
    "",
    "> タクシードライバー・自動車整備士・バス／トラックドライバー・フードデリバリーなど、暮らしと街を支える仕事の求人・転職サイト。運営: 株式会社PM Agent。未経験歓迎・資格取得支援（二種免許・大型免許など）の求人を全国から掲載しています。",
    "",
    "サイトは求人本体（ridejob.jp）とお役立ちメディア（ridejob.jp/media）で構成されます。求人は職種×地域のハブページから探せます。",
    "",
    "## 主要導線",
    `- [求人検索](${SITE_URL}/search): 地域・職種・こだわり条件から求人を横断検索`,
    `- [メディア（お役立ち記事）](${SITE_URL}/media): 年収・なり方・資格・適性などの解説記事`,
    "",
    "## 職種から探す（全国ハブ）",
    `- [タクシードライバーの求人](${SITE_URL}/jobs/category/taxi-driver)`,
    `- [バス運転手の求人](${SITE_URL}/jobs/category/bus-driver)`,
    `- [トラックドライバーの求人](${SITE_URL}/jobs/category/truck-driver)`,
    `- [ハイヤードライバーの求人](${SITE_URL}/jobs/category/hire-driver)`,
    `- [自動車整備士の求人](${SITE_URL}/jobs/category/car-mechanic)`,
    `- [バイク整備士の求人](${SITE_URL}/jobs/category/bike-mechanic)`,
    `- [運行管理者の求人](${SITE_URL}/jobs/category/operation-manager)`,
    "",
    "## 職種グループ",
    `- [ドライバー職](${SITE_URL}/jobs/group/driver)`,
    `- [整備士](${SITE_URL}/jobs/group/mechanic)`,
    `- [管理・事務職](${SITE_URL}/jobs/group/management)`,
    "",
    "## サイトマップ",
    `- ${SITE_URL}/sitemap.xml`,
    `- ${SITE_URL}/media/sitemap.xml`,
    "",
  ].join("\n")

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
