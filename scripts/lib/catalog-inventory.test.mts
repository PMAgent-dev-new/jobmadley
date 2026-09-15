import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareCatalogInventoryDrop,
  compareCatalogInventoryExact,
  validateCatalogInventoryShape,
  type CatalogInventory,
} from './catalog-inventory.mts'

const baseline: CatalogInventory = {
  products: 9_351,
  externalProducts: 8_039,
  ownedProducts: 1_312,
  mechanicProducts: 8_905,
}

test('catalog inventory accepts a consistent complete inventory', () => {
  assert.deepEqual(validateCatalogInventoryShape(baseline), [])
  assert.deepEqual(compareCatalogInventoryExact(baseline, baseline), [])
})

test('catalog inventory rejects a missing owned-job subset', () => {
  const current = { ...baseline, products: 8_039, ownedProducts: 0, mechanicProducts: 8_039 }
  const issues = compareCatalogInventoryExact(current, baseline)
  assert.ok(issues.some((issue) => issue.includes('全商品')))
  assert.ok(issues.some((issue) => issue.includes('自社求人')))
  assert.ok(issues.some((issue) => issue.includes('整備士商品')))
})

test('catalog inventory rejects a source-total mismatch', () => {
  const current = { ...baseline, products: 9_350 }
  assert.ok(validateCatalogInventoryShape(current).some((issue) => issue.includes('データソース別件数')))
})

test('catalog inventory rejects a 30 percent drop but allows a smaller change', () => {
  const blocked = {
    products: Math.floor(baseline.products * 0.7),
    externalProducts: Math.floor(baseline.externalProducts * 0.7),
    ownedProducts: Math.floor(baseline.ownedProducts * 0.7),
    mechanicProducts: Math.floor(baseline.mechanicProducts * 0.7),
  }
  assert.equal(compareCatalogInventoryDrop(blocked, baseline, 0.3).length, 4)
  assert.deepEqual(compareCatalogInventoryDrop({ ...baseline, products: 9_000 }, baseline, 0.3), [])
})
