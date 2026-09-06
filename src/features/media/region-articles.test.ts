import assert from 'node:assert/strict'
import { test } from 'vitest'

import { orderArticlesForRegion, prefectureInTitle } from './region-articles'

/**
 * ハブに出す関連記事の地域フィルタ。
 *
 * 2026-09-06 の本番実測で、/jobs/tokyo の見出し「東京都の仕事を知る・役立つ記事」の
 * 直下に「大阪府の送迎ドライバー求人データ」が並んでいた。記事は公開日順で引いている
 * だけなので、地域を見ないと他県の記事が普通に混ざる。
 */

const a = (title: string) => ({ title })

test('タイトルから都道府県を拾う', () => {
  assert.equal(prefectureInTitle('大阪府の送迎ドライバー求人データ【2026年7月集計】'), '大阪府')
  assert.equal(prefectureInTitle('東京のロボタクシーはいつ・どこで乗れる？'), '東京都')
  assert.equal(prefectureInTitle('普通免許で運転できるトラックは何トンまで？'), undefined)
})

test('★長い名前を先に見る（「東京」が「東京都」を横取りしない）', () => {
  // 短い形から探すと、京都府の記事が「京都」で拾われる前に
  // 「東京」を含む文字列が誤判定されうる。
  assert.equal(prefectureInTitle('京都府のタクシー求人'), '京都府')
  assert.equal(prefectureInTitle('東京都のタクシー求人'), '東京都')
})

test('★他県の記事を出さない（本番で起きていた事故）', () => {
  const out = orderArticlesForRegion(
    [a('大阪府の送迎ドライバー求人データ'), a('コンビニ配送ドライバーの仕事')],
    '東京都',
  )
  assert.deepEqual(out.map((x) => x.title), ['コンビニ配送ドライバーの仕事'])
})

test('自県の記事は先頭に来る', () => {
  const out = orderArticlesForRegion(
    [a('コンビニ配送ドライバーの仕事'), a('東京のロボタクシーはいつ乗れる？')],
    '東京都',
  )
  assert.equal(out[0].title, '東京のロボタクシーはいつ乗れる？')
})

test('地域に触れていない記事はどの県でも出る', () => {
  const arts = [a('普通免許で運転できるトラックは何トンまで？'), a('自動車整備士の転職ガイド')]
  assert.equal(orderArticlesForRegion(arts, '鳥取県').length, 2)
  assert.equal(orderArticlesForRegion(arts, '沖縄県').length, 2)
})

test('★全国ハブでは県名を含む記事をすべて落とす', () => {
  // 「送迎ドライバー（全国）」の1枚目が大阪の記事、という状態を防ぐ。
  const out = orderArticlesForRegion(
    [a('大阪府の送迎ドライバー求人データ'), a('東京のロボタクシー'), a('コンビニ配送ドライバーの仕事')],
    undefined,
  )
  assert.deepEqual(out.map((x) => x.title), ['コンビニ配送ドライバーの仕事'])
})
