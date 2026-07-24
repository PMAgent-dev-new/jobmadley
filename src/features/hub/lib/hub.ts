/**
 * 地域×職種ハブページ共通ロジック（URL・しきい値・リード文・共有データ）。
 */
import { unstable_cache } from "next/cache"
import { getPrefectures } from "@/features/master/prefectures"
import { getJobCategories } from "@/features/master/job-categories"
import { getJobCountMatrix, type JobCountMatrix } from "@/features/jobs/api"
import type { Prefecture, JobCategory } from "@/features/master/types"
import type { Job } from "@/features/jobs/types"
import hubContentsData from "@/features/hub/hub-contents.data.json"

/** 県×職種ハブを生成する最小求人数（これ未満の組合せは薄いページになるため作らない） */
export const HUB_MIN_JOBS = 5

/** 1ハブに表示する求人カードの上限（超過分は絞り込み検索へ誘導） */
export const HUB_LIST_LIMIT = 60

/** 1ページあたりの求人表示件数（ページネーション） */
export const HUB_PAGE_SIZE = 30

/** ?page= を安全に整数ページ番号へ（不正値は1） */
/** ハブURL生成（ルート相対） */
export const hubUrl = {
  prefecture: (prefSlug: string) => `/jobs/${prefSlug}`,
  prefectureCategory: (prefSlug: string, catSlug: string) => `/jobs/${prefSlug}/${catSlug}`,
  category: (catSlug: string) => `/jobs/category/${catSlug}`,
  group: (groupSlug: string) => `/jobs/group/${groupSlug}`,
  // 市区町村×職種（HACK1）。順序は 県→職種→市区町村（既存2セグメントとセグメント名を揃え衝突回避）。
  // 市区町村名は日本語のままURLに置く（ドラEVER等と同方式・エンコードで解決）。
  municipalityCategory: (prefSlug: string, muniName: string, catSlug: string) =>
    `/jobs/${prefSlug}/${catSlug}/${encodeURIComponent(muniName)}`,
}

/**
 * 職種グループ（複数職種をまとめた上位ハブ）。CMSの category 列は入力が不完全なため
 * グルーピングはコード側で定義する。catSlugs は jobcategories の slug。
 */
export interface HubGroup {
  slug: string
  name: string
  /** 含める職種の slug */
  catSlugs: string[]
  lead: string
}
export const HUB_GROUPS: HubGroup[] = [
  {
    slug: "driver",
    name: "ドライバー職",
    catSlugs: [
      "taxi-driver", "bus-driver", "hire-driver", "truck-driver",
      "shuttle-driver", "delivery-driver",
    ],
    lead: "タクシー・バス・ハイヤー・トラック・送迎・配送など、人やモノを運ぶドライバー職の求人をまとめました。二種免許・大型免許の取得支援や未経験歓迎の求人も多く、地域や車種から自分に合った働き方を選べます。",
  },
  {
    slug: "mechanic",
    name: "整備士",
    catSlugs: ["car-mechanic", "bike-mechanic"],
    lead: "自動車・バイクの整備士求人をまとめました。点検・車検・修理など手に職をつけられる専門職で、未経験から資格取得を支援する求人も多数。整備分野・地域から求人を探せます。",
  },
  {
    slug: "management",
    name: "管理・事務職",
    catSlugs: ["operation-manager", "sales", "back-office"],
    lead: "運行管理者・営業・バックオフィスなど、運送/旅客事業を支える管理・事務職の求人をまとめました。資格を活かせる専門職からデスクワークまで、幅広い働き方から選べます。",
  },
]
export const findGroup = (slug: string): HubGroup | undefined => HUB_GROUPS.find((g) => g.slug === slug)
export const groupForCatSlug = (catSlug: string): HubGroup | undefined =>
  HUB_GROUPS.find((g) => g.catSlugs.includes(catSlug))

/**
 * 職種 slug → お役立ち記事（メディア category=4）の検索キーワード（P1-1）。
 * ハブから関連コラムへ相互リンクしトピッククラスタを双方向化する。
 * 未定義の職種は関連記事セクションを出さない（無関係記事の混入を防ぐ）。
 */
