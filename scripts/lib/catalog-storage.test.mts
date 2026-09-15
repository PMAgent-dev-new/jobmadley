import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeCatalogObjectPath,
  SupabaseCatalogStorage,
} from './catalog-storage.mts'

test('publicUrl preserves directories and encodes filenames', () => {
  const storage = new SupabaseCatalogStorage({
    url: 'https://example.supabase.co/',
    serviceRoleKey: 'secret',
    bucket: 'meta-catalog',
  })
  assert.equal(
    storage.publicUrl('catalog/images/v5/求人 1.jpg'),
    'https://example.supabase.co/storage/v1/object/public/meta-catalog/catalog/images/v5/%E6%B1%82%E4%BA%BA%201.jpg',
  )
})

test('object path rejects traversal and empty segments', () => {
  assert.throws(() => normalizeCatalogObjectPath('../secret'), /不正/)
  assert.throws(() => normalizeCatalogObjectPath('catalog//feed.tsv'), /不正/)
  assert.throws(() => normalizeCatalogObjectPath(''), /不正/)
})

test('listDirectory paginates and returns public object URLs', async (t) => {
  const originalFetch = globalThis.fetch
  const offsets: number[] = []
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { offset: number }
    offsets.push(body.offset)
    const page = body.offset === 0
      ? Array.from({ length: 1_000 }, (_, index) => ({
        id: `id-${index}`,
        name: `${String(index).padStart(4, '0')}.jpg`,
        metadata: { size: 10, mimetype: 'image/jpeg' },
      }))
      : [{ id: 'last', name: '1000.jpg', metadata: { size: 11 } }]
    return new Response(JSON.stringify(page), { status: 200 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const storage = new SupabaseCatalogStorage({
    url: 'https://example.supabase.co',
    serviceRoleKey: 'secret',
  })
  const files = await storage.listDirectory('catalog/images/v5')
  assert.deepEqual(offsets, [0, 1_000])
  assert.equal(files.length, 1_001)
  assert.equal(files.at(-1)?.pathname, 'catalog/images/v5/1000.jpg')
  assert.equal(files[0].contentType, 'image/jpeg')
  assert.match(files[0].url, /\/storage\/v1\/object\/public\/meta-catalog\//)
})

test('put uses deterministic public URL and explicit upsert/cache settings', async (t) => {
  const originalFetch = globalThis.fetch
  let request: Request | undefined
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init)
    return new Response(JSON.stringify({ Key: 'meta-catalog/catalog/feed.tsv' }), { status: 200 })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const storage = new SupabaseCatalogStorage({
    url: 'https://example.supabase.co',
    serviceRoleKey: 'secret',
  })
  const result = await storage.put('catalog/feed.tsv', 'body', {
    contentType: 'text/tab-separated-values; charset=utf-8',
    upsert: true,
    cacheControl: 0,
  })
  assert.equal(request?.method, 'POST')
  assert.equal(request?.headers.get('x-upsert'), 'true')
  assert.equal(request?.headers.get('cache-control'), 'max-age=0')
  assert.equal(result.url, 'https://example.supabase.co/storage/v1/object/public/meta-catalog/catalog/feed.tsv')
})
