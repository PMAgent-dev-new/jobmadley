import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import {
  canonicalImageSource,
  catalogImagePath,
  renderCatalogCreative,
  type CatalogImageSpec,
} from './catalog-images.mts'

const spec: CatalogImageSpec = {
  id: 'job-001',
  sourceUrl: 'https://example.com/image.png',
  fallbackSourceUrl: 'https://example.com/fallback.png',
  category: 'taxi',
  title: '配車アプリ導入で働きやすいタクシードライバー',
  salary: '月給25万円',
  location: '東京都港区',
  employmentType: '正社員',
}

test('canonicalImageSource removes transformations and fragments', () => {
  assert.equal(
    canonicalImageSource('https://example.com/image.png?w=900&h=600#preview'),
    'https://example.com/image.png',
  )
  assert.equal(canonicalImageSource('/relative/image.png'), '')
})

test('catalogImagePath is stable and changes with job-specific content', () => {
  assert.equal(catalogImagePath(spec), catalogImagePath({ ...spec }))
  assert.notEqual(catalogImagePath(spec), catalogImagePath({ ...spec, id: 'job-002' }))
  assert.notEqual(catalogImagePath(spec), catalogImagePath({ ...spec, salary: '月給30万円' }))
})

test('renderCatalogCreative produces a native 1080x1080 JPEG with an information panel', async () => {
  const source = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: { r: 31, g: 31, b: 255 },
    },
  }).png().toBuffer()

  const output = await renderCatalogCreative(source, spec)
  const meta = await sharp(output).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
  assert.equal(meta.format, 'jpeg')
  assert.ok(output.byteLength < 8 * 1024 * 1024)

  const panelPixel = await sharp(output).extract({ left: 10, top: 730, width: 1, height: 1 }).raw().toBuffer()
  assert.ok(panelPixel[2] > panelPixel[0], 'information panel should start with the blue RIDEJOB band')
})
