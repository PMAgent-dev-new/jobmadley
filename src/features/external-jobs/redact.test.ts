import assert from 'node:assert/strict'
import { test } from 'vitest'

import { __testing } from './api'

const { redact, mapRow } = __testing

/** タイトル用の呼び出し。description には corpFallback を掛けない（下のブロック参照）。 */
const redactTitle = (t: string, n?: string) => redact(t, n, { corpFallback: true })

/**
 * 転載求人のタイトルから雇用主の社名を伏せる処理。
 *
 * 出典非表示の運用方針があるので、社名が残るのは方針違反になる。
 * 一方で伏せすぎて職種名が消えると、求職者が何の仕事か分からなくなる。
 * 実データ30,716件で見つかった漏れと、実装中に自分で作り込んだ過剰伏せの
 * 両方を、ここで固定する。
 */

test('登録社名がそのまま出るケースは従来どおり伏せる', () => {
  assert.equal(redact('ルート配送／（株）福糧', '株式会社 福糧'), 'ルート配送／非公開')
  assert.equal(redact('自動車整備（株式会社スズキ自販浜松 小笠店）', '株式会社 スズキ自販浜松'),
    '自動車整備（非公開 小笠店）')
})

test('括弧付きのブランド名・地域名がある登録社名でも伏せられる', () => {
  // 「車検のコバック」が前に付いていて companyCore では一致しなかった
  assert.equal(redact('未経験 自動車整備士 株式会社リューツー', '「車検のコバック」 株式会社リューツー'),
    '未経験 自動車整備士 非公開')
  // 株式会社ツクイ（長野） → タイトルは「ツクイ松本」
  assert.equal(redact('送迎ドライバー／デイサービス／パート／ツクイ松本', '株式会社ツクイ（長野）'),
    '送迎ドライバー／デイサービス／パート／非公開松本')
  assert.equal(redact('二級自動車整備士／イエローハットゆめタウン店', 'イエローハット（株式会社エヌ・アール）'),
    '二級自動車整備士／非公開ゆめタウン店')
  // ブランドが社名の括弧内にだけある場合も伏せる。
  assert.equal(redact('自動車検査員（富山県内のイエローハット各店）', '株式会社 ピア（イエローハット）'),
    '自動車検査員（富山県内の非公開各店）')
})

test('会社名欄の括弧内が都道府県注記なら勤務地を伏せない', () => {
  assert.equal(redact('長野県松本市の送迎ドライバー', '株式会社サンプル（長野県）'),
    '長野県松本市の送迎ドライバー')
})

test('事業所名が非公開の行は企業を特定できる原文を公開しない', () => {
  const row = mapRow({
    source: 'hellowork',
    source_id: '20111-04745161',
    source_name: 'ハローワークインターネットサービス',
    title: '整備士',
    company_name: '（事業所の意向により公開していません）',
    prefecture: '長野県',
    municipality_name: '北佐久郡軽井沢町',
    job_category: '自動車整備士',
    employment_type: '正社員',
    description: '草軽交通株式会社「軽井沢整備工場」で各種自動車を整備します。',
  })
  assert.equal(row.companyRedactionVerified, true)
  assert.equal(row.title, '自動車整備士')
  assert.ok(row.description?.includes('掲載企業名と企業を特定できる仕事内容は公開していません'))
  assert.ok(!row.description?.includes('草軽交通'))
})

test('登録社名と異なる店舗ブランドも公開値に出さない', () => {
  const row = mapRow({
    source: 'hellowork',
    source_id: '01010-25777561',
    source_name: 'ハローワークインターネットサービス',
    title_full: '自動車整備士（ホンダカーズ西釧路）',
    company_name: 'ＳＷＣホンダ株式会社',
    prefecture: '北海道',
    municipality_name: '標津郡中標津町',
    job_category: '自動車整備士',
    employment_type: '正社員',
    description: '私たち『ホンダカーズ西釧路』で購入いただいた車の整備です。',
    work_hours: 'ホンダカーズ西釧路店のシフトによる',
  })
  assert.equal(row.title, '自動車整備士')
  assert.ok(row.description?.includes('北海道標津郡中標津町'))
  assert.ok(!row.description?.includes('ホンダ'))
  assert.equal(row.workHours, undefined)
})

test('登録名の方が長い場合も法人格の隣接語として伏せる', () => {
  // 登録は「タカヨシホールディングス」だがタイトルは「タカヨシ」
  assert.equal(redact('配送ドライバー（株式会社タカヨシ 下妻物流センター）', '株式会社 タカヨシホールディングス', { corpFallback: true }),
    '配送ドライバー（非公開 下妻物流センター）')
})

test('勤務先として書かれた別会社も伏せる', () => {
  assert.equal(redact('正社員：大型ダンプカー運転手／日本海水（株）構内', '有限会社 ネクサス・ライン', { corpFallback: true }),
    '正社員：大型ダンプカー運転手／非公開構内')
})

test('★職種名を巻き込んで伏せない', () => {
  // 法人格語との間に空白を許すと「自動車整備士 株式会社」を一括で伏せてしまい、
  // 求職者が何の仕事か分からなくなる。実装中に実際に作り込んだ不具合。
  const out = redact('未経験 自動車整備士 株式会社リューツー', '「車検のコバック」 株式会社リューツー')
  assert.ok(out?.includes('自動車整備士'), `職種名が消えた: ${out}`)
})

