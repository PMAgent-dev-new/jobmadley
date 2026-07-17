import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCatalogDescription,
  buildCatalogTitle,
  CATALOG_DESCRIPTION_MAX_LENGTH,
  CATALOG_TITLE_MAX_LENGTH,
  PM_AGENT_DISCLOSURE,
  validateCatalogCopy,
} from './catalog-copy.mts'

test('buildCatalogTitle keeps one concrete appeal and never cuts the location', () => {
  const title = buildCatalogTitle({
    category: 'taxi',
    sourceTitle: 'タクシードライバー/平均月給30万以上/月18日の休日/配車アプリ中心',
    locality: '八千代市',
  })
  assert.equal(title, 'タクシードライバー｜配車アプリ中心（八千代市）')
  assert.ok(title.length <= CATALOG_TITLE_MAX_LENGTH)
  assert.equal(title.includes('/'), false)
})

test('buildCatalogTitle distinguishes motorcycle and construction-equipment jobs', () => {
  assert.equal(
    buildCatalogTitle({ category: 'mechanic', sourceTitle: 'バイク整備士/寮月1000円/未経験研修', locality: '唐津市' }),
    'バイク整備士｜寮月1000円（唐津市）',
  )
  assert.equal(
    buildCatalogTitle({ category: 'mechanic', sourceTitle: 'ショベル等の建機整備士', locality: '三次市' }),
    '建機・重機整備士（三次市）',
  )
})

test('buildCatalogDescription removes ambiguous voice, stale claims, Q&A, and shared boilerplate', () => {
  const description = buildCatalogDescription({
    category: 'mechanic',
    sourceTitle: '大型車両を担当する自動車整備士',
    companyName: 'UDトラックス株式会社 郡山カスタマーセンター',
    salary: '月給20万円〜40万円',
    employmentType: '正社員',
    region: '福島県',
    locality: '郡山市',
    descriptionWork: '<p>当社では整備業務と受付業務を分業しています。あなたの経験を活かせます。</p><p>【Q1】大型車の経験は必要ですか？</p><p>いいえ。乗用車の整備経験があれば応募できます。</p><p>＼ 経験を活かせる環境 ／ はい、先輩教員が指導方法を説明します。</p>',
    descriptionAppeal: '<p>2024年度の賞与実績は5.2ヶ月です。</p><p>2〜4名のチームで整備します。</p>',
    descriptionPerson: '<p>二級自動車整備士資格をお持ちの方</p>',
    descriptionBenefits: '<p>社会保険完備。資格取得支援制度あり。</p>',
    workHours: '<p>9:00〜17:30</p>',
    holidays: '<p>年間休日110日</p>',
  }, { currentYear: 2026 })

  assert.equal(description.includes('当社'), false)
  assert.equal(description.includes('勤務先企業では整備業務と受付業務を分業しています。'), true)
  assert.equal(description.includes('あなた'), false)
  assert.equal(description.includes('Q1'), false)
  assert.equal(description.includes('いいえ'), false)
  assert.equal(description.includes('はい、'), false)
  assert.equal(description.includes('＼'), false)
  assert.equal(description.includes('乗用車の整備経験があれば応募できます。'), true)
  assert.equal(description.includes('先輩教員が指導方法を説明します。'), true)
  assert.equal(description.includes('2024年度'), false)
  assert.equal(description.includes('2〜4名のチーム'), true)
  assert.equal(description.includes(PM_AGENT_DISCLOSURE), true)
  assert.ok(description.length <= CATALOG_DESCRIPTION_MAX_LENGTH)
  assert.deepEqual(validateCatalogCopy('自動車整備士（郡山市）', description), [])
})

test('buildCatalogDescription never includes unsupported universal guarantees', () => {
  const description = buildCatalogDescription({
    category: 'taxi',
    sourceTitle: 'タクシードライバー',
    companyName: '富士交通株式会社',
    salary: '月給26万円〜35万円',
    employmentType: '正社員',
    region: '東京都',
    locality: '北区',
    descriptionWork: '<p>地域のお客様を安全に目的地までお送りします。</p>',
    descriptionAppeal: '<p>ビザ問題の完全解決。スキルの習得を保証。国籍や経験は問いません。</p>',
    descriptionPerson: '<p>普通免許取得後3年以上の方</p>',
  })
  assert.equal(description.includes('完全解決'), false)
  assert.equal(description.includes('習得を保証'), false)
  assert.equal(description.includes('国籍や経験'), false)
  assert.deepEqual(validateCatalogCopy('タクシードライバー（北区）', description), [])
})
