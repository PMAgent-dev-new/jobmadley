import { createHash } from 'node:crypto'
import type { ExternalCatalogJob } from './catalog-external-jobs.mts'

export type ExternalImageProfile = {
  scene: 'bike' | 'truck' | 'equipment' | 'bodywork' | 'inspection' | 'service' | 'car'
  sceneLabel: string
  features: string[]
  accent: string
  accentDark: string
  patternVariant: number
}

const escapeXml = (value: string): string => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

function textBlob(job: ExternalCatalogJob): string {
  return [
    job.title,
    job.jobCategory,
    job.description,
    job.detail?.workContent,
    job.detail?.licenseRequired,
    job.detail?.training,
    job.detail?.annualHolidays,
    job.detail?.holidays,
    job.detail?.bonus,
  ].filter(Boolean).join('。')
}

// 作業シーンは、職務名・仕事内容で確認できる対象車種だけから決める。
// 免許欄の「フォークリフト免許あれば尚可」「大型免許必須」は、
// その車両自体を整備する求人である根拠にはならないため含めない。
function sceneTextBlob(job: ExternalCatalogJob): string {
  return [
    job.title,
    job.jobCategory,
    job.description,
    job.detail?.workContent,
  ].filter(Boolean).join('。')
}

function sceneOf(job: ExternalCatalogJob, blob: string): Pick<ExternalImageProfile, 'scene' | 'sceneLabel'> {
  // 「自転車・バイク通勤可」のような通勤条件は、バイク整備の仕事内容ではない。
  if (
    job.jobCategory === 'バイク整備士'
    || /(?:バイク|二輪|オートバイ)(?:車両|自動車)?(?:の)?(?:整備|点検|修理|メカニック)/.test(blob)
  ) {
    return { scene: 'bike', sceneLabel: 'バイク整備' }
  }
  if (
    /(?:建機|重機|ショベル|フォークリフト|農機)(?:車両|機械)?(?:の)?[^。\n]{0,8}(?:整備|点検|修理|メカニック)/.test(blob)
    || /(?:整備|点検|修理)[^。\n]{0,8}(?:建機|重機|ショベル|フォークリフト|農機)/.test(blob)
  ) {
    return { scene: 'equipment', sceneLabel: '建機・重機整備' }
  }
  // 「最寄りのバス停」のような交通案内を大型車整備と誤認しない。
  if (
    /(?:大型(?:車|自動車|トラック)|トラック|ダンプ|バス(?!停)(?:車両|自動車)?)(?:の)?[^。\n]{0,8}(?:整備|点検|修理|メカニック)/.test(blob)
    || /(?:整備|点検|修理)[^。\n]{0,8}(?:大型(?:車|自動車|トラック)|トラック|ダンプ|バス(?!停)(?:車両|自動車)?)/.test(blob)
  ) {
    return { scene: 'truck', sceneLabel: '大型車整備' }
  }
  if (/板金|鈑金|塗装|ボディ/.test(blob)) {
    return { scene: 'bodywork', sceneLabel: '板金・塗装' }
  }
  if (/フロント|受付|一般事務|営業職/.test(job.title) && /整備|工場|車検|自動車/.test(blob)) {
    return { scene: 'service', sceneLabel: '整備工場フロント' }
  }
  if (/車検|検査員|法定点検|点検/.test(blob)) {
    return { scene: 'inspection', sceneLabel: '車検・点検' }
  }
  return { scene: 'car', sceneLabel: '自動車整備' }
}

