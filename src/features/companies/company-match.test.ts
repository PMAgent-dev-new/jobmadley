import assert from "node:assert/strict"
import { test } from "vitest"

import companiesData from "./companies.data.json"
import { canonicalizeCompanyName } from "./company-match"
import {
  COMPANY_KEEP_JOBS,
  COMPANY_MIN_JOBS,
  FEATURED_COMPANIES,
  RETIRED_COMPANIES,
  companySlugForJob,
  resolveCompanySlugForTest as resolve,
} from "./data"

/**
 * companyName[contains] を使っていた頃、9ページ中5ページが誤った件数を
 * H1・title・FAQ・FAQPage構造化データに出していた。壊れると気づけないので、
 * 実データで実際に衝突していた組をここに固定する。
 */

test("同じ「日本交通」でも法人が違えば別ページに分かれる", () => {
  assert.equal(resolve("日本交通株式会社 品川工場"), "nihon-kotsu")
  assert.equal(resolve("日本交通グループ　日本交通株式会社　千住営業所"), "nihon-kotsu")
  // contains 日本交通株式会社 が拾ってしまっていた大阪の別法人
  assert.equal(resolve("東京・日本交通株式会社 城東営業所"), "tokyo-nihon-kotsu")
  assert.equal(resolve("日本交通関西グループ　東京・日本交通株式会社　梅田営業所"), "tokyo-nihon-kotsu")
  assert.equal(resolve("日本交通横浜株式会社 本社営業所"), "nihon-kotsu-yokohama")
  // 前株・後株が混在する表記（「東京・日本交通 株式会社　日本交通グループ関西 ハイヤー営業部」）
  assert.equal(resolve("東京・日本交通 株式会社　日本交通グループ関西 ハイヤー営業部"), "tokyo-nihon-kotsu")
})

test("第一交通は「◯◯第一交通」を吸い込まない", () => {
  assert.equal(resolve("第一交通株式会社 本社営業所"), "daiichi-kotsu")
  assert.equal(resolve("第一交通産業グループ 第一交通株式会社 牧野営業所"), "daiichi-kotsu")
  assert.equal(resolve("第一交通産業グループ 大阪第一交通株式会社 堺営業所"), "osaka-daiichi-kotsu")
  for (const name of [
    "京都第一交通株式会社 本社営業所",
    "大津第一交通株式会社 高島営業所",
    "山口第一交通グループ 小野田第一交通株式会社",
    "群北第一交通株式会社 本社営業所",
    "名神第一交通株式会社",
    "相生神姫第一交通株式会社",
    "堺第一交通株式会社 豊中営業所",
    "南大阪第一交通株式会社",
    "第一交通有限会社",
  ]) {
    assert.equal(resolve(name), null, name)
  }
})

test("エムケイは京都本体と神戸で分かれ、他地域のエムケイは拾わない", () => {
  assert.equal(resolve("エムケイ株式会社 山科営業所"), "mk-taxi")
  assert.equal(resolve("神戸エムケイ株式会社 芦屋営業所"), "kobe-mk")
  assert.equal(resolve("MKグループ 名古屋エムケイ株式会社 金山営業所"), null)
  assert.equal(resolve("大阪エムケイ株式会社 北営業所"), null)
  assert.equal(resolve("MKグループ 滋賀MK株式会社 大津営業所"), null)
})

test("法人格で閉じていない別名は、空白なしで続く長い社名に一致しない", () => {
  // contains 株式会社ホワイトハウス はオートモービル/ユーロオートモーティブまで吸っていた
  assert.equal(resolve("株式会社ホワイトハウス プジョー岐阜"), "white-house")
  assert.equal(resolve("株式会社ホワイトハウスオートモービル 管理部"), "white-house-automobile")
  assert.equal(resolve("株式会社ホワイトハウスユーロオートモーティブ アウディ名古屋西"), null)
})

test("法人格で閉じた別名は、支店名が空白なしで続いても一致する", () => {
  // microCMS の実データには空白ありと空白なしの両方の表記がある
  assert.equal(resolve("エミタスタクシー株式会社稲毛営業所"), "emitas-taxi")
  assert.equal(resolve("MITSUYAタクシーグループ エミタスタクシー株式会社本社営業所"), "emitas-taxi")
  assert.equal(resolve("京王グループ 京王自動車株式会社多摩中央営業所"), "keio-jidosha")
  assert.equal(resolve("豊鉄タクシー株式会社蒲郡営業所"), "hotetsu-taxi")
  // 「エミタスタクシー株式会社」は「エミタスタクシーアスカ株式会社」の接頭辞ではない
  assert.equal(resolve("エミタスタクシーアスカ株式会社 四街道営業所"), "emitas-taxi-asuka")
  assert.equal(resolve("MITSUYAタクシーグループ 三ツ矢エミタスタクシー株式会社八千代営業所"), "mitsuya-emitas-taxi")
  assert.equal(resolve("エミタスタクシー北総株式会社 白井営業所"), null)
})

