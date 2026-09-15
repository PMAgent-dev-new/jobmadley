import { catalogStorageFromEnv } from './lib/catalog-storage.mts'
import { importPublishedMetaCatalog } from './lib/meta-catalog-import.mts'

const storage = catalogStorageFromEnv({ required: true })!
const accessToken = process.env.META_ACCESS_TOKEN_WRITE || ''
const feedId = process.env.CATALOG_META_FEED_ID || ''
const catalogId = process.env.CATALOG_META_CATALOG_ID || ''
const result = await importPublishedMetaCatalog({
  storage,
  accessToken,
  feedId,
  catalogId,
  maxInvalidItems: Number(process.env.CATALOG_META_MAX_INVALID_ITEMS || 0),
})
console.log(
  `[meta-catalog] verified upload_id=${result.id}`
  + ` detected=${result.num_detected_items}`
  + ` persisted=${result.num_persisted_items}`
  + ` invalid=${result.num_invalid_items}`,
)
