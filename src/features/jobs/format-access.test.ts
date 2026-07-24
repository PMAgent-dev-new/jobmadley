import assert from 'node:assert/strict'
import test from 'node:test'

import { formatAccessLines } from './format-access'

test('microCMSで入力された箇条書き記号を取り除く', () => {
  assert.deepEqual(
    formatAccessLines(
      '・東急東横線「綱島駅」から徒歩で約15分\n・東急東横線「大倉山駅」から徒歩で約18分',
    ),
    [
      '東急東横線「綱島駅」から徒歩で約15分',
      '東急東横線「大倉山駅」から徒歩で約18分',
    ],
  )
})

test('CRLF、重複した記号、空行を正規化する', () => {
  assert.deepEqual(
    formatAccessLines('・・1行目\r\n\r\n • 2行目\r\n記号なし'),
    ['1行目', '2行目', '記号なし'],
  )
})
