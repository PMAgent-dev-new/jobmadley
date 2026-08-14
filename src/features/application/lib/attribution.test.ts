import assert from 'node:assert/strict'
import { test } from 'vitest'

import { touchFromReferrer } from './attribution'

test('検索エンジンからの参照は organic として判定する', () => {
  assert.deepEqual(touchFromReferrer('https://www.google.com/', 'ridejob.jp'), {
    source: 'google',
    medium: 'organic',
  })
  assert.deepEqual(touchFromReferrer('https://www.google.co.jp/search?q=%E6%B1%82%E4%BA%BA', 'ridejob.jp'), {
    source: 'google',
    medium: 'organic',
  })
  assert.deepEqual(touchFromReferrer('https://search.yahoo.co.jp/search', 'ridejob.jp'), {
    source: 'yahoo',
    medium: 'organic',
  })
  assert.deepEqual(touchFromReferrer('https://www.bing.com/', 'ridejob.jp'), {
    source: 'bing',
    medium: 'organic',
  })
})

test('自サイト内の遷移は流入として扱わない（direct を維持）', () => {
  assert.equal(touchFromReferrer('https://ridejob.jp/jobs/tokyo/taxi-driver', 'ridejob.jp'), undefined)
  // サブドメインからの遷移も自サイト扱い
  assert.equal(touchFromReferrer('https://www.ridejob.jp/media/blog/x', 'ridejob.jp'), undefined)
  // 現ホストが www 付きでも同じ
  assert.equal(touchFromReferrer('https://ridejob.jp/', 'www.ridejob.jp'), undefined)
})

test('referrer が無い/壊れている場合は undefined', () => {
  assert.equal(touchFromReferrer('', 'ridejob.jp'), undefined)
  assert.equal(touchFromReferrer('not-a-url', 'ridejob.jp'), undefined)
})

test('その他の外部サイトは referral として判定し www を除去する', () => {
  assert.deepEqual(touchFromReferrer('https://www.example.com/page', 'ridejob.jp'), {
    source: 'example.com',
    medium: 'referral',
  })
})