test('★普通名詞を伏せて社名を残さない', () => {
  // 前株を先に処理すると「（株）構内」を掴み、社名「日本海水」を残したまま
  // 普通名詞「構内」を伏せてしまう。実装中に実際に作り込んだ不具合。
  const out = redact('正社員：大型ダンプカー運転手／日本海水（株）構内', '有限会社 ネクサス・ライン', { corpFallback: true })
  assert.ok(!out?.includes('日本海水'), `社名が残った: ${out}`)
  assert.ok(out?.includes('構内'), `普通名詞まで伏せた: ${out}`)
})

test('孤立した法人格語を残さない', () => {
  assert.equal(redact('大型ドライバー（定期便）／ 神谷運送（株）南赤塚営業所', '神谷運送 株式会社'),
    '大型ドライバー（定期便）／ 非公開南赤塚営業所')
})

test('社名が出てこないタイトルは変えない', () => {
  const t = 'タクシードライバー／未経験歓迎／二種免許取得支援あり'
  assert.equal(redact(t, '株式会社サンプル交通'), t)
})

test('1文字の社名では誤爆させない', () => {
  // companyCore は2文字未満を対象外にする（「東」で東京都を伏せない）
  const t = '配送ドライバー／東京都内'
  assert.equal(redact(t, '株式会社 東'), t)
})

/**
 * ここから下は description（地の文）用。
 *
 * #108 は title しか測っておらず、同じ redact が description にも掛かることを
 * 見落としていた。日本語には語の区切りに空白が無いので、法人格語のフォールバックが
 * 「社名」ではなく**前後12文字の地の文**を掴み、本番で250行が壊れていた。
 * 求職者にとっては社名が漏れることより、職種・勤務地・条件が読めなくなる方が重い。
 */

test('★地の文で前後の文脈を食わない（#108の見落とし）', () => {
  // 登録社名と一致しない第三者の社名。伏せられなくてよいので、本文は無傷であるべき。
  const cases = [
    '株式会社三井住友銀行の役員車や部長車の運転',
    '株式会社タダノ製品の修理および整備を行っています',
    '株式会社ムトウ千歳支店での勤務となります',
    'スズキ株式会社の車両を整備します',
    '建設機械レンタル会社「株式会社イマギイレ」の建設機械を',
  ]
  for (const t of cases) {
    assert.equal(redact(t, '株式会社ダミー'), t, `地の文が食われた: ${t}`)
  }
})

test('★地の文でも登録社名は伏せ、条件は残す', () => {
  // 「丸重」は登録社名なので伏せる。ただし「６０歳以上歓迎」は求職者に必要な条件で、
  // 以前は法人格語の手前12文字ごと消えていた。
  const out = redact('◆６０歳以上歓迎！◇（有）丸重清川木材チップ製造部にて、産廃ダンプ', '有限会社 丸重')
  assert.ok(out?.includes('６０歳以上歓迎'), `条件が消えた: ${out}`)
  assert.ok(!out?.includes('丸重'), `社名が残った: ${out}`)
})

test('★孤立した法人格語の掃除はフォールバックより先に走る', () => {
  // 後に走らせると、名前照合で「非公開」になった隣の法人格語を起点に
  // フォールバックが前後の地の文を食う（「株式会社非公開千歳支店での勤務と」が全消し）。
  const out = redact('株式会社ムトウ千歳支店での勤務となります', '株式会社 ムトウ', { corpFallback: true })
  assert.ok(out?.includes('千歳支店'), `勤務地が消えた: ${out}`)
})

test('★鉤括弧を社名の一部として掴まない', () => {
  // 除外が甘いと「会社「株式会社」を社名と誤認し、社名を残したまま前文脈を食う。
  // 作者が直した「（株）構内」の鏡像。
  const out = redact('建設機械レンタル会社「株式会社イマギイレ」の建設機械を', '株式会社ダミー', { corpFallback: true })
  assert.ok(out?.includes('建設機械レンタル会社'), `前文脈が消えた: ${out}`)
  assert.ok(!out?.includes('イマギイレ'), `社名が残った: ${out}`)
})

test('フォールバックは既定で無効（新しい呼び出し元が地の文を壊さない）', () => {
  const t = 'ドライバー／日本海水（株）構内'
  assert.equal(redact(t, '有限会社 ネクサス・ライン'), t)
  assert.equal(redact(t, '有限会社 ネクサス・ライン', { corpFallback: true }), 'ドライバー／非公開構内')
})

test('社名を取得できない行も安全な概要だけにし、匿名化未確認として扱う', () => {
  const row = mapRow({
    source: 'hellowork',
    source_id: '13010-12345678',
    source_name: 'ハローワークインターネットサービス',
    title: '自動車整備士（株式会社サンプル）',
    description: '株式会社サンプルで自動車整備を担当します',
  })
  assert.equal(row.companyName, undefined)
  assert.equal(row.companyRedactionVerified, false)
  assert.ok(row.description?.includes('掲載企業名と企業を特定できる仕事内容は公開していません'))
  assert.ok(!row.description?.includes('サンプル'))
  assert.ok(!row.title?.includes('サンプル'))
})
