export type CatalogInventory = {
  products: number
  externalProducts: number
  ownedProducts: number
  mechanicProducts: number
}

const LABELS: Record<keyof CatalogInventory, string> = {
  products: '全商品',
  externalProducts: '外部求人',
  ownedProducts: '自社求人',
  mechanicProducts: '整備士商品',
}

const KEYS = Object.keys(LABELS) as (keyof CatalogInventory)[]

export function validateCatalogInventoryShape(inventory: CatalogInventory): string[] {
  const issues: string[] = []
  for (const key of KEYS) {
    const value = inventory[key]
    if (!Number.isSafeInteger(value) || value < 0) {
      issues.push(`${LABELS[key]}件数が不正です: ${String(value)}`)
    }
  }
  if (inventory.externalProducts + inventory.ownedProducts !== inventory.products) {
    issues.push(
      `全商品とデータソース別件数が一致しません: products=${inventory.products}`
      + ` external=${inventory.externalProducts} owned=${inventory.ownedProducts}`,
    )
  }
  if (inventory.mechanicProducts > inventory.products) {
    issues.push(
      `整備士商品が全商品を超えています: mechanic=${inventory.mechanicProducts} products=${inventory.products}`,
    )
  }
  return issues
}

export function compareCatalogInventoryExact(
  current: CatalogInventory,
  expected: CatalogInventory,
): string[] {
  return KEYS.flatMap((key) => current[key] === expected[key]
    ? []
    : [`${LABELS[key]}が初回公開の期待値と一致しません: expected=${expected[key]} current=${current[key]}`])
}

export function compareCatalogInventoryDrop(
  current: CatalogInventory,
  previous: CatalogInventory,
  maxDropRatio: number,
): string[] {
  return KEYS.flatMap((key) => {
    const prior = previous[key]
    if (prior <= 0) return []
    const minimum = Math.floor(prior * (1 - maxDropRatio))
    return current[key] <= minimum
      ? [
        `${LABELS[key]}が前回比で急減しました: previous=${prior} current=${current[key]}`
        + ` max_drop_ratio=${maxDropRatio}`,
      ]
      : []
  })
}