const HUB_ARTICLE_KEYWORDS: Record<string, string> = {
  "taxi-driver": "タクシー",
  "bus-driver": "バス運転手",
  "hire-driver": "ハイヤー",
  "truck-driver": "トラック",
  "shuttle-driver": "送迎",
  "delivery-driver": "配送",
  "car-mechanic": "整備士",
  "bike-mechanic": "整備士",
  "operation-manager": "運行管理者",
}
export const hubArticleKeyword = (catSlug?: string): string | undefined =>
  catSlug ? HUB_ARTICLE_KEYWORDS[catSlug] : undefined

/**
 * カテゴリ名の検索シノニム。タイトル・H1・リード文に併記して検索語をカバーする。
 * GSC実測で「表示はあるが順位が伸びない」別名がある職種のみ登録する
 * （例: bike-mechanic は「二輪整備士 募集/派遣」系クエリで表示830件超・平均14〜18位）。
 */
export const HUB_CATEGORY_SYNONYMS: Record<string, string> = {
  "bike-mechanic": "二輪整備士",
}
export const hubCategorySynonym = (catSlug?: string): string | undefined =>
  catSlug ? HUB_CATEGORY_SYNONYMS[catSlug] : undefined
/** シノニムがあれば「バイク整備士（二輪整備士）」の形で併記した名称を返す */
export const catNameWithSynonym = (catName: string, synonym?: string): string =>
  synonym ? `${catName}（${synonym}）` : catName

/** 全件を見るための絞り込み検索URL（/search はUI用・noindex） */
export const searchUrl = (params: { prefectureId?: string; jobCategoryId?: string }) => {
  const q = new URLSearchParams()
  if (params.prefectureId) q.set('prefecture', params.prefectureId)
  if (params.jobCategoryId) q.set('jobCategory', params.jobCategoryId)
  const s = q.toString()
  return s ? `/search?${s}` : '/search'
}

/** リード文（テンプレ＋地域/職種/件数で可変。将来CMSの説明文に差し替え可能） */
export const hubLead = {
  /**
   * externalCount はハローワーク転載求人の件数。タイトルの件数は自社＋外部の合算にしているため、
   * リード文では内訳を明示して「RIDE JOBが紹介できる求人数」と混同されないようにする。
   */
  prefectureCategory: (region: string, catName: string, count: number, externalCount = 0) =>
    `${region}の${catName}求人を${count + externalCount}件掲載しています。未経験歓迎・寮完備・高収入など、${region}で働く${catName}の最新求人情報をまとめました。気になる求人はそのまま応募・相談できます。`,
  prefecture: (region: string, count: number) =>
    `${region}のタクシードライバー・自動車整備士・ドライバー職などの求人を${count}件掲載しています。職種から絞り込んで、${region}で働ける最新の求人情報を探せます。`,
  category: (catName: string, count: number, synonym?: string) =>
    `${catNameWithSynonym(catName, synonym)}の求人を全国で${count}件掲載しています。正社員の中途採用から未経験歓迎の募集まで、地域から絞り込んで条件に合う${catName}の求人を探せます。`,
}

export const hubMuniLead = (region: string, muni: string, catName: string, count: number) =>
  `${region}${muni}の${catName}求人を${count}件掲載しています。未経験歓迎・資格取得支援・寮完備など、${muni}で働く${catName}の最新求人をまとめました。近隣エリアの求人もあわせて探せます。`

export const hubTitle = {
  municipalityCategory: (region: string, muni: string, catName: string) => `${muni}（${region}）の${catName}求人・転職`,
  prefectureCategory: (region: string, catName: string) => `${region}の${catName}求人・転職`,
  prefecture: (region: string) => `${region}のドライバー・整備士求人・転職`,
  category: (catName: string, synonym?: string) => `${catNameWithSynonym(catName, synonym)}の求人・転職（全国）`,
}