function featureLabels(job: ExternalCatalogJob, blob: string): string[] {
  const labels: string[] = []
  const explicitlyRejectsInexperienced = /未経験(?:者)?(?:不可|お断り)|経験必須/.test(blob)
  if (!explicitlyRejectsInexperienced && /経験不問|未経験(?:者)?(?:歓迎|可|OK)|未経験から/.test(blob)) {
    labels.push('未経験相談可')
  }
  const training = job.detail?.training || ''
  const hasNegativeTraining = /(?:研修|教育|資格取得(?:支援|補助|制度|費用)?)[^。\n]{0,20}(?:(?:制度)?(?:は|が)?(?:なし|無し|ない|無い|ありません|ございません)|該当なし|特になし|実施していません)/.test(blob)
  const hasOnlyUnavailableTraining = /研修制度の正社員以外の利用[：:]?[「『\s]*不可/.test(training)
    && !/研修制度の内容\s*\S/.test(training)
  const hasPositiveTraining = Boolean(
    !hasNegativeTraining
    && !hasOnlyUnavailableTraining
    && (
      /資格取得(?:支援|補助|制度|費用)/.test(blob)
      || Boolean(training)
    ),
  )
  if (hasPositiveTraining) labels.push('研修情報あり')
  const holidays = (job.detail?.annualHolidays || '').match(/年間休日[^0-9０-９]{0,6}([0-9０-９]{3})日/)
  if (holidays) labels.push(`年間休日${holidays[1]}日`)
  const holidayText = [job.detail?.holidays, blob].filter(Boolean).join(' ')
  const hasNegativeHoliday = /(?:週休(?:二|2)日(?:制)?|土日(?:祝)?(?:休|休日))[^。\n]{0,20}(?:なし|無し|ない|無い|ではありません|該当なし)/.test(holidayText)
  const hasPositiveHoliday = !hasNegativeHoliday && (
    /完全週休(?:二|2)日/.test(holidayText)
    || /週休(?:二|2)日(?:制)?\s*(?:毎週|その他|あり|有り)/.test(holidayText)
    || /土日(?:祝)?(?:休み|休日)(?!出勤|勤務)/.test(holidayText)
  )
  if (hasPositiveHoliday) labels.push('休日制度あり')
  const bonus = job.detail?.bonus || ''
  // ハローワーク詳細の「賞与制度の有無 あり」を正に判定する。
  // 「有無」に含まれる「無」を否定表現として扱わないよう、肯定値を明示的に要求する。
  const hasPositiveBonus = /(?:賞与制度の有無|賞与（前年度実績）の有無)\s*[：:]?\s*あり|賞与(?:制度)?(?:は|が)?\s*[：:]?\s*(?:あり|有り)|賞与(?:年)?[0-9０-９]+回/.test(bonus)
  if (hasPositiveBonus) labels.push('賞与情報あり')
  if (/残業なし|時間外労働なし/.test(blob)) labels.push('残業なし')
  if (/マイカー通勤可/.test(blob)) labels.push('車通勤可')
  if (/三級|3級|二級|2級|一級|1級|検査員/.test(job.detail?.licenseRequired || '')) labels.push('資格を活かせる')
  return [...new Set(labels)].slice(0, 3)
}

export function externalImageProfile(job: ExternalCatalogJob): ExternalImageProfile {
  const digest = createHash('sha256').update(`${job.source}:${job.sourceId}`).digest()
  const palettes = [
    ['#2563EB', '#123B78'],
    ['#0F766E', '#134E4A'],
    ['#C2410C', '#7C2D12'],
    ['#7C3AED', '#4C1D95'],
    ['#0369A1', '#0C4A6E'],
    ['#B45309', '#78350F'],
  ] as const
  const [accent, accentDark] = palettes[digest[0] % palettes.length]
  const blob = textBlob(job)
  return {
    ...sceneOf(job, sceneTextBlob(job)),
    features: featureLabels(job, blob),
    accent,
    accentDark,
    patternVariant: digest[1] % 4,
  }
}

function identityPattern(sourceId: string): string {
  const digest = createHash('sha256').update(`visual:${sourceId}`).digest()
  return Array.from({ length: 14 }, (_, index) => {
    const x = 54 + ((digest[index] * 31 + index * 97) % 972)
    const y = 46 + ((digest[index + 14] * 23 + index * 61) % 590)
    const radius = 7 + (digest[index + 7] % 13)
    const opacity = (18 + (digest[index + 3] % 24)) / 100
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#ffffff" opacity="${opacity.toFixed(2)}"/>`
  }).join('')
}

