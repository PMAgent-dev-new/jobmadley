import { yen } from "./salary"

/**
 * 詳細条件が登録されている求人そのものから作る内訳。
 * 「◯◯ 給料 / 年収 / 相場」「日勤のみ」「寮あり」のような条件つきクエリに実数で答えるための一次情報。
 *
 * ⚠️ 事実に無いことを言わないための決めごと（すべて実際に踏んだ失敗が根拠）:
 *
 * 1. **レンジ（最小〜最大）を出さない。** salary.ts が「min〜max を使ってはいけない」と
 *    記録している罠に、初版はそのまま戻していた。実データ1件（年収400万円の求人が
 *    wageType 未設定で月給扱いになる）だけで「月給17万円〜400万円」が描画された。
 *    中央値は1件の外れ値で動かないので、中央値と母数だけを出す。
 *    中心帯（p25〜p75）は概要タイルが既に出しているので重複させない。
 *
 * 2. **wageType が「月給」と明記された求人だけを数える。** computeHubStats は未設定を
 *    月給扱いにしているが（microCMSの既定運用）、ここは単位が確定した求人だけに絞る。
 *    上の事故の原因がまさに未設定の年収求人だった。実測で未設定は1,376件中1件だけなので損失は無い。
 *
 * 3. **母数を必ず文中と表に出す。** ページ上部の「掲載件数」は掲載求人（転載分）を含む合算で、
 *    この内訳の母数とは違う。数字だけ並べると同じページで20倍違う件数が並んで矛盾する
 *    （自動車整備士は上部8,997件・内訳431件だった）。
 *
 * 4. **母数が少ないときは割合を出さない。** 4件のハブで「100%」と出ていた。
 */

/** 給与・割合を出す最小母数。これ未満なら出さない（1件の入替で数字が動くため）。 */
const MIN_SAMPLE = 10
/** 条件タグを出す最小件数。 */
const MIN_TAG_JOBS = 3
/** 条件タグの表示上限。多すぎるとページが薄い羅列になる。 */
const MAX_TAGS = 8

export interface SalaryFacts {
  /** 集計対象になった月給求人の件数 */
  sampleSize: number
  median: number
  /** 「詳細条件を登録済みの◯◯求人◯件では、月給の中央値は◯万円です（下限額）。」 */
  text: string
}

export interface ConditionCount {
  name: string
  count: number
  /** 母数に占める割合（%・整数）。母数が少ないハブでは undefined */
  share?: number
}

export interface InventoryBreakdown {
  /** 条件表の母数（＝この内訳が対象にしている求人の件数） */
  totalJobs: number
  salary?: SalaryFacts
  conditions: ConditionCount[]
}

interface InventoryJob {
  wageType?: string[]
  salaryMin?: number
  tags?: { name: string }[]
}

/**
 * @param jobs そのハブの**全**求人（表示中の1ページ分ではない）
 * @param label 文中に出す名前。県×職種なら「東京都のタクシードライバー」のように地域込みで渡すこと
 *              （職種名だけだと全国の断定として抜き出され、全国ハブの数字と矛盾する）
 */
export const buildInventoryBreakdown = (jobs: InventoryJob[], label: string): InventoryBreakdown => {
  const mins = jobs
    .filter((j) => j.wageType?.[0]?.trim() === "月給")
    .map((j) => j.salaryMin)
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b)

  const salary =
    mins.length >= MIN_SAMPLE
      ? (() => {
          const median = mins[Math.floor(mins.length / 2)]
          return {
            sampleSize: mins.length,
            median,
            text: `詳細条件を登録済みの${label}求人${mins.length}件では、月給の中央値は${yen(median)}です（下限額）。`,
          }
        })()
      : undefined

  const counts = new Map<string, number>()
  for (const j of jobs) for (const t of j.tags ?? []) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
  const showShare = jobs.length >= MIN_SAMPLE
  const conditions = [...counts.entries()]
    .filter(([, n]) => n >= MIN_TAG_JOBS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, MAX_TAGS)
    .map(([name, count]) => ({
      name,
      count,
      share: showShare ? Math.round((count / jobs.length) * 100) : undefined,
    }))

  return { totalJobs: jobs.length, salary, conditions }
}