/**
 * マスタ（都道府県・職種）と件数マトリクスを1時間キャッシュでまとめて取得する。
 * generateStaticParams・generateMetadata・各ページ描画で共有し、CMSコールを最小化する。
 *
 * 注意: microCMS に職種カテゴリを追加した直後は反映が遅れる（運用上の既知挙動）。
 * このキャッシュ自体は sitemap.ts とハブ各ページで同一エントリを共有している
 * （キーはコールバックのソース＋["hub-master-data"]で、ルートやbuildIdに依存しない）。
 * それでも「sitemap には新ハブURLが載るのにページは404」というズレが出るのは、
 * TTLの時計が独立した層が積み重なっているため:
 *   1. 内側の microCMS fetch キャッシュ（shared/microcms/fetcher.ts の revalidate=3600）
 *   2. この unstable_cache（revalidate=3600）
 *   3. ルート単位のISR（sitemap.ts / ハブページの export const revalidate=3600）
 * 各層は stale-while-revalidate（期限切れ後の最初の1回は古い値を返してから裏で更新）なので、
 * 新カテゴリが全体に行き渡るまで実効で最大2時間程度かかりうる。さらにその途中で新URLを踏むと
 * notFound() の結果が3のISRに乗り、マスタが新しくなっても404が残り続けることがある。
 * 即時反映の仕組み（tags＋revalidateTag／再検証APIエンドポイント）は、カテゴリ追加が年数回の
 * 稀な運用イベントで放置しても自動解消する一方、恒久的なキャッシュ全消し口を抱えることになり
 * 割に合わないため、あえて持たない。手順は docs/search-console-operations.md の6章を参照。
 */
/**
 * マスタ（都道府県・職種）だけを短いTTLで持つ。
 * 求人件数マトリクスと同じ1時間TTLで束ねていたのをやめた理由:
 * マスタは2コール・数十件と軽いのに、ここが古いと「CMSに職種を追加したのにハブが404」に
 * 直結する。一方マトリクスは求人を100件刻みで全件ページングする重い処理で、頻繁に回すと
 * microCMS のレート制限に触れる。性質が違うものを同じ寿命で束ねていたのが遅延の主因だった。
 */
const getHubMasters = unstable_cache(
  async (): Promise<{ prefectures: Prefecture[]; categories: JobCategory[] }> => {
    const [prefectures, categories] = await Promise.all([getPrefectures(), getJobCategories()])
    return { prefectures, categories }
  },
  ["hub-masters"],
  { revalidate: 300 },
)

/** 求人件数マトリクス。全件ページングで重いので長めのTTLを維持する。 */
const getHubMatrix = unstable_cache(
  async (): Promise<JobCountMatrix> => getJobCountMatrix(),
  ["hub-count-matrix"],
  { revalidate: 3600 },
)

export const getHubData = async (): Promise<{
  prefectures: Prefecture[]
  categories: JobCategory[]
  matrix: JobCountMatrix
}> => {
  const [masters, matrix] = await Promise.all([getHubMasters(), getHubMatrix()])
  return { ...masters, matrix }
}

/** 県×職種の件数 */
export const prefCatCount = (m: JobCountMatrix, prefId: string, catId: string): number =>
  m.byPrefectureCategory[`${prefId}:${catId}`] ?? 0

/** slug を持ち、かつ件数条件を満たすものだけを対象にする小ヘルパー */
export const withSlug = <T extends { slug?: string }>(items: T[]): (T & { slug: string })[] =>
  items.filter((i): i is T & { slug: string } => Boolean(i.slug))

/**
 * ハブ本文（lead / body）。
 * 旧実装は microCMS `hub-contents` エンドポイントから取得していたが、無料枠(1サービスにつき5API)に
 * 収めるため、全131件をリポジトリ同梱の hub-contents.data.json へ移行しエンドポイントを廃止した。
 * 以後の本文編集はこのJSONを直接更新する（CMS管理画面では編集不可）。
 * hubKey はハブのURLパス（例: /jobs/tokyo/taxi-driver）。未登録なら null（→テンプレにフォールバック）。
 */
