import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCatalogJob, isMetaCatalogJob } from './catalog-classification.mts'

test('uses the microCMS category before a conflicting title', () => {
  assert.equal(
    classifyCatalogJob({
      jobCategory: { name: '運行管理者' },
      title: 'タクシー会社の運営スタッフ',
    }),
    'dispatch',
  )
})

test('does not classify sales or bus jobs as taxi jobs', () => {
  assert.equal(classifyCatalogJob({ jobCategory: { name: '営業' }, title: 'タクシー営業所の所長' }), 'other')
  assert.equal(classifyCatalogJob({ jobCategory: { name: 'バスドライバー' }, title: '路線バス運転士' }), 'other')
})

test('rejects sales roles that only mention mechanic recruiting as their sales target', () => {
  assert.equal(
    classifyCatalogJob({
      jobCategory: { name: '営業' },
      jobName: '営業マネージャー候補 / 整備士人材/拠点長候補',
    }),
    'other',
  )
})

test('recovers clearly named catalog roles from known sales-category input errors', () => {
  assert.equal(
    classifyCatalogJob({ jobCategory: { name: '営業' }, jobName: 'タクシードライバー / 未経験OK' }),
    'taxi',
  )
  assert.equal(
    classifyCatalogJob({ jobCategory: { name: '営業' }, jobName: '自動車整備工場のフロントスタッフ' }),
    'mechanic',
  )
})

test('falls back to the title when the category is missing', () => {
  assert.equal(classifyCatalogJob({ title: '未経験から始めるタクシードライバー' }), 'taxi')
  assert.equal(classifyCatalogJob({ title: '自動車整備士専門学校の教員' }), 'mechanic')
})

test('only catalog occupations attach product content IDs to Meta events', () => {
  assert.equal(isMetaCatalogJob({ jobCategory: { name: 'タクシードライバー' }, title: '乗務員募集' }), true)
  assert.equal(isMetaCatalogJob({ jobCategory: { name: '営業' }, title: 'タクシー会社の営業所長' }), false)
})
