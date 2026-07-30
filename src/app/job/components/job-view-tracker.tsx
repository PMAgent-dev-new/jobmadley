"use client"

import { useEffect } from "react"
import { trackMeta } from "@/shared/lib/meta-pixel"
import { trackGa4 } from "@/shared/lib/ga4"

/**
 * 求人詳細ページのマウント時に Meta ViewContent と GA4 view_item を発火する。
 * content_ids には求人ID（= カタログフィードの id）を渡し、ダイナミック広告と商品単位でひも付ける。
 * GA4 側にも同じタイミングで送ることで、両媒体で同一のファネル（閲覧→応募開始→応募）が追える。
 */
export default function JobViewTracker({
  id,
  name,
  catalogEligible,
}: {
  id: string
  name?: string
  catalogEligible: boolean
}) {
  useEffect(() => {
    trackMeta("ViewContent", {
      contentIds: catalogEligible ? [id] : undefined,
      contentName: name,
      value: 0,
      currency: "JPY",
    })
    trackGa4("view_item", {
      items: [{ item_id: id, item_name: name }],
      value: 0,
    })
  }, [catalogEligible, id, name])

  return null
}