function vehicleSvg(scene: ExternalImageProfile['scene']): string {
  if (scene === 'service') {
    return `
      <rect x="300" y="225" width="480" height="340" rx="38" class="solid"/>
      <rect x="385" y="175" width="310" height="105" rx="28" class="outline"/>
      <path d="M390 355 H690 M390 435 H620" class="line"/>
      <circle cx="745" cy="500" r="62" class="badge"/><path d="M715 500 L738 523 L780 475" class="check"/>`
  }
  if (scene === 'bike') {
    return `
      <circle cx="285" cy="510" r="94" class="wheel"/><circle cx="720" cy="510" r="94" class="wheel"/>
      <path d="M285 510 L425 360 L570 510 L720 510 L605 300 L505 300 M425 360 L620 360" class="line"/>
      <path d="M570 510 L665 280 L750 280" class="line"/><rect x="430" y="270" width="145" height="46" rx="20" class="solid"/>`
  }
  if (scene === 'truck' || scene === 'equipment') {
    return `
      <rect x="170" y="285" width="500" height="220" rx="36" class="solid"/>
      <path d="M670 350 H790 L880 440 V505 H670 Z" class="solid"/>
      <rect x="710" y="375" width="92" height="82" rx="12" class="window"/>
      <circle cx="330" cy="520" r="76" class="wheel"/><circle cx="750" cy="520" r="76" class="wheel"/>
      ${scene === 'equipment' ? '<path d="M240 285 L390 165 H560 L650 285" class="line"/>' : ''}`
  }
  const bodyClass = scene === 'bodywork' ? 'outline' : 'solid'
  return `
    <path d="M180 450 L250 330 Q280 275 355 270 H650 Q720 275 765 335 L850 450 V505 H180 Z" class="${bodyClass}"/>
    <path d="M330 325 H650 Q690 330 720 390 H285 Q300 350 330 325 Z" class="window"/>
    <circle cx="330" cy="510" r="76" class="wheel"/><circle cx="715" cy="510" r="76" class="wheel"/>
    ${scene === 'inspection' ? '<circle cx="800" cy="230" r="62" class="badge"/><path d="M770 230 L792 252 L834 204" class="check"/>' : ''}`
}

export function buildExternalMechanicSourceSvg(job: ExternalCatalogJob): string {
  const profile = externalImageProfile(job)
  // 求人番号そのものは描かず、IDのハッシュから十分な組合せを持つ装飾を作る。
  // 画像の求人別一意性を保ちつつ、画像だけから元求人を検索しやすくしない。
  const dots = identityPattern(job.sourceId)
  const featurePills = profile.features.map((feature, index) => {
    const width = Math.min(250, 64 + [...feature].length * 29)
    const x = 54 + index * 290
    return `<g transform="translate(${x} 625)"><rect width="${width}" height="58" rx="29" fill="#ffffff" opacity="0.94"/><text x="${width / 2}" y="39" text-anchor="middle" font-size="26" font-weight="800" fill="${profile.accentDark}">${escapeXml(feature)}</text></g>`
  }).join('')

  return `
    <svg width="1080" height="720" viewBox="0 0 1080 720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${profile.accent}"/><stop offset="1" stop-color="${profile.accentDark}"/>
        </linearGradient>
        <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-opacity="0.25"/></filter>
      </defs>
      <style>
        text { font-family: "Noto Sans CJK JP", "Noto Sans JP", sans-serif; }
        .solid { fill: #F8FAFC; stroke: #DCE7F5; stroke-width: 10; filter: url(#shadow); }
        .outline { fill: none; stroke: #F8FAFC; stroke-width: 24; stroke-linejoin: round; filter: url(#shadow); }
        .window { fill: ${profile.accentDark}; opacity: 0.58; }
        .wheel { fill: #172033; stroke: #F8FAFC; stroke-width: 18; }
        .line { fill: none; stroke: #F8FAFC; stroke-width: 24; stroke-linecap: round; stroke-linejoin: round; filter: url(#shadow); }
        .badge { fill: #FACC15; filter: url(#shadow); }
        .check { fill: none; stroke: #172033; stroke-width: 15; stroke-linecap: round; stroke-linejoin: round; }
      </style>
      <rect width="1080" height="720" fill="url(#bg)"/>
      ${dots}
      <text x="54" y="82" font-size="30" font-weight="800" fill="#ffffff" opacity="0.92">RIDE JOB CAREER</text>
      <text x="54" y="148" font-size="55" font-weight="900" fill="#ffffff">${escapeXml(profile.sceneLabel)}</text>
      <g transform="translate(0 20)">${vehicleSvg(profile.scene)}</g>
      ${featurePills}
    </svg>`
}
