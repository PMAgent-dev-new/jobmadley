import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  parseAddressPrefMuni,
  stripAddressPrefix,
  displayWidth,
  fitDescription,
} from './metadata'

/**
 * JobPosting の jobLocation.address を組み立てる住所パーサ。
 *
 * ここが失敗すると addressRegion / addressLocality が欠けた構造化データが出て、
 * Google しごと検索の掲載要件を満たせなくなる（GSCから「求人情報の構造化データで
 * 問題が検出されました」が届いた実績あり・2026-09-04）。
 */

test('★都道府県を省いた住所でも解釈できる（GSCの指摘の原因）', () => {
  // 入稿データに「板橋区中丸町」のように都道府県抜きの住所が混じっていた。
  // 従来は正規表現が丸ごと失敗し、region も locality も欠けた markup が出ていた。
  assert.deepEqual(parseAddressPrefMuni('板橋区中丸町'), {
    region: '東京都',
    locality: '板橋区',
    town: '中丸町',
  })
})

test('★他都市に同名の区がある場合は推測しない', () => {
  // 中央区は札幌/千葉/新潟/神戸/福岡/熊本等、港区は大阪市/名古屋市、
  // 北区は大阪/京都/神戸/名古屋/札幌等にもある。
  // 推測すると、大阪の求人を「東京都」と宣言してしまう。
  assert.deepEqual(parseAddressPrefMuni('中央区銀座'), {})
  assert.deepEqual(parseAddressPrefMuni('港区南青山'), {})
  assert.deepEqual(parseAddressPrefMuni('北区赤羽'), {})
})

test('都道府県から始まる住所は従来どおり（回帰）', () => {
  assert.deepEqual(parseAddressPrefMuni('東京都板橋区中丸町 1-2-3'), {
    region: '東京都', locality: '板橋区', town: '中丸町 1-2-3',
  })
  // 政令市は「市＋区」までを locality にする
  assert.deepEqual(parseAddressPrefMuni('北海道札幌市手稲区前田'), {
    region: '北海道', locality: '札幌市手稲区', town: '前田',
  })
  // 「京都府」を「京都」で誤停止させない
  assert.deepEqual(parseAddressPrefMuni('京都府京都市中京区'), {
    region: '京都府', locality: '京都市中京区', town: undefined,
  })
  // 空白区切りの表記ゆれ
  assert.deepEqual(parseAddressPrefMuni('大阪府 枚方市 北中振'), {
    region: '大阪府', locality: '枚方市', town: '北中振',
  })
  // 郡を含む
  assert.deepEqual(parseAddressPrefMuni('宮城県遠田郡美里町関根字堤筒 98'), {
    region: '宮城県', locality: '遠田郡美里町', town: '関根字堤筒 98',
  })
})

test('空・解釈できない文字列では何も返さない', () => {
  assert.deepEqual(parseAddressPrefMuni(undefined), {})
  assert.deepEqual(parseAddressPrefMuni(''), {})
  assert.deepEqual(parseAddressPrefMuni('住所未定'), {})
})

/**
 * 町名（streetAddress）の組み立て。
 *
 * locality はマスタ（job.municipality）で上書きするのに、町名だけパーサの結果を
 * 使っていたため、両者が食い違うと住所が壊れていた。
 * 全1,491件の実測（2026-09-06）で27件が壊れており、うち26件がこの修正の対象。
 * 残る1件は住所に都道府県が無い「板橋区中丸町」で、#113 の23区補完が効いているもの。
 */

test('★空白区切りの住所で町名に市区町村の断片が残らない', () => {
  // パーサが空白を食って「四日市」で停止し、残りが「市 八田」になっていた。
  // マスタが locality を「四日市市」に直しても、町名は直らない。
  assert.equal(stripAddressPrefix('三重県 四日市市 八田', '三重県', '四日市市'), '八田')
  assert.equal(stripAddressPrefix('千葉県 市川市 二俣新町', '千葉県', '市川市'), '二俣新町')
  assert.equal(stripAddressPrefix('千葉県 市原市 五井', '千葉県', '市原市'), '五井')
})

test('★政令市でない市の「区」を町名から落とさない', () => {
  // 姫路市の「飾磨区」は行政区ではなく地名。区として食べると町名から消える。
  assert.equal(
    stripAddressPrefix('兵庫県 姫路市 飾磨区 今在家', '兵庫県', '姫路市'),
    '飾磨区 今在家',
  )
})

test('政令市の行政区は locality 側に含める（回帰）', () => {
  assert.equal(stripAddressPrefix('宮城県仙台市若林区卸町', '宮城県', '仙台市若林区'), '卸町')
  assert.equal(stripAddressPrefix('北海道札幌市手稲区前田', '北海道', '札幌市手稲区'), '前田')
})

test('郡を含む住所でも町名が残る', () => {
  assert.equal(stripAddressPrefix('群馬県佐波郡玉村町川井', '群馬県', '佐波郡玉村町'), '川井')
})

test('取り除けない住所では undefined（呼び出し側がパーサの結果に落とす）', () => {
  assert.equal(stripAddressPrefix('板橋区中丸町', '東京都', '板橋区'), undefined)
  assert.equal(stripAddressPrefix(undefined, '東京都', '板橋区'), undefined)
  assert.equal(stripAddressPrefix('東京都板橋区', '東京都', '板橋区'), undefined)
})

/**
 * meta description の表示幅。
 * 検索結果は文字数ではなく表示幅（全角=2・半角=1）で切られる。
 * 実測（2026-09-06 本番）で全ページが幅140を超えていた（/jobs/tokyo は276）。
 */

