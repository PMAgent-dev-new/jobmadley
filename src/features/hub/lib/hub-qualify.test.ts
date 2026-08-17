import assert from 'node:assert/strict'
import { test } from 'vitest'

import { hubQualifies, hubLinkCount, prefCatKey, externalHubKey } from './hub-qualify'

/**
 * 「sitemap に載る集合」と「親ハブがリンクする集合」がズレると、
 * 転載だけで成立するハブが孤立する（本番実測で268本中203本）。
 * 判定が1つであることをここで固定する。
 */

const PREF = { id: 'p1', region: '北海道' }
const CAT = { id: 'c1', slug: 'truck-driver' }

const matrixWith = (n: number) => ({ [prefCatKey(PREF.id, CAT.id)]: n })
const externalWith = (n: number) => ({ [externalHubKey(PREF.region, CAT.slug)]: n })

test('自社がしきい値以上なら成立する（転載0でも）', () => {
  assert.equal(hubQualifies(matrixWith(5), {}, PREF, CAT), true)
  assert.equal(hubQualifies(matrixWith(4), {}, PREF, CAT), false)
})

test('自社が足りなくても転載がしきい値以上なら成立する（ここが抜けて203本が孤立した）', () => {
  assert.equal(hubQualifies(matrixWith(0), externalWith(20), PREF, CAT), true)
  assert.equal(hubQualifies(matrixWith(0), externalWith(19), PREF, CAT), false)
})

test('リンクの件数は自社＋転載。遷移先ページの掲載件数と一致させる', () => {
  assert.equal(hubLinkCount(matrixWith(88), externalWith(423), PREF, CAT), 511)
  assert.equal(hubLinkCount(matrixWith(0), externalWith(20), PREF, CAT), 20)
  assert.equal(hubLinkCount(matrixWith(5), {}, PREF, CAT), 5)
})

test('転載マトリクスが空（Supabase障害）でも落ちず、自社だけで判定する', () => {
  assert.equal(hubQualifies(matrixWith(5), {}, PREF, CAT), true)
  assert.equal(hubQualifies(matrixWith(0), {}, PREF, CAT), false)
  assert.equal(hubLinkCount(matrixWith(5), {}, PREF, CAT), 5)
})

test('県と職種の組が違えば別キーとして扱う（キーの取り違えを防ぐ）', () => {
  const counts = { '北海道|truck-driver': 50, '東京都|truck-driver': 900 }
  assert.equal(hubLinkCount(matrixWith(0), counts, PREF, CAT), 50)
  assert.equal(hubLinkCount(matrixWith(0), counts, { id: 'p1', region: '青森県' }, CAT), 0)
})
