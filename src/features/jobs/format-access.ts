const LEADING_BULLET_PATTERN = /^(?:[・･•●▪◦]\s*)+/

export const formatAccessLines = (access: string): string[] =>
  access
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LEADING_BULLET_PATTERN, '').trim())
    .filter(Boolean)
