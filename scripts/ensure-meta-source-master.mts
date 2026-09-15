import { createBitableRecord, findRecordIdByField } from '../src/shared/lark/bitable.ts'
import type { LarkServiceId } from '../src/shared/config/env.ts'

if (process.env.CATALOG_META_SOURCE_MASTER_CONFIRMED !== 'true') {
  throw new Error('Meta応募経由マスタを確認・追加する場合は CATALOG_META_SOURCE_MASTER_CONFIRMED=true が必要です')
}

const sourceName = 'Meta広告'
const targets: Array<{ service: LarkServiceId; tableId: string }> = [
  { service: 'ridejob', tableId: 'tbl6w045SNt0hJKD' },
  { service: 'mechanic', tableId: 'tblzMUVSWmTzmGfA' },
]

for (const target of targets) {
  let recordId = await findRecordIdByField({
    ...target,
    fieldName: 'テキスト',
    value: sourceName,
  })
  if (!recordId) {
    const created = await createBitableRecord({
      ...target,
      fields: { テキスト: sourceName },
    })
    if (!created.ok || !created.recordId) {
      throw new Error(`${target.service}の応募経由マスタ追加に失敗しました: ${created.status}/${created.code}/${created.message}`)
    }
    recordId = created.recordId
  }

  let readBack: string | undefined
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    readBack = await findRecordIdByField({
      ...target,
      fieldName: 'テキスト',
      value: sourceName,
    })
    if (readBack === recordId) break
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  if (readBack !== recordId) throw new Error(`${target.service}の応募経由マスタを読戻せません`)
  console.log(`[meta-source-master] verified service=${target.service} record_id=${recordId}`)
}
