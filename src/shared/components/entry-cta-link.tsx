"use client"

import { useEffect, useRef } from "react"
import { readAttribution } from "@/features/application/lib/attribution"

/**
 * 応募フォーム（/entry）へのCTAリンク。
 *
 * /entry は form_applicant（basePath=/entry）が配信しており、
 * **URLのクエリ文字列からしか utm を読まない**（Cookie のフォールバックが無い）。
 * そのため素の `<a href="/entry">` だと、広告クリックで付いてきた utm が
 * ここで途切れ、Lark 側の応募レコードが「経由不明」になる。
 *
 * 現在のURLに utm があればそれを、無ければ rj_attr Cookie の lastTouch を
 * 引き継いでクエリに載せる。
 *
 * ※ 恒久対策は form_applicant 側に「query → Cookie → referrer」の
 *   フォールバックを入れること。本コンポーネントはそれまでの応急層。
 */

/**
 * 転送する utm キー。
 * ⚠️ form_applicant が読む7キー（useApplicationFormState.ts の utmParams）と
 * 一致させること。片方だけ増やしても記録されない。
 */
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_creative",
]

/** クリック ID。form_applicant は現状読まないが、Pixel 側の再構成に使われるため落とさない。 */
const CLICK_IDS = ["gclid", "fbclid"]

function buildEntryHref(): string {
  const current = new URLSearchParams(window.location.search)
  const out = new URLSearchParams()

  for (const k of UTM_KEYS) {
    const v = current.get(k)
    if (v) out.set(k, v)
  }
  for (const k of CLICK_IDS) {
    const v = current.get(k)
    if (v) out.set(k, v)
  }

  // URLに utm が無ければ Cookie の lastTouch から補う（サイト内を回遊してから応募する経路）
  if (!out.has("utm_source")) {
    const attr = readAttribution()
    const touch = attr.lastTouch ?? attr.firstTouch
    if (touch?.source) {
      out.set("utm_source", touch.source)
      if (touch.medium) out.set("utm_medium", touch.medium)
      if (touch.campaign) out.set("utm_campaign", touch.campaign)
      if (touch.content) out.set("utm_content", touch.content)
      if (touch.term) out.set("utm_term", touch.term)
    }
    if (!out.has("gclid") && attr.gclid) out.set("gclid", attr.gclid)
    if (!out.has("fbclid") && attr.fbclid) out.set("fbclid", attr.fbclid)
  }

  const qs = out.toString()
  return qs ? `/entry?${qs}` : "/entry"
}

export default function EntryCtaLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  // SSRとクライアント初回描画を一致させるため素の /entry を描画し、
  // ハイドレーション後に href だけDOMで書き換える。
  // （レンダー中に window を読むと不整合、setState だと再描画が無駄）
  const ref = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.href = buildEntryHref()
  }, [])

  return (
    <a
      ref={ref}
      href="/entry"
      className={className}
      // ハイドレーション直後にクリックされた場合や、UTMCapture の effect が
      // 後に走った場合に備えて遷移直前に組み立て直す。
      // preventDefault しないので cmd+クリック・新規タブも壊れない。
      onClick={(e) => {
        e.currentTarget.href = buildEntryHref()
      }}
    >
      {children}
    </a>
  )
}
