import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCatalogLink, isCatalogLinkRoutedCorrectly } from './catalog-link.mts'

const LEGACY = (id: string) =>
  `https://ridejob.jp/job/${id}?utm_content=${id}&utm_source=meta&utm_medium=catalog`

test('sends mechanic jobs to the /entry/mechanic form with job_id and no utm of its own', () => {
  const link = buildCatalogLink('56e8k1g95', 'mechanic')
  assert.equal(link, 'https://ridejob.jp/entry/mechanic?job_id=56e8k1g95')
  // utm は広告側 url_tags に一本化する（二重キーで form 側の帰属がぶれるのを防ぐ）
  assert.ok(!link.includes('utm_'))
})

test('keeps every non-mechanic category byte-identical to the legacy /job/{id} link', () => {
  for (const category of ['taxi', 'hire', 'dispatch', 'other', '', 'unknown-category']) {
    assert.equal(buildCatalogLink('017t2kbusv', category), LEGACY('017t2kbusv'))
  }
})

test('does not change real microCMS ids (letters, digits, hyphen, underscore)', () => {
  for (const id of ['cs80efl2jr-h', '088869y_0y_r', '0_--ak8mnzi']) {
    assert.equal(buildCatalogLink(id, 'taxi'), LEGACY(id))
    assert.equal(buildCatalogLink(id, 'mechanic'), `https://ridejob.jp/entry/mechanic?job_id=${id}`)
  }
})

test('encodes anything unsafe in the id', () => {
  assert.equal(buildCatalogLink('a&b', 'mechanic'), 'https://ridejob.jp/entry/mechanic?job_id=a%26b')
})

test('flags rows whose link does not match their category', () => {
  assert.ok(isCatalogLinkRoutedCorrectly('x1', 'mechanic', 'https://ridejob.jp/entry/mechanic?job_id=x1'))
  assert.ok(isCatalogLinkRoutedCorrectly('x1', 'taxi', LEGACY('x1')))
  // 整備士が旧リンクのまま／タクシーが整備士フォームに行く、はどちらも不正
  assert.ok(!isCatalogLinkRoutedCorrectly('x1', 'mechanic', LEGACY('x1')))
  assert.ok(!isCatalogLinkRoutedCorrectly('x1', 'taxi', 'https://ridejob.jp/entry/mechanic?job_id=x1'))
})