export interface HubContent {
  hubKey: string
  lead?: string
  body?: string
}
const HUB_CONTENTS = hubContentsData as Record<string, { lead?: string; body?: string }>
// ローカルデータの単純参照（fetch なし）。async は呼び出し側の await 互換のため維持。
export const getHubContent = async (hubKey: string): Promise<HubContent | null> => {
  const entry = HUB_CONTENTS[hubKey]
  return entry ? { hubKey, ...entry } : null
}

// =====================
// ハブ本文の独自コンテンツ（thin content 対策）
// =====================

/** 職種ごとの解説（Know意図: 仕事内容・必要資格・キャリア）。slug をキーに保持。 */
export const catContent: Record<
  string,
  { work: string; license: string; career: string }
> = {
  "taxi-driver": {
    work: "タクシードライバーは、街中や駅・空港でお客様を目的地まで安全に送迎する仕事です。近年は配車アプリの普及で効率的に乗客とマッチングでき、流し営業に頼らず稼ぎやすい環境が整っています。歩合を含む給与体系のため、頑張り次第で収入を伸ばせるのが特徴です。",
    license: "普通自動車第二種免許が必要ですが、多くの求人で取得費用の会社負担・支援制度があり、普通免許(一種)があれば未経験・無資格から始められます。入社後に二種免許を取得するケースが一般的です。",
    career: "未経験からでも研修と二種免許取得支援を通じて数か月で独り立ちが可能です。経験を積めば、指導員・運行管理者・営業所管理職などへのキャリアアップや、ハイヤー・介護タクシーへの転向も目指せます。",
  },
  "car-mechanic": {
    work: "自動車整備士は、乗用車や商用車の点検・車検・修理・メンテナンスを担う専門職です。日常点検から故障診断、部品交換まで幅広く対応し、電動化・先進安全装備の普及で専門スキルの需要が高まっています。",
    license: "自動車整備士(3級・2級・1級)などの国家資格が役立ちますが、未経験・無資格から見習いとして入り、働きながら資格取得を支援する求人も多数あります。手に職をつけたい方に向いています。",
    career: "見習いから2級・1級整備士、検査員(自動車検査員)、フロント(サービスアドバイザー)、工場長へとステップアップできます。資格手当で収入も上がりやすく、長く安定して働ける職種です。",
  },
  "bike-mechanic": {
    work: "バイク整備士（二輪整備士）は、オートバイの点検・整備・修理・カスタムを行う仕事です。エンジンや電装系の知識を活かし、車検対応から日常メンテナンスまで担当します。求人は正社員の中途採用が中心で、未経験歓迎の募集もあり、バイク好きにとっては趣味を仕事にできる職種です。",
    license: "二輪自動車整備士などの資格があると有利ですが、未経験から始められる求人もあり、専門スクールと連携して働きながら学べる環境も増えています。",
    career: "整備スキルを高めて主任整備士やショップ店長、カスタムの専門職へと進めます。二輪需要の高い都市部を中心に安定した求人があります。",
  },
  "sales": {
    work: "ドライバー・整備業界の営業は、求人紹介や車両・サービスの提案などを通じて企業と人をつなぐ仕事です。業界知識を活かした提案力が評価され、インセンティブで収入を伸ばせる求人もあります。",
    license: "特別な資格は不要で、未経験歓迎の求人が中心です。コミュニケーション力と行動力があれば挑戦できます。",
    career: "営業実績を積むことでリーダー・マネージャー、企画職などへキャリアアップできます。業界内での人脈も広がります。",
  },
  "operation-manager": {
    work: "運行管理者は、ドライバーの点呼・勤怠管理・安全指導・配車計画など、運送/旅客事業の安全運行を統括する管理職です。法令で配置が義務付けられており、専門性が高く安定した需要があります。",
    license: "運行管理者資格(旅客・貨物)が必要です。実務経験や基礎講習を経て試験に合格することで取得でき、資格取得を支援する会社もあります。",
    career: "運行管理者から営業所長・管理部門へと昇進する道が一般的で、事業運営の中核を担うポジションへ進めます。",
  },
  "hire-driver": {
    work: "ハイヤードライバーは、企業役員やVIPを対象に予約制で送迎を行う仕事です。上質な接遇と安全運転が求められ、タクシーより落ち着いた環境で高収入を目指せるのが魅力です。",
    license: "普通自動車第二種免許が必要ですが、取得支援制度のある求人もあります。接遇マナーを重視した研修が用意されています。",
    career: "経験を積むことで役員専属や管理職、教育担当などへとステップアップできます。安定した固定客との信頼関係が強みになります。",
  },
  "bus-driver": {
    work: "バスドライバーは、路線バス・観光バス・送迎バスなどで多くの乗客を安全に運ぶ仕事です。地域交通を支える社会的意義の大きい職種で、シフト制で計画的に働けます。",
    license: "大型自動車第二種免許が必要ですが、養成制度で免許取得を全面支援し、未経験から採用する求人も増えています。",
    career: "路線・観光・高速など多様な乗務を経験し、指導運転士や運行管理者へと進めます。長期的に安定して働けます。",
  },
  "truck-driver": {
    work: "トラックドライバーは、荷物を目的地へ届ける物流の要となる仕事です。地場配送から長距離まで多様な働き方があり、EC拡大を背景に需要が安定しています。",
    license: "運ぶ車両に応じて中型・大型免許が必要です。免許取得支援や、まずは小型から始められる求人もあります。",
    career: "経験を積んで大型・けん引へステップアップし、収入アップや運行管理者への道も開けます。",
  },
  "delivery-driver": {
    work: "配送ドライバーは、決まった取引先や個人宅へ荷物を届ける仕事です。得意先を毎日回るルート配送と、個人宅に届ける宅配があり、扱う車両は軽自動車から2t・4tまで求人によって幅があります。担当エリアが決まっているため、慣れると1日の流れが読みやすいのが特徴です。",
    license: "軽自動車やバンでの配送は普通自動車免許で始められます。2t・4tなど車両が大きくなる場合は準中型・中型免許が必要で、2017年3月以降に普通免許を取得した方は車両総重量3.5t未満までが運転できる範囲です。",
    career: "未経験歓迎の求人が多く、小型車のルート配送から始めて準中型・中型・大型へ免許を広げれば、収入と仕事の幅を伸ばせます。経験を積んで運行管理者や配車担当へ進む道もあります。",
  },
  "shuttle-driver": {
    work: "送迎ドライバーは、介護施設や病院、保育園、ホテル、企業の従業員などを決まったルートで送り迎えする仕事です。ワゴン車やマイクロバスを使い、運行が朝夕に集中するため、中抜け勤務や短時間・パート勤務の求人が多いのが特徴です。",
    license: "運賃を受け取らない自社の送迎であれば、普通自動車免許で始められる求人が多くあります。乗車定員11人以上のマイクロバスを運転する場合は中型免許以上が必要で、運賃を収受して旅客を運ぶ場合は二種免許が必要です。",
    career: "決まったルートと時間帯で働けるため、未経験の方やシニアの入口として選ばれています。経験を積んで二種免許や大型免許を取得すれば、タクシー・バス運転手へ進む道もあります。",
  },
  "back-office": {
    work: "バックオフィス(事務)は、配車・労務・経理・データ入力など、運送/旅客事業の運営を裏側から支える仕事です。デスクワーク中心で、リモート可の求人もあります。",
    license: "特別な資格は不要で、基本的なPCスキルがあれば未経験から挑戦できます。",
    career: "経験を積むことでリーダーや管理部門、総務・人事などの専門職へキャリアアップできます。",
  },
}

