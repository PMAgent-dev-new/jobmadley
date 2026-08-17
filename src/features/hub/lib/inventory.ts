import { yen } from "./salary"

/**
 * 掲載中の求人そのものから作る内訳。競合が真似できない一次情報であり、
 * 「◯◯ 給料 / 年収 / 相場」「日勤のみ」「寮あり」のような条件つきクエリに実数で答えるための材料。
 *
 * ⚠️ 事実に無いことを言わないための決めごと:
 * - 母数が少ないものは出さない（1件の入替で数字が動くため）
 * - 分布が潰れている（最小＝最大）ときは「レンジ」を装わず「全件◯円」と書く
 * - 雇用形態は現状の在庫が100%正社員なので、内訳として出す意味がない。
 *   契約社員・派遣の検索需要はあるが**在庫がゼロ**なので、あるように見せる表は作らない
 */

/** 給与の分布を出す最小母数。これ未満なら出さない。 */
const MIN_SALARY_SAMPLE = 10
/** 条件タグを出す最小件数。 */
const MIN_TAG_JOBS = 3
/** 条件タグの表示上限。多すぎるとページが薄い羅列になる。 */
const MAX_TAGS = 8

export interface SalaryDistribution {
  /** 集計対象になった月給求人の件数 */
  sampleSize: number
  min: number
  median: number
  max: number
  /** 最小と最大が同額（レンジとして意味を持たない） */
  flat: boolean
  /** 「月給21万円〜30万円（中央値23万円・36件）」のような一文 */
  text: string
}

export interface ConditionCount {
  name: string
  count: number
  /** 掲載件数に占める割合（%・整数） */
  share: number
}

export interface InventoryBreakdown {
  salary?: SalaryDistribution
  conditions: ConditionCount[]
}

interface InventoryJob {
  wageType?: string[]
  salaryMin?: number
  tags?: { name: string }[]
}

/**
 * @param jobs そのハブの**全**求人（表示中の1ページ分ではない）
 * @param label 文中に出す職種名など
 */
export const buildInventoryBreakdown = (jobs: InventoryJob[], label: string): InventoryBreakdown => {
  // 給与は月給の求人だけで見る。時給・年収を混ぜると単位が壊れる（salary.ts と同じ方針）。
  const mins = jobs
    .filter((j) => {
      const unit = j.wageType?.[0]?.trim()
      return !unit || unit === "月給"
    })
    .map((j) => j.salaryMin)
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b)

  const salary = ((): SalaryDistribution | undefined => {
    if (mins.length < MIN_SALARY_SAMPLE) return undefined
    const min = mins[0]
    const max = mins[mins.length - 1]
    const median = mins[Math.floor(mins.length / 2)]
    const flat = yen(min) === yen(max)
    const text = flat
      ? `掲載中の${label}求人${mins.length}件は、いずれも月給${yen(min)}からの募集です。`
      : `掲載中の${label}求人${mins.length}件の月給は${yen(min)}〜${yen(max)}で、中央値は${yen(median)}です（いずれも下限額）。`
    return { sampleSize: mins.length, min, median, max, flat, text }
  })()

  const counts = new Map<string, number>()
  for (const j of jobs) for (const t of j.tags ?? []) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
  const conditions = [...counts.entries()]
    .filter(([, n]) => n >= MIN_TAG_JOBS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, MAX_TAGS)
    .map(([name, count]) => ({
      name,
      count,
      share: jobs.length > 0 ? Math.round((count / jobs.length) * 100) : 0,
    }))

  return { salary, conditions }
}
