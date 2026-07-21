/**
 * 求人詳細（/job/[id]）のFAQ生成。
 * ハブの buildHubFaqs（src/features/hub/lib/hub.ts）と同じ思想で、「その求人の実データから
 * 言えることだけ」をQ&A化する。データが無い項目はFAQ自体を出さない（空文字や「情報なし」を
 * 出すと、実体のない回答を FAQPage で宣言することになり品質ガイドライン違反になるため）。
 *
 * ここで返した文字列は本文表示（app/job/components/job-faq.tsx）と JSON-LD の双方で
 * そのまま使う。整形をこのモジュールに一本化しているのは、本文とJSON-LDの文言を
 * 完全一致させるため（不一致は FAQPage のガイドライン違反）。
 *
 * ⚠️ 外部求人（/external-job/…）は noindex 方針のため、この関数を使わないこと。
 */
import type { JobDetail } from "@/features/jobs/types"
import { formatSalary, normalizeCmsText } from "@/shared/lib/utils"

export interface JobFaq {
  question: string
  answer: string
}

/** 回答に埋め込む自由入力欄の最大長。CMSの長文がそのまま回答になるのを防ぐ */
const FAQ_ANSWER_MAX = 300

/**
 * CMS入稿値をFAQの回答に載せられる形へ整形。空なら undefined を返し、呼び出し側でFAQごと落とす。
 * 装飾記号（✅ など）とタグ・改行の除去は meta description と同じ normalizeCmsText に委譲する。
 * ここを素の空白畳みだけにすると、salaryNote 等の「✅」が回答文と構造化データに露出する。
 */
const normalize = (value?: string): string | undefined => {
  const text = normalizeCmsText(value)
  if (!text) return undefined
  return text.length > FAQ_ANSWER_MAX ? `${text.slice(0, FAQ_ANSWER_MAX)}…` : text
}

/** 文中に埋め込む値。末尾の句読点を落として「〜です。です。」の二重句点を防ぐ */
const phrase = (value?: string): string | undefined =>
  normalize(value)?.replace(/[。．、，.,]+$/, "")

/**
 * 職種カテゴリ（slug）から言える免許・資格の一般論。
 * ハブの catContent.license を import しない理由は2つ。
 *  1) ハブ用の文面をそのまま1,404ページへ複製すると、ハブと求人詳細が丸ごと同一段落になる
 *  2) hub.ts を import すると hub-contents.data.json（約290KB）が求人詳細のバンドルに載る
 * 文面は「一般に必要な免許」までに留め、この求人固有の条件は募集内容へ誘導する（断定しない）。
 */
const LICENSE_NOTES: Record<string, string> = {
  "taxi-driver":
    "タクシーの乗務には普通自動車第二種免許が必要です。二種免許の取得費用を会社が負担する求人もあるため、この求人での取得支援の有無は募集内容をご確認ください。",
  "hire-driver":
    "ハイヤーの乗務には普通自動車第二種免許が必要です。取得支援の有無は求人ごとに異なるため、この求人の募集内容をご確認ください。",
  "bus-driver":
    "旅客を乗せてバスを運行する場合は大型自動車第二種免許が必要です。免許取得を支援する養成制度の有無は求人ごとに異なるため、この求人の募集内容をご確認ください。",
  "truck-driver":
    "運転する車両の総重量に応じて準中型・中型・大型免許が必要です。この求人で必要な免許は募集内容をご確認ください。",
  "delivery-driver":
    "軽自動車やバンでの配送は普通自動車免許で始められます。2t・4tなど車両が大きくなる場合は準中型・中型免許が必要です。この求人で必要な免許は募集内容をご確認ください。",
  "shuttle-driver":
    "運賃を収受しない自社の送迎であれば普通自動車免許で運転できます。乗車定員11人以上のマイクロバスは中型免許以上、運賃を収受して旅客を運ぶ場合は二種免許が必要です。この求人で必要な免許は募集内容をご確認ください。",
  "car-mechanic":
    "自動車整備士（3級・2級・1級）などの国家資格があると担当できる作業が広がります。無資格から見習いとして働ける求人もあるため、この求人の応募条件は募集内容をご確認ください。",
  "bike-mechanic":
    "二輪自動車整備士などの資格があると担当できる作業が広がります。未経験から始められる求人もあるため、この求人の応募条件は募集内容をご確認ください。",
  "operation-manager":
    "運行管理者として選任されるには運行管理者資格（旅客・貨物）が必要です。この求人で求められる資格や実務経験は募集内容をご確認ください。",
  "sales":
    "法令上かならず必要となる資格は特にありません。この求人で求められる経験・スキルは募集内容をご確認ください。",
  "back-office":
    "法令上かならず必要となる資格は特にありません。この求人で求められる経験・スキルは募集内容をご確認ください。",
}

