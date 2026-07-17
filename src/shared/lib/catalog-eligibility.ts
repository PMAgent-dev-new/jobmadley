export type CatalogCategory = 'taxi' | 'hire' | 'dispatch' | 'mechanic' | 'other'

export type CatalogJobLike = {
  title?: string
  jobName?: string
  jobCategory?: { name?: string }
}

function classifyText(value: string): CatalogCategory {
  if (/ハイヤー/.test(value)) return 'hire'
  if (/運行管理|配車(係|オペレーター|担当)/.test(value)) return 'dispatch'
  if (/自動車整備士|バイク整備士|整備士|メカニック|板金|フロントスタッフ|サービス(エンジニア|スタッフ)/.test(value)) {
    return 'mechanic'
  }
  if (/タクシー\s*(ドライバー|乗務員|運転手)|乗務員/.test(value)) return 'taxi'
  return 'other'
}

function classifyTitle(value: string): CatalogCategory {
  const title = String(value || '').trim()
  if (!title) return 'other'

  // 職種名ではなく営業対象を表す「整備士人材」などを、整備士求人として扱わない。
  if (/営業マネージャー|営業スタッフ|法人営業|人材営業|拠点長候補/.test(title)) return 'other'

  return classifyText(title)
}

/**
 * microCMSの対象職種カテゴリを優先する。
 * カテゴリ未設定と、既知の入力誤りがある「営業」だけ求人名の明確な職種語で補完する。
 */
export function classifyCatalogJob(job: CatalogJobLike): CatalogCategory {
  const sourceCategory = String(job.jobCategory?.name ?? '').trim()
  const category = classifyText(sourceCategory)
  if (category !== 'other') return category
  if (sourceCategory && sourceCategory !== '営業') return 'other'
  return classifyTitle(job.jobName ?? job.title ?? '')
}

export function isMetaCatalogJob(job: CatalogJobLike): boolean {
  return classifyCatalogJob(job) !== 'other'
}
