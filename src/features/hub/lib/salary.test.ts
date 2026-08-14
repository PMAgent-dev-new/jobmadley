import assert from 'node:assert/strict'
import { test } from 'vitest'

import { summarizeSalary } from './salary'

/**
 * 件数と給与統計はこれで3度目の修正（min-maxの外れ値・母数不足・縮退帯）なので、
 * 壊れやすい3点を固定する。
 */

test('母数10件以上は第1〜第3四分位の中心帯を出す（外れ値に引っ張られない）', () => {
  // 歩合の理論値110万円と最低の18万円が1件ずつ混ざっても中心帯は動かない。
  // min-maxで集計していた頃はこれが「月給18万円〜110万円」になっていた（東京都ハブ）
  const mins = [180000, ...Array.from({ length: 11 }, () => 230000), 1100000]
  assert.equal(summarizeSalary(mins).salaryText, '月給23万円前後')
})

test('帯が開いていれば「〜」で出す', () => {
  const mins = [200000, 210000, 220000, 230000, 240000, 250000, 260000, 270000, 280000, 300000]
  assert.equal(summarizeSalary(mins).salaryText, '月給22万円〜27万円')
})

test('下限額が横並びなら「前後」に畳む。判定は丸めた後で行う', () => {
  // 生値は全て異なるが yen() の丸めではどちらも24万円。生値比較だと縮退帯が素通りしていた
  const mins = [234000, 234500, 236000, 238000, 240000, 241000, 242000, 243000, 243500, 244000]
  assert.equal(summarizeSalary(mins).salaryText, '月給24万円前後')
})

test('母数が閾値未満なら出さない。minSample で下限を外せる（会社ページ用）', () => {
  const four = [250000, 250000, 250000, 250000]
  assert.equal(summarizeSalary(four).salaryText, undefined)
  assert.equal(summarizeSalary(four).salaryMedian, undefined)
  assert.equal(summarizeSalary(four, 1).salaryText, '月給25万円前後')
  // 5〜9件は中央値で残す（情報を消すより中央値）
  assert.equal(summarizeSalary([...four, 250000]).salaryText, '月給25万円前後')
})

test('0件でも落ちない', () => {
  assert.deepEqual(summarizeSalary([]), { salarySampleSize: 0 })
})

test('引数の配列を破壊しない（呼び出し側が並び順に依存しても壊さない）', () => {
  const mins = [300000, 100000, 200000]
  summarizeSalary(mins)
  assert.deepEqual(mins, [300000, 100000, 200000])
})