test("日興は自動車株式会社だけを拾う（日興タクシー・日興自動車交通は別法人）", () => {
  assert.equal(resolve("東京無線グループ　日興自動車株式会社"), "nikko-jidosha")
  assert.equal(resolve("東京無線グループ 日興自動車株式会社 運行管理者"), "nikko-jidosha")
  assert.equal(resolve("東京無線グループ　日興タクシー株式会社"), null)
  assert.equal(resolve("東京無線グループ　日興自動車交通株式会社"), null)
})

test("同名別法人の三和交通は、どのページにも割り当てない", () => {
  // 日本交通グループ（東京・神奈川）と梅田交通グループ（兵庫）に同名の別会社が実在する
  assert.equal(resolve("日本交通グループ 三和交通株式会社"), null)
  assert.equal(resolve("梅田交通グループ 三和交通株式会社"), null)
  assert.equal(resolve("三和交通株式会社 八王子営業所"), null)
  assert.equal(resolve("三和交通多摩株式会社 本社営業所"), null)
  assert.equal(resolve("三和富士交通株式会社"), null)
})

test("グループ名だけの求人は、その中核法人に割り当てない", () => {
  assert.equal(resolve("日本交通グループ関西 福島工場"), null)
  assert.equal(resolve("日本交通グループ関西　守口営業所"), null)
  assert.equal(resolve("川崎タクシーグループ　金港交通株式会社　本社営業所"), null)
  assert.equal(resolve("川崎タクシーグループ　川崎タクシー株式会社　武蔵小杉営業所"), "kawasaki-taxi")
})

test("法人格を含まないブランド名は、空白区切りの店舗名までしか一致しない", () => {
  assert.equal(resolve("オートアールズ 前橋モール店"), "auto-rs")
  assert.equal(resolve("カインズオート 仙台港店"), "cainz-auto")
  assert.equal(resolve("ガリバー 八幡店"), "gulliver")
  // ガリバーは IDOM のブランドだが、法人名が明記された求人は IDOM 側に寄せる
  assert.equal(resolve("株式会社IDOM ガリバー吉川美南店 板金工場"), "idom")
})

test("全角英数・全角スペースの表記ゆれを吸収する", () => {
  assert.equal(canonicalizeCompanyName("ＵＤトラックス株式会社　天童カスタマーセンター"), "UDトラックス株式会社 天童カスタマーセンター")
  assert.equal(resolve("ＵＤトラックス株式会社 天童カスタマーセンター"), "ud-trucks")
  assert.equal(resolve("株式会社ロードカー　ボルボ・カー大阪中央"), "roadcar")
  // 「京浜交通 株式会社 小倉営業所」のように法人格の前だけ空いている表記
  assert.equal(resolve("京浜交通 株式会社 京浜キャブシステム 尾山台営業所"), "keihin-kotsu")
})

test("前株・後株が混在する社名は同じページに集約する", () => {
  assert.equal(resolve("newmoグループ 株式会社うみかぜ交通 久里浜営業所"), "umikaze-kotsu")
  assert.equal(resolve("うみかぜ交通株式会社　三崎営業所"), "umikaze-kotsu")
})

test("企業名非公開の求人は実名の企業ページに載せない", () => {
  assert.equal(companySlugForJob({ companyName: "日本交通株式会社 品川工場" }), "nihon-kotsu")
  assert.equal(companySlugForJob({ companyName: "日本交通株式会社 品川工場", hideCompanyName: true }), null)
  assert.equal(companySlugForJob({ companyName: undefined }), null)
})

test("マスタの整合性: slug重複なし・別名重複なし・廃止slugと現役slugが被らない", () => {
  const slugs = FEATURED_COMPANIES.map((c) => c.slug)
  assert.equal(new Set(slugs).size, slugs.length, "slug が重複している")

  const aliases = FEATURED_COMPANIES.flatMap((c) => c.aliases.map(canonicalizeCompanyName))
  assert.equal(new Set(aliases).size, aliases.length, "別名が重複している")

  for (const retired of RETIRED_COMPANIES) {
    assert.ok(!slugs.includes(retired.slug), `廃止した ${retired.slug} が companies に残っている`)
    assert.ok(retired.redirectTo.startsWith("/"), "遷移先はルート相対にする")
  }

  // 別名は必ず自分自身に解決する（表に矛盾した行を足したら落ちる）
  for (const company of FEATURED_COMPANIES) {
    for (const alias of company.aliases) {
      assert.equal(resolve(alias), company.slug, `${alias} が ${company.slug} に解決しない`)
    }
  }

  // 除外リストの社名がどこかのページに紛れ込んでいないこと
  for (const excluded of companiesData.excluded) {
    assert.equal(resolve(excluded.name), null, `${excluded.name} は除外対象`)
  }

  assert.ok(COMPANY_KEEP_JOBS < COMPANY_MIN_JOBS, "維持下限は生成下限より小さくないとヒステリシスにならない")
})