const yen = (v: number) => `${Math.round(v / 10000)}万円`

/** ハブ内求人リストから集計した独自の傾向データ（一次情報＝差別化とAIO引用の核） */
export interface HubStats {
  count: number
  salaryText?: string
  employmentText?: string
  companyCount: number
  topTags: string[]
}

export const computeHubStats = (jobs: Job[]): HubStats => {
  // 給与レンジは「月給」の求人だけで集計する。時給・日給・年収の求人を混ぜると
  // 最小値が時給額（例: 1,500円）になり yen() で「月給0万円〜」と壊れた表示になり、
  // 年収求人が混ざれば上限が実態より跳ね上がるため。
  // wageType 未設定は月給扱い（microCMS の既定運用。従来の集計対象と同じ）。
  const monthlyJobs = jobs.filter((j) => {
    const unit = j.wageType?.[0]?.trim()
    return !unit || unit === "月給"
  })
  const mins = monthlyJobs.map((j) => j.salaryMin).filter((n): n is number => typeof n === "number" && n > 0)
  const maxs = monthlyJobs.map((j) => j.salaryMax ?? j.salaryMin).filter((n): n is number => typeof n === "number" && n > 0)
  const salaryText = mins.length > 0 ? `月給${yen(Math.min(...mins))}〜${yen(Math.max(...maxs))}` : undefined

  const empCount: Record<string, number> = {}
  for (const j of jobs) for (const e of j.employmentType ?? []) empCount[e] = (empCount[e] ?? 0) + 1
  const employmentText = Object.entries(empCount)
    .sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `${e}${n}件`)
    .slice(0, 4)
    .join("・") || undefined

  const companies = new Set(jobs.map((j) => j.companyName).filter(Boolean))
  const tagCount: Record<string, number> = {}
  for (const j of jobs) for (const t of j.tags ?? []) if (t.name) tagCount[t.name] = (tagCount[t.name] ?? 0) + 1
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n)

  return { count: jobs.length, salaryText, employmentText, companyCount: companies.size, topTags }
}

