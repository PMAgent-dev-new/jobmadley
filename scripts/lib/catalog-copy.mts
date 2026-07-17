import { catalogHtmlToText } from './catalog-text.mts'

export const CATALOG_TITLE_MAX_LENGTH = 42
export const CATALOG_DESCRIPTION_MAX_LENGTH = 700
export const CATALOG_DESCRIPTION_MIN_LENGTH = 100
export const PM_AGENT_DISCLOSURE =
  '本求人は株式会社PM Agentが紹介します。応募後、担当者より選考手順をご案内します。'

export type CatalogCopyCategory = 'taxi' | 'hire' | 'dispatch' | 'mechanic' | 'other'

export type CatalogCopyInput = {
  category: CatalogCopyCategory
  sourceTitle: string
  companyName?: string
  salary?: string
  employmentType?: string
  region?: string
  locality?: string
  descriptionWork?: string
  descriptionAppeal?: string
  descriptionPerson?: string
  descriptionBenefits?: string
  workHours?: string
  holidays?: string
}

const PROHIBITED_PHRASES = [
  'ビザ問題の完全解決',
  'スキルの習得を保証',
  '国籍や経験は問いません',
] as const

const EMPLOYER_VOICE = /当社|弊社|当営業所|当店|当校|当法人|当グループ|私たち|私ども|我が社/
const SELECTION_FLOW = /選考の流れ|応募方法|応募いただいた後|応募後は|株式会社PM Agentから|RIDE JOBのワンストップ/
const QA_HEADING = /^(?:【?Q\d+】?|Q\d+[.．:：]|よくある質問)/i
const QUESTION_UNIT = /[?？]\s*$/
const STANDALONE_QA_ANSWER = /^(?:問題ありません|ご安心ください)[。！!]*$/
const DECORATIVE_CALLOUT = /[＼\\][^＼\\／/]{1,180}[／/]/g
const QA_ANSWER_VOICE = /(?:^|[\s\n])(?:はい|いいえ)[、。！!]/
const VAGUE_INCOME_CLAIM = /誰でも稼げる|高収入(?:が可能|を実現)?|安定収入|しっかり稼げる|がっつり稼げる/

function normalizeWhitespace(value: string): string {
  return String(value || '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeEmployerVoice(value: string): string {
  return value
    .replace(/当営業所/g, '勤務先営業所')
    .replace(/当店/g, '勤務先店舗')
    .replace(/当校/g, '勤務先校')
    .replace(/当法人/g, '勤務先法人')
    .replace(/当グループ/g, '勤務先グループ')
    .replace(/当社|弊社/g, '勤務先企業')
    .replace(/私たち|私ども|我が社/g, '勤務先企業')
    .replace(/あなたの/g, '')
    .replace(/あなたに/g, '')
}

function isStaleClaim(value: string, currentYear: number): boolean {
  const years = [...value.matchAll(/(20\d{2})年/g)].map((match) => Number(match[1]))
  return years.some((year) => year < currentYear - 1)
}

function splitUnits(value: string): string[] {
  return value
    .split(/(?<=[。！？])|\n+/)
    .map((unit) => unit.replace(/^[・\-－ー\s]+/, '').trim())
    .filter(Boolean)
}

function normalizeQaStyle(value: string): string {
  return value
    .replace(DECORATIVE_CALLOUT, ' ')
    .replace(/^\s*(?:はい|いいえ)(?:[、。！!\s]+|$)/, '')
    .trim()
}

function clipAtBoundary(value: string, maxLength: number): string {
  const clean = normalizeWhitespace(value)
  if (clean.length <= maxLength) return clean
  const raw = clean.slice(0, Math.max(1, maxLength - 1))
  const boundary = Math.max(raw.lastIndexOf('。'), raw.lastIndexOf('、'), raw.lastIndexOf(' '))
  const clipped = boundary >= Math.floor(maxLength * 0.55) ? raw.slice(0, boundary + 1) : raw
  return `${clipped.replace(/[、。\s]+$/, '')}…`
}

function compactSection(
  html: string | undefined,
  maxLength: number,
  currentYear: number,
): string {
  if (!html) return ''
  const plain = normalizeEmployerVoice(catalogHtmlToText(html)).replace(DECORATIVE_CALLOUT, ' ')
  const seen = new Set<string>()
  const selected: string[] = []

  for (const rawUnit of splitUnits(plain)) {
    const unit = normalizeQaStyle(rawUnit)
    if (!unit) continue
    if (PROHIBITED_PHRASES.some((phrase) => unit.includes(phrase))) continue
    if (SELECTION_FLOW.test(unit) || QA_HEADING.test(unit) || QUESTION_UNIT.test(unit)) continue
    if (STANDALONE_QA_ANSWER.test(unit)) continue
    if (isStaleClaim(unit, currentYear)) continue
    if (VAGUE_INCOME_CLAIM.test(unit) && !/[0-9０-９]/.test(unit)) continue

    const normalized = unit.replace(/[\s　]+/g, '')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)

    const candidate = normalizeWhitespace([...selected, unit].join(' '))
    if (candidate.length > maxLength) {
      if (selected.length === 0) selected.push(clipAtBoundary(unit, maxLength))
      break
    }
    selected.push(unit)
  }

  return normalizeWhitespace(selected.join(' '))
}

