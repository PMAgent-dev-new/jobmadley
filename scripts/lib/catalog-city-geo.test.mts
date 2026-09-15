import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const geo = JSON.parse(
  readFileSync(new URL('../data/catalog-city-geo.json', import.meta.url), 'utf8'),
) as Record<string, [number, number]>

const coverage = JSON.parse(
  readFileSync(new URL('../data/catalog-meta-address-coverage.json', import.meta.url), 'utf8'),
) as {
  meta_upload_id: string
  error: string
  items: Array<{ id: string; geo_key: string }>
}

test('covers every external address rejected by the first full Meta import', () => {
  assert.match(coverage.meta_upload_id, /^\d+$/)
  assert.equal(coverage.error, 'MISSING_ADDRESS')
  assert.equal(coverage.items.length, 34)
  assert.equal(new Set(coverage.items.map((item) => item.id)).size, 34)
  assert.equal(new Set(coverage.items.map((item) => item.geo_key)).size, 25)

  for (const item of coverage.items) {
    assert.match(item.id, /^\d{5}-\d{8}$/)
    const coordinates = geo[item.geo_key]
    assert.ok(coordinates, `${item.geo_key}の座標がありません`)
    const [latitude, longitude] = coordinates
    assert.ok(latitude >= 20 && latitude <= 46, `${item.geo_key}の緯度が日本の範囲外です`)
    assert.ok(longitude >= 122 && longitude <= 154, `${item.geo_key}の経度が日本の範囲外です`)
  }
})