/** 地域×職種の傾向を結論ファーストで1〜2文に要約（サンプル=表示中の求人ベース） */
export const buildHubSummary = (label: string, stats: HubStats): string => {
  const parts: string[] = []
  if (stats.salaryText) parts.push(`給与は${stats.salaryText}が中心`)
  if (stats.employmentText) parts.push(`雇用形態は${stats.employmentText}`)
  if (stats.companyCount > 0) parts.push(`掲載企業は${stats.companyCount}社`)
  const head = parts.length > 0 ? `${label}の掲載求人では、${parts.join("、")}となっています。` : ""
  const tag = stats.topTags.length > 0 ? `「${stats.topTags.slice(0, 4).join("」「")}」などのこだわり条件で探せます。` : ""
  return `${head}${tag}`.trim()
}

export interface HubFaq {
  question: string
  answer: string
}

/** 地域×職種FAQ（AIO/フィーチャードスニペット面。回答は本文とも一致させる） */
export const buildHubFaqs = (params: {
  region?: string
  catName?: string
  catSlug?: string
  stats: HubStats
  /** ハローワーク転載求人の件数（あれば件数FAQで内訳を答える） */
  externalCount?: number
}): HubFaq[] => {
  const { region, catName, catSlug, stats, externalCount = 0 } = params
  const where = region ? `${region}で` : ""
  const c = catName ?? "ドライバー・整備士"
  const faqs: HubFaq[] = []

  const salaryNote = stats.salaryText ? `。給与は${stats.salaryText}が中心です` : ""
  faqs.push({
    question: `${region ?? "全国"}の${c}求人は何件ありますか？`,
    answer: `RIDE JOB（ライドジョブ）では${region ?? "全国"}の${c}求人を${stats.count + externalCount}件掲載しています${salaryNote}。`,
  })

  const lic = catSlug ? catContent[catSlug]?.license : undefined
  faqs.push({
    question: `未経験・無資格でも${where}${c}になれますか？`,
    answer: lic
      ? lic
      : `未経験歓迎の求人が多く、研修や資格取得支援を利用して${where}${c}を目指せます。まずは条件に合う求人からご相談ください。`,
  })

  if (stats.salaryText) {
    faqs.push({
      question: `${region ?? "全国"}の${c}の給与相場は？`,
      answer: `掲載中の${c}求人では${stats.salaryText}が中心です。歩合や手当により、経験や勤務条件によって収入は変動します。`,
    })
  }

  return faqs
}
