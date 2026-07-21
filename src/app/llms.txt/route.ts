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
    "> タクシードライバー・自動車整備士・バス／トラック／送迎／配送ドライバー・運行管理者など、暮らしと街を支える仕事の求人・転職サイト。運営: 株式会社PM Agent。未経験歓迎・資格取得支援（二種免許・大型免許など）の求人を全国から掲載しています。",
    "",
    "サイトは求人本体（ridejob.jp）とお役立ちメディア（ridejob.jp/media）で構成されます。求人は職種×地域のハブページから探せます。",
    "",
    "## 主要導線",
    `- [求人検索](${SITE_URL}/search): 地域・職種・こだわり条件から求人を横断検索`,
    `- [メディア（お役立ち記事）](${SITE_URL}/media): 年収・なり方・資格・適性などの解説記事`,
    "",
    "## 職種から探す（全国ハブ）",
    // この一覧は microCMS jobcategories（slug あり）＝ sitemap.xml が載せる集合と同じにする。
    // 職種を新設したら必ずここにも追記する（追記漏れだと AI 検索側に新カテゴリが存在しないまま残る）。
    // 並びは HUB_GROUPS（ドライバー職→整備士→管理・事務）に合わせ、グループとの対応を読み取れるようにする。
    `- [タクシードライバーの求人](${SITE_URL}/jobs/category/taxi-driver)`,
    `- [バス運転手の求人](${SITE_URL}/jobs/category/bus-driver)`,
    `- [ハイヤードライバーの求人](${SITE_URL}/jobs/category/hire-driver)`,
    `- [トラックドライバーの求人](${SITE_URL}/jobs/category/truck-driver)`,
    `- [送迎ドライバーの求人](${SITE_URL}/jobs/category/shuttle-driver)`,
    `- [配送ドライバーの求人](${SITE_URL}/jobs/category/delivery-driver)`,
    `- [自動車整備士の求人](${SITE_URL}/jobs/category/car-mechanic)`,
    `- [バイク整備士の求人](${SITE_URL}/jobs/category/bike-mechanic)`,
    `- [運行管理者の求人](${SITE_URL}/jobs/category/operation-manager)`,
    `- [営業の求人](${SITE_URL}/jobs/category/sales)`,
    "",
    "## 職種グループ",
    `- [ドライバー職](${SITE_URL}/jobs/group/driver)`,
    `- [整備士](${SITE_URL}/jobs/group/mechanic)`,
    `- [管理・事務職](${SITE_URL}/jobs/group/management)`,
    "",
    "## 地域から探す",
    `- [東京都のドライバー・整備士求人](${SITE_URL}/jobs/tokyo)`,
    `- [大阪府のドライバー・整備士求人](${SITE_URL}/jobs/osaka)`,
    `地域×職種のハブは /jobs/{都道府県slug}/{職種slug} の形式です（例: ${SITE_URL}/jobs/tokyo/taxi-driver）。全URLは sitemap.xml に掲載しています。`,
    "",
    // AI 検索は「◯◯の年収は？」「◯◯になるには？」の問いに対して個別記事を引用する。
    // /media トップ1行だけでは代表記事まで辿られないため、質問の型ごとに代表URLを明示する。
    // 掲載するのは実在確認済みのURLのみ（存在しないURLを載せると llms.txt 全体の信頼度が下がる）。
    "## メディアの主要コンテンツ（RIDE JOB Media）",
    "",
    "### 仕事内容・なり方",
    `- [ドライバーの仕事とは？種類・年収・なり方](${SITE_URL}/media/blog/driver-jobs-guide)`,
    `- [未経験からタクシー運転手になるには](${SITE_URL}/media/blog/taxi-driver-inexperienced-guide)`,
    `- [バス運転手になるには？大型二種免許の取り方・費用](${SITE_URL}/media/blog/bus-driver-how-to-become)`,
    `- [自動車整備士の仕事内容・一日の流れ](${SITE_URL}/media/blog/car-mechanic-job)`,
    `- [送迎ドライバーの仕事内容・必要な免許（二種の要否）](${SITE_URL}/media/blog/shuttle-driver)`,
    `- [ルート配送ドライバーの実態と会社の選び方](${SITE_URL}/media/blog/route-delivery-driver)`,
    `- [宅配便ドライバーの年収と働き方](${SITE_URL}/media/blog/parcel-delivery-driver)`,
    `- [軽貨物ドライバーの年収・黒ナンバーの仕組み](${SITE_URL}/media/blog/light-cargo-driver)`,
    "",
    "### 年収・給与相場",
    `- [タクシー運転手の年収（平均414万円）](${SITE_URL}/media/blog/taxi-driver-salary)`,
    `- [トラックドライバーの年収（大型・中型の相場）](${SITE_URL}/media/blog/truck-driver-salary)`,
    `- [バス運転手の年収（平均461万円）](${SITE_URL}/media/blog/bus-driver-salary)`,
    `- [自動車整備士の年収（企業規模別の違い）](${SITE_URL}/media/blog/car-mechanic-salary)`,
    "",
    "### 資格・免許",
    `- [二種免許の取得方法・費用・期間](${SITE_URL}/media/blog/type-2-license-guide)`,
    `- [大型・中型・けん引免許の取り方](${SITE_URL}/media/blog/large-license-guide)`,
    `- [中型免許とは（8t限定の解除方法）](${SITE_URL}/media/blog/medium-license)`,
    `- [準中型免許とは（18歳で取得できる）](${SITE_URL}/media/blog/semi-medium-license)`,
    `- [自動車整備士の資格（3級・2級・1級）](${SITE_URL}/media/blog/car-mechanic-license)`,
    `- [運行管理者の資格・試験・合格率](${SITE_URL}/media/blog/transport-manager-license)`,
    `- [バイク整備士の資格](${SITE_URL}/media/blog/bike-mechanic-license)`,
    "",
    "### 用語辞典（業界用語の解説）",
    `- [トラック・物流の用語辞典（用語一覧）](${SITE_URL}/media/blog/truck-glossary)`,
    `- [緑ナンバーとは（白ナンバー・黒ナンバーとの違い）](${SITE_URL}/media/blog/green-number)`,
    `- [点呼とは](${SITE_URL}/media/blog/word-tenko)`,
    `- [パレットとは](${SITE_URL}/media/blog/word-pallet)`,
    "個別の用語解説は /media/blog/word-… の形式で1語1ページで公開しています（全URLは media/sitemap.xml に掲載）。",
    "",
    "## 運営者情報",
    `- [運営会社（株式会社PM Agent）](${SITE_URL}/about)`,
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
