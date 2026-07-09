const CHILD_BENEFIT_CONTEXT = /手当|支給|扶養|児童|お子|子ども|こども|子供/
const BENEFIT_CONTEXT =
  /手当|支給|扶養|児童|お子|子ども|こども|子供|定年|再雇用|経験|勤続|運転(歴|経験)|免許|普通車|大型|二種|入社\d|歴\d|実務\d|キャリア\d|年以上の(経験|実務|キャリア)/

type Rule = { re: RegExp; action: 'drop' | 'replace'; unless?: RegExp }
const RULES: Rule[] = [
  // 応募条件としての上限年齢は、定年の説明が併記されていても広告から除外する。
  { re: /[0-9０-９]{1,3}\s*歳\s*(以下|未満)(の方|の人|歓迎|対象|応募|採用|限定)?/g, action: 'drop', unless: CHILD_BENEFIT_CONTEXT },
  { re: /[0-9０-９]{1,3}\s*歳\s*までに\s*入社/g, action: 'drop' },
  { re: /(普通|二種)[^。\n]{0,45}?[0-9０-９]{1,3}\s*歳\s*(位)?\s*(まで|迄)/g, action: 'drop' },
  { re: /(女性|男性)[・、][^。\n]{0,50}(中高年|シニア|[～〜~]\s*[0-9０-９]{1,3}\s*歳)/g, action: 'drop' },
  { re: /(男性|女性|男子|女子)\s*(のみ|限定|歓迎|募集)|男女問わず|性別不問/g, action: 'drop' },
  { re: /[0-9０-９]{1,3}\s*歳\s*(以上|以下|未満|まで)(の方|の人|歓迎|対象|応募|採用|限定)?/g, action: 'drop', unless: BENEFIT_CONTEXT },
  { re: /[〜~ー－\-–—]\s*[0-9０-９]{1,3}\s*歳/g, action: 'drop', unless: BENEFIT_CONTEXT },
  { re: /(年齢|応募資格)[:：]?[^。\n]{0,10}?[0-9０-９]{1,3}\s*歳/g, action: 'drop', unless: BENEFIT_CONTEXT },
  { re: /(若手|シニア|ミドル)\s*(のみ|限定|歓迎)/g, action: 'drop' },
  { re: /(日本人|外国人|帰化)\s*(のみ|限定)/g, action: 'drop' },
  { re: /(既婚|未婚|独身)\s*(のみ|限定|歓迎)/g, action: 'drop' },
  { re: /(絶対|必ず|確実に儲か|No\.?1|日本一|業界一|最高峰|誰でも稼げる|高収入確約|青天井|天井なし)/gi, action: 'replace' },
]

export function sanitizeCatalogText(text: string): { clean: string; flags: string[] } {
  const flags: string[] = []
  const prefiltered = String(text || '').replace(
    /^.*(?:女性|男性)[・、][^\n]*(?:中高年|シニア|[～〜~]\s*[0-9０-９]{1,3}\s*歳)[^\n]*$/gm,
    (line) => {
      flags.push('[DROP] ' + line.trim().slice(0, 40))
      return ''
    },
  )
  let sentences = prefiltered.split(/(?<=[。\n！？])|(?=・)/)
  sentences = sentences.filter((sentence) => {
    for (const rule of RULES) {
      if (rule.action !== 'drop') continue
      rule.re.lastIndex = 0
      if (!rule.re.test(sentence)) continue
      rule.re.lastIndex = 0
      if (rule.unless && rule.unless.test(sentence)) continue
      flags.push('[DROP] ' + sentence.trim().slice(0, 40))
      return false
    }
    return true
  })

  let output = sentences.join('')
  for (const rule of RULES) {
    if (rule.action !== 'replace') continue
    output = output.replace(rule.re, (match) => {
      flags.push('[REPL] ' + match)
      return ''
    })
  }

  return {
    clean: output
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    flags,
  }
}

export function catalogHtmlToText(html: string): string {
  return String(html || '')
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n・')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x?[0-9a-f]+;/gi, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE00}-\u{FE0F}\u{200D}\u{2122}\u{2139}\u{E000}-\u{F8FF}]/gu, '')
    .replace(/[■□◆◇★☆▼▲▽△●◎※→⇒⇨➡←↑↓✓✔✕✖❌⭕]+/g, '')
    .replace(/[・･‣◦]{2,}/g, '・')
    .replace(/[!！]{2,}/g, '！').replace(/[?？]{2,}/g, '？')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200F\uFEFF]/g, '')
    .replace(/[＆&]/g, 'と').replace(/[<>＜＞]/g, '')
    .replace(/https?:\/\/[^\s　、。)）」』]+/g, '')
    .replace(/(?:[A-Za-z0-9\-]+\.)+(?:co\.jp|jp|com|net|org)(?:\/[^\s　、。]*)?/g, '')
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '')
    .replace(/(?:☎|TEL|Tel|tel|電話番号?|お問[合い]わせ先?)\s*[:：]?\s*/g, '')
    .replace(/0120[-－\s]?\d{2,3}[-－\s]?\d{3,4}/g, '')
    .replace(/0\d{1,4}[-－(（\s]?\d{1,4}[-－)）\s]?\d{3,4}/g, '')
    // 元求人に含まれる装飾罫線と、電話番号除去後に残る空の問い合わせ欄を落とす。
    .replace(/^.*\/{4,}.*$/gm, '')
    .replace(/^[ \t]*(?:[=＝]{4,}|[:：.｡]{6,}|[-－ー━─]{5,})[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:ご連絡先|対応曜日|対応時間|電話番号)[ \t]*[:：]?[ \t]*$/gm, '')
    .replace(/^.*お電話でのご応募.*$/gm, '')
    .replace(/^.*担当へ繋がりましたら.*$/gm, '')
    .replace(/^[ \t]*(?:対応曜日|対応時間)[ \t]*[:：].*$/gm, '')
    .replace(/^.*ご連絡お待ちしております.*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
