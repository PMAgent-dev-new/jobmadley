function tokyoDateParts(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  return { year: get("year"), month: get("month"), day: get("day") }
}

const dateKey = (parts: { year: number; month: number; day: number }): number =>
  parts.year * 10_000 + parts.month * 100 + parts.day

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  const value = new Date(Date.UTC(year, month - 1, day))
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day
}

/** 「9月30日」の年を last_seen で補い、掲載期限の翌日から終了扱いにする。 */
export function isExternalJobExpired(
  expiresAt: string | undefined,
  lastSeen: string | undefined,
  now = new Date(),
): boolean {
  const matched = String(expiresAt || "").trim().match(/^(\d{1,2})月(\d{1,2})日$/)
  const seen = new Date(lastSeen || "")
  if (!matched || Number.isNaN(seen.getTime())) return true
  const seenParts = tokyoDateParts(seen)
  const month = Number(matched[1])
  const day = Number(matched[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return true
  let year = seenParts.year
  if (month <= 5 && seenParts.month >= 10) year += 1
  if (month >= 8 && seenParts.month <= 3) year -= 1
  if (!isValidCalendarDate(year, month, day)) return true
  return dateKey({ year, month, day }) < dateKey(tokyoDateParts(now))
}
