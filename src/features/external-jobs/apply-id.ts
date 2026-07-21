/**
 * 外部求人の応募IDの接頭辞ユーティリティ。
 * クライアントコンポーネントからも読むため、Supabase の接続情報を持つ api.ts とは分離する
 * （api.ts を client から import するとキーがブラウザバンドルに載るため）。
 */
const APPLY_PREFIX: Record<string, string> = { hellowork: "hw-" }

/** 自社求人と同じ `/apply/[id]` を通すための、外部求人の応募ID。 */
export const externalApplyId = (source: string, sourceId: string): string =>
  `${APPLY_PREFIX[source] ?? "ex-"}${sourceId}`

/** 応募IDが外部求人のものなら {source, sourceId} を返す。自社求人なら null。 */
export const parseExternalApplyId = (
  id: string | undefined | null,
): { source: string; sourceId: string } | null => {
  if (!id) return null
  for (const [source, prefix] of Object.entries(APPLY_PREFIX)) {
    if (id.startsWith(prefix)) return { source, sourceId: id.slice(prefix.length) }
  }
  return null
}

/** 外部求人は Meta カタログに存在しないため content_ids に載せてはいけない。 */
export const isExternalJobId = (id: string | undefined | null): boolean =>
  parseExternalApplyId(id) !== null
