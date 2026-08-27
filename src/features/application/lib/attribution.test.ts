import assert from 'node:assert/strict'
import { test } from 'vitest'

import { touchFromReferrer } from './attribution'

/**
 * この判定は form_applicant（ridejob.jp/entry）と `rj_attr` Cookie を共有しており、
 * 片方が違う値を書くともう片方がそれを読んで集計する。挙動の一致をここで固定する。
 */

const HOST = 'ridejob.jp'

test('AndroidのYouTubeアプリが「Google自然検索」にならない', () => {
  // パッケージ名 com.google.android.youtube が検索エンジン判定の
  // /(^|\.)google\./ にマッチしていた。自然検索KPIに他チャネルが混ざる。
  assert.deepEqual(touchFromReferrer('android-app://com.google.android.youtube/', HOST), {
    source: 'youtube.com',
    medium: 'referral',
  })
})

test('アプリ経由とブラウザ経由で同じ値になる（集計で行が割れない）', () => {
  assert.deepEqual(
    touchFromReferrer('android-app://com.google.android.youtube/', HOST),
    touchFromReferrer('https://www.youtube.com/', HOST),
  )
})

test('Google検索アプリは organic のまま', () => {
  assert.deepEqual(touchFromReferrer('android-app://com.google.android.googlequicksearchbox/', HOST), {
    source: 'google',
    medium: 'organic',
  })
})

test('未知のアプリはパッケージ名のまま referral', () => {
  assert.deepEqual(touchFromReferrer('android-app://com.example.unknown/', HOST), {
    source: 'com.example.unknown',
    medium: 'referral',
  })
})

test('通常の検索エンジン・自ドメイン判定は従来どおり', () => {
  assert.deepEqual(touchFromReferrer('https://www.google.co.jp/search?q=a', HOST), {
    source: 'google',
    medium: 'organic',
  })
  assert.equal(touchFromReferrer('https://ridejob.jp/jobs/tokyo', HOST), undefined)
  assert.equal(touchFromReferrer('', HOST), undefined)
  assert.equal(touchFromReferrer('not a url', HOST), undefined)
})
