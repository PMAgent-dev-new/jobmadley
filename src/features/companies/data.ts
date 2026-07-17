export interface FeaturedCompany {
  slug: string
  name: string
  /** 求人データの companyName に対する部分一致語。複数指定は OR。 */
  matchTerms: string[]
  logoId: string
  logoUrl: string
  /** RIDE JOB上でどの求人を束ねているかを明示する固有説明。 */
  overview: string
}

export const FEATURED_COMPANIES: FeaturedCompany[] = [
  {
    slug: "mk-taxi",
    name: "MKタクシー",
    matchTerms: ["MKグループ", "エムケイ", "滋賀MK"],
    logoId: "f8coyx7-ua",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/6fc9f6acc524411aa72e1bbbb22b4a87/MK.png",
    overview: "MKグループおよび各地域のエムケイ各社について、RIDE JOBに掲載中の求人をまとめています。勤務地や営業所、募集職種、給与条件を求人ごとに比較できます。",
  },
  {
    slug: "yashima-jidosha",
    name: "八洲自動車",
    matchTerms: ["八洲自動車"],
    logoId: "pjpqde_5nj",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/654634aa4f644bf9b1ec50527bbfd9dd/yashima.png",
    overview: "八洲自動車の求人を一覧で確認できます。仕事内容、勤務地、給与、勤務形態、資格取得支援など、応募前に確認したい条件を掲載求人から比較できます。",
  },
  {
    slug: "daiichi-kotsu",
    name: "第一交通",
    matchTerms: ["第一交通"],
    logoId: "3bqq-pafa",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/32157eefcdc14591b21318b853a53241/%E7%AC%AC%E4%B8%80%E4%BA%A4%E9%80%9A.png",
    overview: "第一交通および第一交通産業グループ各社について、RIDE JOBに掲載中の求人をまとめています。地域・営業所ごとの募集条件を横断して比較できます。",
  },
  {
    slug: "heiwa-kotsu",
    name: "平和交通",
    matchTerms: ["平和交通"],
    logoId: "hhsehiqg6chs",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/ff4d77cf423d473eb0adb0a08fbff7b4/s-2951x375_v-frms_webp_d509f349-0142-4d0b-8e86-4fb5efa1c235_small.webp",
    overview: "平和交通の掲載求人を確認するためのページです。募集がある場合は、勤務地、職種、給与、勤務形態などを求人ごとに比較できます。",
  },
  {
    slug: "kawasaki-taxi",
    name: "川崎タクシー",
    matchTerms: ["川崎タクシー"],
    logoId: "0q91e47hq",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/0f12e300c4644fd8adc7f03ee7eb80cf/%E5%B7%9D%E5%B4%8E.png",
    overview: "川崎タクシーおよび掲載企業名に川崎タクシーグループを含む各社の求人をまとめています。営業所ごとの勤務地や採用条件を比較できます。",
  },
  {
    slug: "om-taxi",
    name: "OMタクシー",
    matchTerms: ["OMタクシー"],
    logoId: "i3iqm_9jgb",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/3b9347ba52764d2bafa76662a8b882e5/OM.png",
    overview: "OMタクシーの求人を一覧で確認できます。仕事内容、勤務地、給与、勤務時間、応募条件などを掲載求人から確認できます。",
  },
  {
    slug: "nihon-kotsu",
    name: "日本交通",
    matchTerms: ["日本交通"],
    logoId: "95g84_3h7_8n",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/ed86a263ffd5431c858493a675f2725c/%E6%97%A5%E6%9C%AC%E4%BA%A4%E9%80%9A.png",
    overview: "日本交通株式会社、東京・日本交通株式会社、日本交通横浜株式会社など、掲載企業名に日本交通を含む求人をまとめています。地域・営業所・職種ごとの募集条件を比較できます。",
  },
  {
    slug: "kawasaki-kotsu",
    name: "川崎交通",
    matchTerms: ["川崎交通"],
    logoId: "2puj4qzrmv37",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/719cc1ecc20140d19581c06307fdd83f/s-1395x327_v-fms_webp_12afa523-5bfa-47e6-a5c0-f53375eeda68_small.webp",
    overview: "川崎交通の掲載求人を確認するためのページです。募集がある場合は、勤務地、職種、給与、勤務形態などを求人ごとに比較できます。",
  },
  {
    slug: "milight-taxi",
    name: "未来都",
    matchTerms: ["未来都"],
    logoId: "9s724c2imfil",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/99064ad1bc5d4e0c8ba64b95ede2aa65/%E6%9C%AA%E6%9D%A5%E3%81%A8.png",
    overview: "株式会社未来都の求人を営業所別にまとめています。勤務地、仕事内容、給与、勤務形態、未経験者向けの支援条件などを比較できます。",
  },
  {
    slug: "nikko-jidosha",
    name: "日興自動車",
    matchTerms: ["日興"],
    logoId: "jzhwihacwbw",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/f5874a94a5b8459dbed0ce3b6a9c1d3d/%E6%97%A5%E8%88%88.png",
    overview: "日興自動車、日興タクシーなど、掲載企業名に日興を含む求人をまとめています。募集職種や勤務地、給与、勤務条件を求人ごとに比較できます。",
  },
  {
    slug: "emitas-taxi",
    name: "エミタスタクシー",
    matchTerms: ["エミタス"],
    logoId: "xc9ni56q-zn",
    logoUrl: "https://images.microcms-assets.io/assets/f97b5160748b45bbbe5c3ff8bf27eb9a/96618a3767974326922dd9f7be01c753/%E3%81%88%E3%81%BF%E3%81%9F%E3%81%99.png",
    overview: "エミタスタクシー各社について、RIDE JOBに掲載中の求人をまとめています。営業所ごとの勤務地、募集職種、給与、働き方を比較できます。",
  },
]

export const findFeaturedCompany = (slug: string): FeaturedCompany | undefined =>
  FEATURED_COMPANIES.find((company) => company.slug === slug)

export const findFeaturedCompanyByLogoId = (logoId: string): FeaturedCompany | undefined =>
  FEATURED_COMPANIES.find((company) => company.logoId === logoId)

export const matchesFeaturedCompany = (
  companyName: string | undefined,
  company: FeaturedCompany,
): boolean => Boolean(companyName && company.matchTerms.some((term) => companyName.includes(term)))

