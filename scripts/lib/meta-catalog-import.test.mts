import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { importAndVerifyMetaCatalog, importPublishedMetaCatalog } from './meta-catalog-import.mts'

test('triggers an import and verifies detected, persisted, invalid, and catalog counts', async () => {
  const requests: Array<{ url: string; method: string }> = []
  let uploadPolls = 0
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, method: init?.method || 'GET' })
    if (url.includes('/feed-1/uploads')) return Response.json({ id: '1800000000000001' })
    if (url.includes('/1800000000000001?')) {
      uploadPolls += 1
      return Response.json(uploadPolls === 1
        ? { id: '1800000000000001' }
        : {
            id: '1800000000000001',
            end_time: '2026-09-16T00:00:00+0000',
            num_detected_items: 9_032,
            num_persisted_items: 9_023,
            num_invalid_items: 9,
          })
    }
    if (url.includes('/catalog-1?')) return Response.json({ product_count: 9_023 })
    return Response.json({ error: { message: 'unexpected' } }, { status: 400 })
  }) as typeof fetch

  const result = await importAndVerifyMetaCatalog({
    accessToken: 'test-token',
    feedId: 'feed-1',
    catalogId: 'catalog-1',
    feedUrl: 'https://example.com/feed.tsv',
    expectedProducts: 9_032,
    maxInvalidItems: 9,
    pollIntervalMs: 0,
    fetchImpl,
    wait: async () => {},
  })
  assert.equal(result.num_persisted_items, 9_023)
  assert.deepEqual(requests.map((request) => request.method), ['POST', 'GET', 'GET', 'GET'])
})

test('fails when Meta detects a different product count', async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/uploads')) return Response.json({ id: '1800000000000002' })
    return Response.json({
      id: '1800000000000002',
      end_time: '2026-09-16T00:00:00+0000',
      num_detected_items: 9_031,
      num_persisted_items: 9_022,
      num_invalid_items: 9,
    })
  }) as typeof fetch
  await assert.rejects(
    importAndVerifyMetaCatalog({
      accessToken: 'test-token',
      feedId: 'feed-2',
      catalogId: 'catalog-2',
      feedUrl: 'https://example.com/feed.tsv',
      expectedProducts: 9_032,
      maxInvalidItems: 9,
      pollIntervalMs: 0,
      maxPolls: 1,
      fetchImpl,
      wait: async () => {},
    }),
    /取込件数が一致しません/,
  )
})

test('rejects a published feed that does not match its completion marker before calling Meta', async () => {
  const primary = Buffer.from('id\ttitle\njob-1\tMechanic\n')
  let metaCalled = false
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    metaCalled = true
    return Response.json({ id: '1800000000000003' })
  }) as typeof fetch
  try {
    await assert.rejects(
      importPublishedMetaCatalog({
        storage: {
          read: async () => Buffer.from(JSON.stringify({
            products: 1,
            primary_sha256: createHash('sha256').update(primary).digest('hex'),
            primary_bytes: primary.byteLength,
          })),
          readPublic: async () => Buffer.from('different feed'),
          publicUrl: () => 'https://example.com/feed.tsv',
        },
        accessToken: 'test-token',
        feedId: 'feed-3',
        catalogId: 'catalog-3',
      }),
      /公開完了マーカーと一次フィードが一致しません/,
    )
    assert.equal(metaCalled, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
