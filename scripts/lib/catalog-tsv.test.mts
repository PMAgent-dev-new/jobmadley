import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCatalogTsv } from './catalog-tsv.mts'

test('parses quoted tabs, quotes and embedded newlines as one product row', () => {
  const rows = parseCatalogTsv([
    'id\tdescription\tlink',
    '1\t"first line\nsecond\tline with ""quote"""\thttps://ridejob.jp/job/1',
    '2\tplain\thttps://ridejob.jp/external-job/hellowork/13010-12345678',
  ].join('\n'))
  assert.deepEqual(rows, [
    ['id', 'description', 'link'],
    ['1', 'first line\nsecond\tline with "quote"', 'https://ridejob.jp/job/1'],
    ['2', 'plain', 'https://ridejob.jp/external-job/hellowork/13010-12345678'],
  ])
})

test('fails closed for an unterminated quoted field', () => {
  assert.throws(() => parseCatalogTsv('id\tdescription\n1\t"broken'), /閉じていません/)
})
