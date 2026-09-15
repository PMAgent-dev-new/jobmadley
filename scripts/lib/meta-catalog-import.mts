export type MetaCatalogImportResult = {
  id: string
  end_time?: string
  num_detected_items?: number
  num_persisted_items?: number
  num_invalid_items?: number
}

type ImportOptions = {
  accessToken: string
  feedId: string
  catalogId: string
  feedUrl: string
  expectedProducts: number
  maxInvalidItems?: number
  pollIntervalMs?: number
  maxPolls?: number
  fetchImpl?: typeof fetch
  wait?: (milliseconds: number) => Promise<void>
}

const GRAPH_VERSION = 'v23.0'

function positiveInteger(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label}が不正です: ${String(value)}`)
  return parsed
}

async function graphJson(
  fetchImpl: typeof fetch,
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetchImpl(
    `https://graph.facebook.com/${GRAPH_VERSION}/${path}${separator}access_token=${encodeURIComponent(accessToken)}`,
    { ...init, signal: AbortSignal.timeout(30_000) },
  )
  const body = await response.json() as Record<string, unknown>
  if (!response.ok || body.error) {
    throw new Error(`Meta Graph APIが失敗しました: HTTP ${response.status}`)
  }
  return body
}

/** 固定URLを即時再取得させ、取込件数とCatalog反映件数まで確認する。 */
export async function importAndVerifyMetaCatalog(options: ImportOptions): Promise<MetaCatalogImportResult> {
  const {
    accessToken,
    feedId,
    catalogId,
    feedUrl,
    expectedProducts,
    maxInvalidItems = 0,
    pollIntervalMs = 30_000,
    maxPolls = 90,
    fetchImpl = fetch,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = options
  if (!accessToken || !feedId || !catalogId || !/^https:\/\//.test(feedUrl)) {
    throw new Error('Metaカタログ即時取込の設定が不足しています')
  }
  positiveInteger(expectedProducts, '期待商品数')
  positiveInteger(maxInvalidItems, '許容無効商品数')

  const form = new URLSearchParams({ url: feedUrl })
  const started = await graphJson(fetchImpl, `${feedId}/uploads`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const uploadId = String(started.id || '')
  if (!/^\d+$/.test(uploadId)) throw new Error('Metaカタログ取込IDを取得できません')

  let completed: MetaCatalogImportResult | null = null
  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const result = await graphJson(
      fetchImpl,
      `${uploadId}?fields=id,start_time,end_time,num_detected_items,num_persisted_items,num_invalid_items`,
      accessToken,
    ) as MetaCatalogImportResult
    if (result.end_time) {
      completed = result
      break
    }
    if (poll < maxPolls) await wait(pollIntervalMs)
  }
  if (!completed) throw new Error(`Metaカタログ取込が時間内に完了しません: upload_id=${uploadId}`)

  const detected = positiveInteger(completed.num_detected_items, 'Meta検出商品数')
  const persisted = positiveInteger(completed.num_persisted_items, 'Meta反映商品数')
  const invalid = positiveInteger(completed.num_invalid_items, 'Meta無効商品数')
  if (detected !== expectedProducts || persisted + invalid !== detected || invalid > maxInvalidItems) {
    throw new Error(
      `Metaカタログ取込件数が一致しません: expected=${expectedProducts}`
      + ` detected=${detected} persisted=${persisted} invalid=${invalid}`
      + ` max_invalid=${maxInvalidItems}`,
    )
  }

  let catalogCount = -1
  for (let poll = 1; poll <= 20; poll += 1) {
    const catalog = await graphJson(fetchImpl, `${catalogId}?fields=product_count`, accessToken)
    catalogCount = Number(catalog.product_count)
    if (catalogCount === persisted) break
    if (poll < 20) await wait(15_000)
  }
  if (catalogCount !== persisted) {
    throw new Error(`Metaカタログ反映件数が一致しません: expected=${persisted} current=${catalogCount}`)
  }
  return completed
}

export type PublishedCatalogStorage = {
  read(pathname: string): Promise<Buffer>
  publicUrl(pathname: string): string
}

/** 公開完了マーカーを正本に、現在の固定フィードURLをMetaへ即時反映する。 */
export async function importPublishedMetaCatalog(options: {
  storage: PublishedCatalogStorage
  accessToken: string
  feedId: string
  catalogId: string
  maxInvalidItems?: number
}): Promise<MetaCatalogImportResult> {
  const state = JSON.parse((await options.storage.read('catalog/publish-state.json')).toString('utf-8')) as {
    products?: number
    primary_sha256?: string
    primary_bytes?: number
  }
  if (
    !Number.isSafeInteger(state.products)
    || Number(state.products) < 1
    || !/^[a-f0-9]{64}$/.test(String(state.primary_sha256 || ''))
    || !Number.isSafeInteger(state.primary_bytes)
  ) {
    throw new Error('Meta即時取込に使う公開完了マーカーが不正です')
  }
  return importAndVerifyMetaCatalog({
    accessToken: options.accessToken,
    feedId: options.feedId,
    catalogId: options.catalogId,
    feedUrl: options.storage.publicUrl('catalog/ridejob-feed.tsv'),
    expectedProducts: Number(state.products),
    maxInvalidItems: options.maxInvalidItems,
  })
}
