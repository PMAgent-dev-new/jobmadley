/**
 * ハブの給与集計。副作用も外部依存も持たせない（hub.ts は microCMS クライアントを
 * 引き込むため、ここに切り出さないとユニットテストが env を要求してしまう）。
 */

export const yen = (v: number) => `${Math.round(v / 10000)}万円`

/** 昇順配列のパーセンタイル（線形補間なし・最近傍）。 */
export const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]

/**
 * 給与の中心帯を出すのに min〜max を使ってはいけない。
 * 歩合の上限を書いた求人が1件あるだけで「月給18万円〜110万円」になり（東京都ハブで実際に発生）、
 * 情報量がゼロになるどころか誇大に見える。四分位で中心帯を出し、母数が少なければ出さない。
 */
export const SALARY_MIN_SAMPLE = 10
/** これ未満は中央値も出さない（1件の入替で数字が動くため） */
export const SALARY_MIN_MEDIAN = 5

export interface SalarySummary {
  salaryText?: string
  salaryMedian?: number
  salarySampleSize: number
}

/**
 * @param mins 月給求人の下限額（円）。順不同でよい
 * @param minSample 中央値を出す下限。会社ページのように母数1件でも求人票そのものである場合に緩める
 */
export const summarizeSalary = (mins: number[], minSample = SALARY_MIN_MEDIAN): SalarySummary => {
  const sorted = [...mins].sort((a, b) => a - b)
  const salarySampleSize = sorted.length
  const salaryMedian = salarySampleSize >= minSample ? percentile(sorted, 0.5) : undefined
  if (salaryMedian === undefined) return { salarySampleSize }
  // 母数が10件に満たなくても、5件あれば中央値なら意味を持つ。情報を消すより中央値で残す。
  if (salarySampleSize < SALARY_MIN_SAMPLE) {
    return { salaryText: `月給${yen(salaryMedian)}前後`, salaryMedian, salarySampleSize }
  }
  // 下限額が横並びのハブでは p25==p75 で「月給23万円〜23万円」という縮退帯が出るので畳む。
  // 畳む判定は yen() の丸め後で比較する。234,000 と 244,000 は生値では異なるが表示は同じ。
  const lo = yen(percentile(sorted, 0.25))
  const hi = yen(percentile(sorted, 0.75))
  return {
    salaryText: lo === hi ? `月給${lo}前後` : `月給${lo}〜${hi}`,
    salaryMedian,
    salarySampleSize,
  }
}
