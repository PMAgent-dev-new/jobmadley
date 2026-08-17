import assert from 'node:assert/strict'
import { test } from 'vitest'

import { buildInventoryBreakdown } from './inventory'

/**
 * index されるページに出る数字なので、壊れ方を実際に踏んだ形で固定する。
 * この領域は件数・給与の表示だけで4回壊れている。
 */

const job = (salaryMin: number, wageType?: string, tags: string[] = []) => ({
  salaryMin,
  wageType: wageType ? [wageType] : [],
  tags: tags.map((name) => ({ name })),
})

const monthly = (n: number, amount = 250000) => Array.from({ length: n }, () => job(amount, '月給'))

test('年収求人が月給に混ざらない（wageType未設定も月給と見なさない）', () => {
  // 実データで踏んだ事故: wageType未設定の年収400万円が月給の最大値になり
  // 「月給17万円〜400万円」が描画された
  const jobs = [...monthly(20, 250000), job(4_000_000), job(4_000_000, '年俸')]
  const r = buildInventoryBreakdown(jobs, '営業')
  assert.equal(r.salary?.sampleSize, 20)
  assert.equal(r.salary?.median, 250000)
  assert.match(r.salary!.text, /中央値は25万円です/)
  // レンジは出さない（1件の外れ値で壊れるため）
  assert.doesNotMatch(r.salary!.text, /〜/)
})

test('中央値は外れ値で動かない', () => {
  const jobs = [...monthly(20, 250000), ...monthly(1, 5_000_000)]
  assert.equal(buildInventoryBreakdown(jobs, 'x').salary?.median, 250000)
})

test('母数が10件未満なら給与を出さない', () => {
  assert.equal(buildInventoryBreakdown(monthly(9), 'x').salary, undefined)
  assert.notEqual(buildInventoryBreakdown(monthly(10), 'x').salary, undefined)
})

test('母数が10件未満なら割合を出さない（4件で100%と出ていた）', () => {
  const few = Array.from({ length: 4 }, () => job(250000, '月給', ['駅徒歩10分以内']))
  const r = buildInventoryBreakdown(few, 'バックオフィス')
  assert.equal(r.totalJobs, 4)
  assert.equal(r.conditions[0].count, 4)
  assert.equal(r.conditions[0].share, undefined)
})

test('割合の分母はこの内訳の母数（表に出す数字と一致する）', () => {
  const jobs = [
    ...Array.from({ length: 30 }, () => job(250000, '月給', ['社員寮あり'])),
    ...monthly(70),
  ]
  const r = buildInventoryBreakdown(jobs, 'x')
  assert.equal(r.totalJobs, 100)
  assert.equal(r.conditions[0].share, 30)
})

test('3件未満のタグは出さない。多い順に最大8件', () => {
  const jobs = [
    ...Array.from({ length: 2 }, () => job(250000, '月給', ['まれな条件'])),
    ...Array.from({ length: 20 }, (_, i) => job(250000, '月給', ['よくある条件', `条件${i % 9}`])),
  ]
  const r = buildInventoryBreakdown(jobs, 'x')
  assert.equal(r.conditions.some((c) => c.name === 'まれな条件'), false)
  assert.equal(r.conditions[0].name, 'よくある条件')
  assert.ok(r.conditions.length <= 8)
})

test('label は文中にそのまま出る（県×職種では地域込みで渡す）', () => {
  const r = buildInventoryBreakdown(monthly(10), '東京都のタクシードライバー')
  assert.match(r.salary!.text, /東京都のタクシードライバー求人10件/)
})

test('求人0件でも落ちない', () => {
  const r = buildInventoryBreakdown([], 'x')
  assert.deepEqual(r, { totalJobs: 0, salary: undefined, conditions: [] })
})
