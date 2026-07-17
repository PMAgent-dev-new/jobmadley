"use client"

import { useEffect } from "react"
import { trackMeta } from "@/shared/lib/meta-pixel"

/**
 * 求人詳細ページのマウント時に Meta ViewContent を発火する。
 * content_ids には求人ID（= カタログフィードの id）を渡し、ダイナミック広告と商品単位でひも付ける。
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
  }, [catalogEligible, id, name])

  return null
}
