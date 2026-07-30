/**
 * GA4（dataLayer 経由）ヘルパー。
 * GTM コンテナ GTM-5CQGTMXF は app/layout.tsx で読み込み済みで、ここでは dataLayer への
 * push のみを担う。GTM 側で対応する GA4 イベントタグを作成すると計測が始まる仕組み。
 *
 * 命名は GA4 の推奨イベント（view_item / add_to_cart / generate_lead）に合わせる。
 * Meta Pixel 側（shared/lib/meta-pixel.ts）と同じ行動に同じタイミングで発火させ、
 * 「Meta では見えるが GA4 では見えない」という非対称を解消するのが目的。
 */

/** GA4 推奨イベントのうち本サイトで使うもの */
type Ga4EventName = "view_item" | "add_to_cart" | "generate_lead"

type Ga4Item = {
  item_id: string
  item_name?: string
  item_category?: string
}

type Ga4EventParams = {
  items?: Ga4Item[]
  /** 求人1件の想定価値。未確定なら 0 を入れて後から一括で見直す */
  value?: number
  currency?: string
  /** 職種・流入などの補助ディメンション */
  job_category?: string
}

type DataLayerObject = Record<string, unknown>

function getDataLayer(): DataLayerObject[] | undefined {
  if (typeof window === "undefined") return undefined
  const win = window as typeof window & { dataLayer?: DataLayerObject[] }
  win.dataLayer = win.dataLayer ?? []
  return win.dataLayer
}

/**
 * GA4 イベントを dataLayer へ push する。
 * ecommerce オブジェクトは GA4 の e コマース仕様に沿った形で入れるため、
 * GTM 側では「イベントデータソース = ecommerce」を選ぶだけで items が送れる。
 */
export function trackGa4(event: Ga4EventName, params: Ga4EventParams = {}): void {
  const dl = getDataLayer()
  if (!dl) return

  const ecommerce: DataLayerObject = {}
  if (params.items && params.items.length > 0) ecommerce.items = params.items
  if (typeof params.value === "number") ecommerce.value = params.value
  ecommerce.currency = params.currency ?? "JPY"

  // 直前のイベントの ecommerce が残って混ざらないよう、push 前に必ず初期化する
  // （GA4 e コマースの定番の落とし穴）
  dl.push({ ecommerce: null })
  dl.push({
    event,
    ecommerce,
    ...(params.job_category ? { job_category: params.job_category } : {}),
  })
}
