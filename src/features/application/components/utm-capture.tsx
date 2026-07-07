"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { captureAttribution } from "@/features/application/lib/attribution"

/**
 * 全ページ共通でマウントし、URL の UTM / fbclid / gclid を
 * 構造化 Cookie（rj_attr）に取り込む。詳細は attribution.ts を参照。
 */
export default function UTMCapture() {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    const search = searchParams.toString()
    captureAttribution(
      search ? `?${search}` : "",
      pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""),
      typeof document !== "undefined" ? document.referrer : "",
      new Date().toISOString(),
    )
  }, [searchParams, pathname])

  return null // UIは表示しない
}
