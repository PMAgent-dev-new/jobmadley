import assert from 'node:assert/strict'
import test from 'node:test'
import {
  catalogHtmlToText,
  sanitizeCatalogText,
} from './catalog-text.mts'

test('sanitizeCatalogText removes age limits used as application conditions', () => {
  const source = [
    '未経験歓迎',
    '・62歳以下（定年65歳のため）',
    '普通免許をお持ちの方（60歳位迄）',
    '62歳までに入社された方は再雇用制度を利用できます。',
    '・女性・中高年（～64歳）・シニアもOKです！',
    '安全運転を大切にできる方',
  ].join('\n')
  const result = sanitizeCatalogText(source)
  assert.equal(result.clean.includes('62歳以下'), false)
  assert.equal(result.clean.includes('60歳位迄'), false)
  assert.equal(result.clean.includes('62歳までに入社'), false)
  assert.equal(result.clean.includes('女性・中高年'), false)
  assert.equal(result.clean.includes('安全運転'), true)
})

test('sanitizeCatalogText removes explicit senior recruiting phrases even with retirement context', () => {
  const source = [
    '自動車の点検整備を担当します。',
    '【６０歳以上応募歓迎（６０＠）】',
    '定年は６５歳ですが、６５歳以上の方も応募可能です。',
    '残業はありません。',
  ].join('\n')
  const result = sanitizeCatalogText(source)
  assert.equal(result.clean.includes('６０歳以上'), false)
  assert.equal(result.clean.includes('６５歳以上'), false)
  assert.equal(result.clean.includes('自動車の点検整備'), true)
  assert.equal(result.clean.includes('残業はありません'), true)
})

test('sanitizeCatalogText preserves benefit and re-employment explanations', () => {
  const source = 'こども手当は18歳まで支給します。\n定年65歳、再雇用制度で75歳まで勤務可能です。'
  const result = sanitizeCatalogText(source)
  assert.equal(result.clean.includes('18歳まで'), true)
  assert.equal(result.clean.includes('75歳まで'), true)
})

test('catalogHtmlToText removes decorative rules and empty contact labels', () => {
  const source = [
    '<p>仕事内容です。</p>',
    '<p>＝＝＝＝＝＝＝＝</p>',
    '<p>////////////////////</p>',
    '<p>////////////////////お問合せ////////////////////</p>',
    '<p>:.｡. .｡.::.｡. .｡.::.｡. .｡.:</p>',
    '<p>ご連絡先：</p>',
    '<p>対応時間：10:00～18:00</p>',
    '<p>お電話でのご応募を受け付けています。</p>',
    '<p>待遇も充実しています。</p>',
  ].join('')
  const result = catalogHtmlToText(source)
  assert.equal(result.includes('＝＝'), false)
  assert.equal(result.includes('////'), false)
  assert.equal(result.includes('ご連絡先'), false)
  assert.equal(result.includes('対応時間'), false)
  assert.equal(result.includes('.｡.'), false)
  assert.equal(result.includes('待遇も充実'), true)
})