function occupationLabel(category: CatalogCopyCategory, sourceTitle: string): string {
  const title = String(sourceTitle || '')
  if (/教員|講師/.test(title) && /整備/.test(title)) return '自動車整備教員'
  if (/バイク|二輪/.test(title) && /整備|メカニック/.test(title)) return 'バイク整備士'
  if (/建機|重機|ショベル|農機/.test(title) && /整備|メカニック|サービスエンジニア/.test(title)) return '建機・重機整備士'
  if (/板金|鈑金|塗装/.test(title)) return '板金・塗装スタッフ'
  if (/フロント|受付/.test(title) && /整備|工場|車検/.test(title)) return '整備工場フロント'
  if (category === 'hire' || /ハイヤー/.test(title)) return 'ハイヤードライバー'
  if (category === 'dispatch' || /運行管理|配車係|配車オペレーター/.test(title)) return '運行管理・配車'
  if (category === 'taxi' || /タクシー|乗務員/.test(title)) return 'タクシードライバー'
  if (category === 'mechanic' || /整備士|メカニック/.test(title)) return '自動車整備士'
  return clipAtBoundary(title.replace(/[（(].*?[）)]/g, '').split(/[|｜/／]/)[0], 20) || '求人情報'
}

function concreteAppeal(sourceTitle: string): string {
  const normalized = String(sourceTitle || '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/\s+/g, '')
  const patterns = [
    /年間休日\d{3}日/,
    /完全週休[二2]日/,
    /土日(?:祝)?休み/,
    /残業(?:月)?\d+時間以下/,
    /配車アプリ(?:中心|導入)?/,
    /二種免許(?:取得)?(?:費用)?(?:会社負担|支援)/,
    /賞与(?:年)?\d回/,
    /(?:寮|社宅)(?:月\d+(?:,\d+)?円|制度あり|あり)/,
    /未経験(?:OK|可|歓迎)/,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)?.[0]
    if (match) return match.replace(/未経験可$/, '未経験OK')
  }
  return ''
}

export function buildCatalogTitle(input: CatalogCopyInput): string {
  const occupation = occupationLabel(input.category, input.sourceTitle)
  const appeal = concreteAppeal(input.sourceTitle)
  const location = input.locality ? `（${input.locality}）` : ''
  const withAppeal = `${occupation}${appeal ? `｜${appeal}` : ''}${location}`
  if (withAppeal.length <= CATALOG_TITLE_MAX_LENGTH) return withAppeal

  const withoutAppeal = `${occupation}${location}`
  if (withoutAppeal.length <= CATALOG_TITLE_MAX_LENGTH) return withoutAppeal

  const available = Math.max(8, CATALOG_TITLE_MAX_LENGTH - location.length)
  return `${clipAtBoundary(occupation, available)}${location}`.slice(0, CATALOG_TITLE_MAX_LENGTH)
}

