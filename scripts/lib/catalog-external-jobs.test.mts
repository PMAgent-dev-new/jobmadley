import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertExternalSourcePublishable,
  isExternalSourceFresh,
  isHelloworkExpired,
  type ExternalCatalogJob,
} from './catalog-external-jobs.mts'

test('isHelloworkExpired compares the end date in JST', () => {
  assert.equal(
    isHelloworkExpired('9月15日', '2026-09-14T19:00:00Z', new Date('2026-09-15T14:59:59Z')),
    false,
  )
  assert.equal(
    isHelloworkExpired('9月15日', '2026-09-14T19:00:00Z', new Date('2026-09-15T15:00:00Z')),
    true,
  )
})

test('isHelloworkExpired resolves dates across the year boundary', () => {
  assert.equal(
    isHelloworkExpired('1月31日', '2026-12-20T00:00:00Z', new Date('2027-01-01T00:00:00Z')),
    false,
  )
})

test('isHelloworkExpired fails closed for an invalid date', () => {
  assert.equal(isHelloworkExpired('', '2026-09-15T00:00:00Z'), true)
  assert.equal(isHelloworkExpired('不明', '2026-09-15T00:00:00Z'), true)
  assert.equal(isHelloworkExpired('2月31日', '2026-02-20T00:00:00Z'), true)
})

test('isExternalSourceFresh requires every source row to be within the freshness window', () => {
  const sample = [{ lastSeen: '2026-09-15T00:00:00Z' }] as ExternalCatalogJob[]
  assert.equal(isExternalSourceFresh(sample, new Date('2026-09-16T05:59:59Z')), true)
  assert.equal(isExternalSourceFresh(sample, new Date('2026-09-16T06:00:01Z')), false)
  assert.equal(isExternalSourceFresh([
    { lastSeen: '2026-09-16T04:00:00Z' },
    { lastSeen: '2026-09-14T00:00:00Z' },
  ] as ExternalCatalogJob[], new Date('2026-09-16T05:00:00Z')), false)
  assert.equal(isExternalSourceFresh([
    { lastSeen: '2026-09-16T04:00:00Z' },
    { lastSeen: '2026-09-15T12:00:00Z' },
  ] as ExternalCatalogJob[], new Date('2026-09-16T05:00:00Z')), false)
  assert.equal(isExternalSourceFresh([
    { lastSeen: '2099-01-01T00:00:00Z' },
  ] as ExternalCatalogJob[], new Date('2026-09-16T05:00:00Z')), false)
})

test('stale or partially refreshed external data cannot be published', () => {
  assert.doesNotThrow(() => assertExternalSourcePublishable(true, '2026-09-15T15:45:44Z'))
  assert.throws(
    () => assertExternalSourcePublishable(false, '2026-09-14T15:45:44Z'),
    /全国同期が未完了または古い/,
  )
})
