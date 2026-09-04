import assert from 'node:assert/strict'
import { test } from 'vitest'

import { sanitizeDetailValue, EXTERNAL_DETAIL_GROUPS } from './api'

/**
 * 転載求人の詳細ページ。以前は求人票の原文をそのまま出しており、実測（23,219件）で
 *   application_docs  23,114件(99.5%) に「ハローワーク紹介状」＋住所598件＋社名382件
 *   work_content       1,880件 に出典への誘導文
 * が求職者に見えていた。出典非表示の運用方針が事実上破れていた。
 */

test('★出典への誘導文を落とす', () => {
  const out = sanitizeDetailValue(
    '＊当社自動車整備工場において、下記の業務に従事して頂きます。 ・自動車整備、修理、車検業務 【応募前職場見学可能】詳細はハローワーク窓口へ 「業務の変更範囲：変更なし」',
  )
  assert.ok(!/ハローワーク/.test(out), `出典が残った: ${out}`)
  assert.ok(out.includes('自動車整備、修理、車検業務'), `仕事内容が消えた: ${out}`)
})

test('★出典語だけを伏せて意味の通らない文を残さない', () => {
  // 「詳細は非公開窓口へ」のような文が残ると、読み手が混乱する。区切りごと消す。
  const out = sanitizeDetailValue('業務内容の説明です。詳細はハローワーク窓口へお問い合わせください。')
  assert.ok(!out.includes('窓口へ'), `文の断片が残った: ${out}`)
  assert.ok(out.includes('業務内容の説明です'), `本文が消えた: ${out}`)
})

test('★箇条書きの記号でも区切る（前の行を巻き込まない）', () => {
  // 句点だけで切ると「◆応募の際はハローワークから…」の塊に前の行が巻き込まれ、
  // 「（マイクロバス、中型車、普通車を使用）」のような必要な情報まで消える。
  const out = sanitizeDetailValue(
    '＊ジュニアスクールの送迎を行って頂きます。 （マイクロバス、中型車、普通車を使用） ＜変更の範囲：変更なし＞ ◆応募の際は、ハローワークからの紹介状の交付を受けてください。',
  )
  assert.ok(out.includes('マイクロバス'), `車種の情報が消えた: ${out}`)
  assert.ok(out.includes('変更の範囲'), `変更範囲が消えた: ${out}`)
  assert.ok(!/ハローワーク/.test(out), `出典が残った: ${out}`)
})

test('★地の文の社名は伏せるが、前後を食わない', () => {
  // corpFallback を使うと「株式会社◯◯の役員車や部長車の運転」で
  // 前後12文字を食う（#111 で直した事故と同型）。詳細項目は地の文なので使わない。
  const out = sanitizeDetailValue('株式会社ムトウ千歳支店での配送業務です。', '株式会社 ムトウ')
  assert.ok(!out.includes('ムトウ'), `社名が残った: ${out}`)
  assert.ok(out.includes('千歳支店'), `勤務地が消えた: ${out}`)
  assert.ok(out.includes('配送業務'), `職種が消えた: ${out}`)
})

test('照合できない第三者の社名では本文を変えない', () => {
  const t = '株式会社三井住友銀行の役員車や部長車の運転を担当します。'
  assert.equal(sanitizeDetailValue(t, '株式会社ダミー'), t)
})

test('出典に触れていない項目はそのまま', () => {
  const t = '年間休日 １２０日 週休二日制 毎週'
  assert.equal(sanitizeDetailValue(t), t)
})

test('★応募書類（application_docs）は表示項目から外れている', () => {
  // 99.5%に出典、598件に雇用主の住所（〒＋番地）が入っていた。
  // 内容も「紹介状を郵送してください」という直接応募の案内で、当社の応募導線と矛盾する。
  const shown = EXTERNAL_DETAIL_GROUPS.flatMap((g) => g.items.map(([col]) => col))
  assert.ok(!shown.includes('application_docs'), '応募書類が表示項目に残っている')
})