function addBlock(blocks: string[], label: string, value: string): void {
  if (value) blocks.push(`${label}｜${value}`)
}

export function buildCatalogDescription(
  input: CatalogCopyInput,
  options: { currentYear?: number } = {},
): string {
  const currentYear = options.currentYear ?? new Date().getFullYear()
  const summary = [
    input.salary,
    input.employmentType,
    `${input.region || ''}${input.locality || ''}`.trim(),
  ].filter(Boolean).join('｜')
  const company = clipAtBoundary(String(input.companyName || '勤務先企業').trim(), 60)
  const work = compactSection(input.descriptionWork, 220, currentYear)
  const appeal = compactSection(input.descriptionAppeal, 120, currentYear)
  const person = compactSection(input.descriptionPerson, 110, currentYear)
  const benefits = compactSection(input.descriptionBenefits, 110, currentYear)
  const hours = compactSection(input.workHours, 80, currentYear)
  const holidays = compactSection(input.holidays, 80, currentYear)

  const blocks: string[] = []
  if (summary) blocks.push(summary)
  addBlock(blocks, '勤務先', company)
  addBlock(blocks, '仕事内容', work || occupationLabel(input.category, input.sourceTitle))
  addBlock(blocks, '特徴', appeal)
  addBlock(blocks, '応募条件', person)
  addBlock(blocks, '待遇', benefits)
  addBlock(blocks, '勤務時間', hours)
  addBlock(blocks, '休日', holidays)
  blocks.push(PM_AGENT_DISCLOSURE)

  let output = normalizeWhitespace(blocks.join('\n\n'))
  if (output.length <= CATALOG_DESCRIPTION_MAX_LENGTH) return output

  const disclosureSuffix = `\n\n${PM_AGENT_DISCLOSURE}`
  output = `${clipAtBoundary(
    output.slice(0, Math.max(1, output.lastIndexOf(disclosureSuffix))),
    CATALOG_DESCRIPTION_MAX_LENGTH - disclosureSuffix.length,
  )}${disclosureSuffix}`
  return output.slice(0, CATALOG_DESCRIPTION_MAX_LENGTH)
}

function hasBalancedLocation(title: string): boolean {
  return (title.match(/（/g) || []).length === (title.match(/）/g) || []).length
}

export function validateCatalogCopy(title: string, description: string): string[] {
  const issues: string[] = []
  if (!title || title.length > CATALOG_TITLE_MAX_LENGTH) issues.push('title_length')
  if (/[\/／]/.test(title)) issues.push('title_slash')
  if (!hasBalancedLocation(title)) issues.push('title_unbalanced_location')
  if (description.length < CATALOG_DESCRIPTION_MIN_LENGTH) issues.push('description_too_short')
  if (description.length > CATALOG_DESCRIPTION_MAX_LENGTH) issues.push('description_too_long')
  if (PROHIBITED_PHRASES.some((phrase) => description.includes(phrase))) issues.push('prohibited_boilerplate')
  if (EMPLOYER_VOICE.test(description)) issues.push('ambiguous_employer_voice')
  if (QA_ANSWER_VOICE.test(description)) issues.push('qa_answer_voice')
  if (/[＼\\]/.test(description)) issues.push('decorative_callout')
  if (SELECTION_FLOW.test(description.replace(PM_AGENT_DISCLOSURE, ''))) issues.push('selection_flow_bloat')
  if (!description.includes(PM_AGENT_DISCLOSURE)) issues.push('missing_agency_disclosure')
  return issues
}

export function catalogRoleLabel(input: Pick<CatalogCopyInput, 'category' | 'sourceTitle'>): string {
  return occupationLabel(input.category, input.sourceTitle)
}