/**
 * 求人詳細のFAQを組み立てる。順序は検索意図の強い順（給与→勤務地→勤務時間→資格→人物像→応募）。
 * 生成できるFAQが0件なら空配列を返すので、呼び出し側でセクションもJSON-LDも出さないこと。
 */
export const buildJobFaqs = (job: JobDetail): JobFaq[] => {
  const faqs: JobFaq[] = []
  const catName = job.jobCategory?.name
  const catSlug = job.jobCategory?.slug
  // 質問文の主語。職種名が取れない求人でも自然な日本語になるようフォールバックする
  const target = catName ? `${catName}求人` : "求人"

  // 給与（salaryMin/Max/wageType の実値のみ。どちらも無い求人では出さない）
  if (job.salaryMin || job.salaryMax) {
    const note = phrase(job.salaryNote)
    faqs.push({
      question: `この${target}の給与はいくらですか？`,
      answer: `${formatSalary(job.salaryMin, job.salaryMax, job.wageType)}です。${
        note ? `${note}。` : ""
      }実際の支給額は経験や勤務条件によって異なります。`,
    })
  }

  // 勤務地・アクセス（住所文字列を優先し、無ければ都道府県＋市区町村のリレーションから組む）
  const place =
    phrase(job.addressPrefMuni) ??
    ([job.prefecture?.region, job.municipality?.name].filter(Boolean).join("") || undefined)
  if (place) {
    const access = phrase(job.access)
    faqs.push({
      question: `この${target}の勤務地はどこですか？`,
      answer: `勤務地は${place}です。${
        access ? `アクセスは${access}です。` : ""
      }詳しい所在地は募集内容の「勤務地」をご確認ください。`,
    })
  }

  // 勤務時間・休日（どちらか片方でも記載があれば出す）
  const workHours = phrase(job.workHours)
  const holidays = phrase(job.holidays)
  if (workHours || holidays) {
    const segments: string[] = []
    if (workHours) segments.push(`勤務時間は${workHours}`)
    if (holidays) segments.push(`休日・休暇は${holidays}`)
    faqs.push({
      question: `この${target}の勤務時間や休日はどうなっていますか？`,
      answer: `${segments.join("、")}です。シフトや残業の有無は募集内容をご確認ください。`,
    })
  }

  // 必要な免許・資格（職種カテゴリから言える一般論のみ。未定義の職種では出さない）
  const license = catSlug ? LICENSE_NOTES[catSlug] : undefined
  if (license && catName) {
    faqs.push({
      question: `${catName}として働くには、どんな免許・資格が必要ですか？`,
      answer: license,
    })
  }

  // 未経験可否 → 実データが「未経験歓迎タグ」の時だけ断定できる。
  // タグが無い求人では未経験可否を推測せず、代わりに実記載の「求める人材」を回答にする。
  const beginnerTags = Array.from(
    new Set(
      (job.tags ?? [])
        .map((tag) => tag.name)
        .filter((name) => name && (name.includes("未経験") || name.includes("無資格"))),
    ),
  )
  const person = normalize(job.descriptionPerson)
  if (beginnerTags.length > 0) {
    faqs.push({
      question: `この${target}は未経験でも応募できますか？`,
      answer: `「${beginnerTags.join(
        "」「",
      )}」の条件で掲載している求人です。研修や資格取得支援の内容は求人ごとに異なるため、応募前に募集内容をご確認ください。`,
    })
  } else if (person) {
    faqs.push({
      question: `この${target}はどんな人を求めていますか？`,
      answer: person,
    })
  }

  // 応募の流れ（RIDE JOB は人材紹介。ページ上の応募導線と一致する内容だけを書く）。
  // これは全求人で同一文言になるため、単独では出さない。実データ由来のFAQが1件も無い
  // 求人でこれだけを出すと、1,400ページ超が「同じ1問だけのFAQPage」になり、
  // 重複した低品質の構造化データを量産することになるため。
  if (faqs.length === 0) return []
  faqs.push({
    question: `この${target}にはどうやって応募しますか？`,
    answer:
      "このページの「応募画面へ進む」から応募できます。RIDE JOB（ライドジョブ）は人材紹介サービスのため、応募後は担当者が求人内容の説明や面接日程の調整をサポートします。応募前の相談も可能です。",
  })

  return faqs
}
