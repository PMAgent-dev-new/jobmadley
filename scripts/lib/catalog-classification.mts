export type CatalogCategory = 'taxi' | 'hire' | 'dispatch' | 'mechanic' | 'other'

type CatalogJobLike = {
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

/**
 * microCMS の職種カテゴリを正とし、未設定時のみ求人タイトルで補完する。
 * 求人説明には RIDEJOB の共通紹介文が入るため分類には使わない。
 */
export function classifyCatalogJob(job: CatalogJobLike): CatalogCategory {
  const category = classifyText(job.jobCategory?.name ?? '')
  if (category !== 'other') return category
  return classifyText(job.jobName ?? job.title ?? '')
}
