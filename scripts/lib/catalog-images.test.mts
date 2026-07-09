import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import {
  canonicalImageSource,
  catalogImagePath,
  renderSquareCatalogImage,
} from './catalog-images.mts'

test('canonicalImageSource removes transformations and fragments', () => {
  assert.equal(
    canonicalImageSource('https://example.com/image.png?w=900&h=600#preview'),
    'https://example.com/image.png',
  )
  assert.equal(canonicalImageSource('/relative/image.png'), '')
})

test('catalogImagePath is stable and changes with the source asset', () => {
  assert.equal(catalogImagePath('https://example.com/a.png?w=1'), catalogImagePath('https://example.com/a.png?w=2'))
  assert.notEqual(catalogImagePath('https://example.com/a.png'), catalogImagePath('https://example.com/b.png'))
})

test('renderSquareCatalogImage produces a native 1080x1080 JPEG', async () => {
  const source = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: { r: 31, g: 31, b: 255 },
    },
  }).png().toBuffer()

  const output = await renderSquareCatalogImage(source)
  const meta = await sharp(output).metadata()
  assert.equal(meta.width, 1080)
  assert.equal(meta.height, 1080)
  assert.equal(meta.format, 'jpeg')
  assert.ok(output.byteLength < 8 * 1024 * 1024)
})