test('displayWidth は全角=2・半角=1で数える', () => {
  assert.equal(displayWidth('abc'), 3)
  assert.equal(displayWidth('あいう'), 6)
  assert.equal(displayWidth('東京都のタクシー求人'), 20)
  assert.equal(displayWidth('RIDE JOB'), 8)
})

test('★全角記号を半角と数えない（※ ★ … ①）', () => {
  // CJKの範囲だけを見ていたときは、これらを幅1と数えて上限をわずかに超えていた
  assert.equal(displayWidth('※'), 2)
  assert.equal(displayWidth('★'), 2)
  assert.equal(displayWidth('…'), 2)
  assert.equal(displayWidth('①'), 2)
  assert.equal(displayWidth('Ａ'), 2)
  assert.equal(displayWidth('🚕'), 2)
})

test('半角カナは幅1（全角英数の範囲に紛れさせない）', () => {
  assert.equal(displayWidth('ｱｲｳ'), 3)
})

test('上限に収まっていればそのまま返す', () => {
  const s = '東京都のドライバー求人です。'
  assert.equal(fitDescription(s), s)
})

test('★幅140を超えたら文の区切りで切る', () => {
  const long = '東京都はドライバー・整備士の求人が幅広く集まるエリアです。'.repeat(5)
  const out = fitDescription(long)
  assert.ok(displayWidth(out) <= 140, `幅超過: ${displayWidth(out)}`)
  assert.ok(out.endsWith('。'), out)
})

test('★ブランド名の途中で切らない（半角スペースを切断点にしない）', () => {
  // softBreak が「RIDE JOB」の半角スペースを拾い、「…RIDE…」で終わっていた
  const s =
    '全国のタクシードライバー求人・転職情報をお探しの方へ。未経験からの挑戦もキャリアアップも、RIDE JOBが専任アドバイザーとして無料でサポートします。'
  const out = fitDescription(s)
  assert.ok(!/RIDE\s*…$/.test(out), out)
})

test('★半角のみの長文でも幅を1も超えない（「…」の幅は2）', () => {
  assert.ok(displayWidth(fitDescription('a'.repeat(300))) <= 140)
})

test('句読点が無い長文でも必ず幅に収まる', () => {
  assert.ok(displayWidth(fitDescription('あ'.repeat(300))) <= 140)
})

test('記号だらけの本文でも上限を超えない', () => {
  assert.ok(displayWidth(fitDescription('※'.repeat(200))) <= 140)
  assert.ok(displayWidth(fitDescription('★☆■□'.repeat(50))) <= 140)
})

test('連続する空白・改行は1つに畳む（SERPの表示崩れを防ぐ）', () => {
  assert.equal(fitDescription('東京都の  求人\n情報'), '東京都の 求人 情報')
})

test('上限を明示できる（OGPなど別の予算で使う場合）', () => {
  const out = fitDescription('東京都のドライバー求人が幅広く集まります。整備士も歓迎です。', 20)
  assert.ok(displayWidth(out) <= 20, `幅超過: ${displayWidth(out)}`)
})

test('★予算を大きく余らせるくらいなら節の区切りまで伸ばす', () => {
  // 第1文が短く、次の文が予算に入らないケース。句点だけを見ると幅54で終わり、
  // 予算140の4割しか使えていなかった（本番 /jobs/category/taxi-driver）。
  const lead =
    '全国のタクシードライバー求人・転職情報をお探しの方へ。未経験からの挑戦もキャリアアップも、RIDE JOBが専任アドバイザーとして無料でサポートします。二種免許の取得支援や給与保証のある求人も多数掲載しています。'
  const out = fitDescription(lead)
  assert.ok(displayWidth(out) >= 80, `予算を使えていない: 幅${displayWidth(out)} ${out}`)
  assert.ok(displayWidth(out) <= 140)
  assert.ok(out.includes('未経験'), out)
})

test('次の文が予算に収まるなら文で終わる（節へ伸ばさない）', () => {
  const lead = '大阪府でドライバー・整備士として働きたい方へ。物流・運送から自動車整備まで、幅広い求人が見つかります。' + 'あ'.repeat(100)
  const out = fitDescription(lead)
  assert.ok(out.endsWith('。'), out)
})

/**
 * 求人シンジケーションフィード（/jobs-feed.xml）の勤務地。
 *
 * microCMS のリレーション（municipality / prefecture）が張られていない求人があり、
 * 実測（2026-09-07・全1,491件）で 200件（13.4%）が city と state の両方が空だった。
 * 宛先は Googleしごと検索・求人ボックス・スタンバイで、勤務地が空の求人は
 * 地域を含むクエリに一切マッチしない。
 */

const feedArea = (job: {
  municipality?: { name: string }
  prefecture?: { region: string }
  addressPrefMuni?: string
}) => {
  const parsed = parseAddressPrefMuni(job.addressPrefMuni)
  return { city: job.municipality?.name ?? parsed.locality, state: job.prefecture?.region ?? parsed.region }
}

test('★リレーションが無くても住所から勤務地を出す', () => {
  assert.deepEqual(feedArea({ addressPrefMuni: '岩手県釜石市平田' }), { state: '岩手県', city: '釜石市' })
  assert.deepEqual(feedArea({ addressPrefMuni: '宮城県遠田郡美里町関根字堤筒' }), {
    state: '宮城県',
    city: '遠田郡美里町',
  })
})

test('リレーションがあればそちらを優先する（マスタが正）', () => {
  assert.deepEqual(
    feedArea({
      municipality: { name: '四日市市' },
      prefecture: { region: '三重県' },
      addressPrefMuni: '三重県 四日市市 八田',
    }),
    { state: '三重県', city: '四日市市' },
  )
})

test('住所もリレーションも無ければ undefined（空タグのまま）', () => {
  assert.deepEqual(feedArea({}), { state: undefined, city: undefined })
})
