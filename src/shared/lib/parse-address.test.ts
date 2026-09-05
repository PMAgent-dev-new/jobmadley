import assert from 'node:assert/strict'
import { test } from 'vitest'

import { parseAddressPrefMuni } from './metadata'

/**
 * JobPosting の jobLocation.address を組み立てる住所パーサ。
 *
 * ここが失敗すると addressRegion / addressLocality が欠けた構造化データが出て、
 * Google しごと検索の掲載要件を満たせなくなる（GSCから「求人情報の構造化データで
 * 問題が検出されました」が届いた実績あり・2026-09-04）。
 */

test('★都道府県を省いた住所でも解釈できる（GSCの指摘の原因）', () => {
  // 入稿データに「板橋区中丸町」のように都道府県抜きの住所が混じっていた。
  // 従来は正規表現が丸ごと失敗し、region も locality も欠けた markup が出ていた。
  assert.deepEqual(parseAddressPrefMuni('板橋区中丸町'), {
    region: '東京都',
    locality: '板橋区',
    town: '中丸町',
  })
})

test('★他都市に同名の区がある場合は推測しない', () => {
  // 中央区は札幌/千葉/新潟/神戸/福岡/熊本等、港区は大阪市/名古屋市、
  // 北区は大阪/京都/神戸/名古屋/札幌等にもある。
  // 推測すると、大阪の求人を「東京都」と宣言してしまう。
  assert.deepEqual(parseAddressPrefMuni('中央区銀座'), {})
  assert.deepEqual(parseAddressPrefMuni('港区南青山'), {})
  assert.deepEqual(parseAddressPrefMuni('北区赤羽'), {})
})

test('都道府県から始まる住所は従来どおり（回帰）', () => {
  assert.deepEqual(parseAddressPrefMuni('東京都板橋区中丸町 1-2-3'), {
    region: '東京都', locality: '板橋区', town: '中丸町 1-2-3',
  })
  // 政令市は「市＋区」までを locality にする
  assert.deepEqual(parseAddressPrefMuni('北海道札幌市手稲区前田'), {
    region: '北海道', locality: '札幌市手稲区', town: '前田',
  })
  // 「京都府」を「京都」で誤停止させない
  assert.deepEqual(parseAddressPrefMuni('京都府京都市中京区'), {
    region: '京都府', locality: '京都市中京区', town: undefined,
  })
  // 空白区切りの表記ゆれ
  assert.deepEqual(parseAddressPrefMuni('大阪府 枚方市 北中振'), {
    region: '大阪府', locality: '枚方市', town: '北中振',
  })
  // 郡を含む
  assert.deepEqual(parseAddressPrefMuni('宮城県遠田郡美里町関根字堤筒 98'), {
    region: '宮城県', locality: '遠田郡美里町', town: '関根字堤筒 98',
  })
})

test('空・解釈できない文字列では何も返さない', () => {
  assert.deepEqual(parseAddressPrefMuni(undefined), {})
  assert.deepEqual(parseAddressPrefMuni(''), {})
  assert.deepEqual(parseAddressPrefMuni('住所未定'), {})
})
