import * as React from "react"

const MOBILE_BREAKPOINT = 768

const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const subscribe = (onChange: () => void): (() => void) => {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

// クライアントの現在値。matchMedia を真実の情報源にする（innerWidth と breakpoint の齟齬を防ぐ）。
const getSnapshot = (): boolean => window.matchMedia(query).matches

// サーバー描画時は false（デスクトップ扱い）を返し、ハイドレーション後にクライアント値へ同期する。
const getServerSnapshot = (): boolean => false

// useSyncExternalStore を使うことで、effect 内での同期的な setState（cascading renders）を避けつつ
// SSR セーフに現在のビューポート幅を購読する。
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
