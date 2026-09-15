import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExternalMechanicSourceSvg, externalImageProfile } from './catalog-external-images.mts'
import type { ExternalCatalogJob } from './catalog-external-jobs.mts'

const job: ExternalCatalogJob = {
  source: 'hellowork',
  sourceId: '27010-41545161',
  sourceName: 'ハローワークインターネットサービス',
  title: '大型トラックの自動車整備士',
  prefecture: '大阪府',
  municipality: '大阪市',
  jobCategory: '自動車整備士',
  employmentType: '正社員',
  salaryKind: '月給',
  salaryMin: 250000,
  salaryMax: 350000,
  salaryRaw: '月給250,000円〜350,000円',
  description: '大型車の車検、点検、修理を行います。',
  expiresAt: '9月30日',
  lastSeen: '2026-09-15T00:00:00Z',
  detail: {
    licenseRequired: '二級自動車整備士',
    training: '資格取得支援制度あり',
    annualHolidays: '年間休日120日',
  },
}

test('externalImageProfile reflects verified job characteristics', () => {
  const profile = externalImageProfile(job)
  assert.equal(profile.scene, 'truck')
  assert.ok(profile.features.includes('研修情報あり'))
  assert.ok(profile.features.includes('年間休日120日'))
  assert.ok(profile.features.includes('資格を活かせる'))
})

test('external image SVG is stable per source id and contains no employer name', () => {
  const first = buildExternalMechanicSourceSvg({ ...job, companyName: '非表示株式会社' })
  const second = buildExternalMechanicSourceSvg({ ...job, companyName: '非表示株式会社' })
  const other = buildExternalMechanicSourceSvg({ ...job, sourceId: '27010-41545261' })
  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.equal(first.includes('27010-41545161'), false)
  assert.equal(first.includes('非表示株式会社'), false)
})

test('does not claim inexperienced applicants are welcome when the source rejects them', () => {
  const profile = externalImageProfile({
    ...job,
    description: '自動車整備の実務経験必須。未経験不可。',
    detail: undefined,
  })
  assert.equal(profile.features.includes('未経験相談可'), false)
})

test('does not claim training is available when the source says there is none', () => {
  const withoutTraining: ExternalCatalogJob = {
    ...job,
    description: '自動車の点検と整備を担当します',
    detail: { training: '研修制度 なし' },
  }
  assert.equal(externalImageProfile(withoutTraining).features.includes('研修情報あり'), false)
})

test('recognizes polite negative training wording', () => {
  const withoutTraining: ExternalCatalogJob = {
    ...job,
    description: '自動車の点検と整備を担当します',
    detail: { training: '研修制度はありません' },
  }
  assert.equal(externalImageProfile(withoutTraining).features.includes('研修情報あり'), false)
})

test('does not highlight a training record that only says non-employees cannot use it', () => {
  const withoutTrainingDetail: ExternalCatalogJob = {
    ...job,
    description: '自動車の点検と整備を担当します',
    detail: { training: '研修制度の正社員以外の利用：「不可」' },
  }
  assert.equal(externalImageProfile(withoutTrainingDetail).features.includes('研修情報あり'), false)
})

test('does not claim a holiday system when the source explicitly says there is none', () => {
  const profile = externalImageProfile({
    ...job,
    description: '自動車の整備。週休二日制なし。土日休みではありません。',
    detail: { holidays: '週休二日制 なし' },
  })
  assert.equal(profile.features.includes('休日制度あり'), false)
})

test('does not treat weekend holiday work as weekends off', () => {
  const profile = externalImageProfile({
    ...job,
    description: '土日休日出勤あり。休日制度の記載はありません。',
  })
  assert.equal(profile.features.includes('休日制度あり'), false)
})

test('does not treat a nearby bus stop as a bus maintenance job', () => {
  const carJob: ExternalCatalogJob = {
    ...job,
    title: '自動車整備士',
    description: '最寄りのバス停から徒歩5分。普通乗用車の点検整備。',
    detail: undefined,
  }
  assert.equal(externalImageProfile(carJob).scene, 'inspection')
})

test('does not treat motorcycle commuting as motorcycle maintenance', () => {
  const carJob: ExternalCatalogJob = {
    ...job,
    title: '自動車整備・トラック鈑金',
    description: '自転車・バイク通勤可。自動車の点検と鈑金を担当します。',
    detail: undefined,
  }
  assert.notEqual(externalImageProfile(carJob).scene, 'bike')
})

test('does not infer an equipment-maintenance scene from a forklift license alone', () => {
  const carJob: ExternalCatalogJob = {
    ...job,
    title: '自動車整備士',
    description: '普通乗用車の点検と整備を担当します。',
    detail: { licenseRequired: 'フォークリフト運転技能者 あれば尚可' },
  }
  assert.equal(externalImageProfile(carJob).scene, 'inspection')
})

test('does not infer equipment maintenance from using a forklift to move parts', () => {
  const profile = externalImageProfile({
    ...job,
    title: '自動車整備士',
    description: 'フォークリフトを使用して部品を運び、普通乗用車の点検整備を行います。',
  })
  assert.equal(profile.scene, 'inspection')
})

test('does not infer a truck-maintenance scene from a large-vehicle license alone', () => {
  const carJob: ExternalCatalogJob = {
    ...job,
    title: '自動車整備士',
    description: '普通乗用車の点検と整備を担当します。',
    detail: { licenseRequired: '大型自動車免許 あれば尚可' },
  }
  assert.equal(externalImageProfile(carJob).scene, 'inspection')
})

test('does not highlight a bonus when the source says there is none', () => {
  const withoutBonus: ExternalCatalogJob = {
    ...job,
    description: '自動車の点検と整備を担当します',
    detail: { bonus: '賞与制度なし' },
  }
  assert.equal(externalImageProfile(withoutBonus).features.includes('賞与情報あり'), false)
})

test('highlights a bonus only when the detail contains a positive bonus fact', () => {
  const withBonus: ExternalCatalogJob = {
    ...job,
    description: '自動車の点検と整備を担当します',
    detail: { bonus: '賞与あり 前年度実績 年2回' },
  }
  assert.equal(externalImageProfile(withBonus).features.includes('賞与情報あり'), true)
})

test('recognizes the Hello Work positive bonus field without treating 有無 as a negative', () => {
  const withBonus: ExternalCatalogJob = {
    ...job,
    description: '自動車の点検と整備を担当します',
    detail: { bonus: '賞与制度の有無 あり 賞与（前年度実績）の有無 あり 賞与（前年度実績）の回数 年2回' },
  }
  assert.equal(externalImageProfile(withBonus).features.includes('賞与情報あり'), true)
})
