import Link from "next/link"
import Image from "next/image"
import SiteHeader from "@/shared/components/site-header"
import SiteFooter from "@/shared/components/site-footer"
import JobCard from "@/features/jobs/components/job-card"
import type { Job } from "@/features/jobs/types"
import ExternalJobsSection from "@/features/external-jobs/components/external-jobs-section"
import type { ExternalJob } from "@/features/external-jobs/types"
import {
  generateBreadcrumbStructuredData,
  generateItemListStructuredData,
  generateFaqStructuredData,
} from "@/shared/lib/metadata"
import type { HubStats, HubFaq } from "@/features/hub/lib/hub"
import type { InventoryBreakdown } from "@/features/hub/lib/inventory"

export interface HubRelatedGroup {
  title: string
  links: Array<{ label: string; href: string }>
}

/** ハブ→メディア記事の相互リンク（P1-1）。href はメディア（別ゾーン）の絶対URL。 */
export interface HubArticleLink {
  title: string
  href: string
  image?: string
  date?: string
}

export interface HubCategoryContent {
  catName: string
  work: string
  license: string
  career: string
}

interface HubPageProps {
  breadcrumb: Array<{ name: string; url?: string }>
  h1: string
  lead: string
  /** 概要見出しに使うラベル（例: 東京都のタクシードライバー） */
  summaryLabel: string
  /** 実データ由来の傾向要約文 */
  summary: string
  stats: HubStats
  totalCount: number
  jobs: Job[]
  /** 職種の解説（県×職種・職種ハブで表示。県ハブでは省略） */
  categoryContent?: HubCategoryContent
  /** CMS(hub-contents)の手書き本文HTML（あれば表示） */
  bodyHtml?: string
  faqs?: HubFaq[]
  /** 「すべて見る」CTA のリンク先（絞り込み済み /search）。表示件数<総件数なら件数付きラベル */
  moreHref?: string
  related?: HubRelatedGroup[]
  /** 関連お役立ち記事（メディア）へのリンク */
  relatedArticles?: HubArticleLink[]
  /** クロール用の求人リンク一覧（表示カードより広く各求人詳細へ内部リンクを張る / SEO内部リンク深化） */
  jobLinks?: Array<{ id: string; name: string }>
  /** 企業ハブなどでH1の横に表示する識別画像。通常ハブでは省略。 */
  heroImage?: { src: string; alt: string }
  /** heroImage が無いときの代替。社名をそのままタイポグラフィで見せる（ロゴを持たない企業ページ用）。 */
  heroLabel?: string
  /** ヒーロー上の小見出し。heroImage / heroLabel のどちらかがあるときだけ表示する。 */
  heroEyebrow?: string
  /** 掲載求人がすべて同一法人（企業ページ）。件数まわりの単位表記を切り替える。 */
  singleCompany?: boolean
  /**
   * 掲載中求人そのものから作った内訳（給与の分布・勤務条件別の件数）。
   * 「◯◯ 給料 / 年収 / 相場」「日勤のみ」「寮あり」のような条件つきクエリに実数で答えるための一次情報。
   * 競合が真似できない材料なので、在庫のある職種ハブでは必ず渡す。
   */
  inventory?: InventoryBreakdown
  /** ハローワーク転載求人（自社求人とは別枠・出典明記で表示。対応職種のみ） */
  external?: {
    jobs: ExternalJob[]
    count: number
    region: string
    catName: string
    selfJobsHref: string
    /** 「もっと見る」の追加読み込み用（/api/external-jobs へ渡す絞り込み条件） */
    query: { cat?: string; feature?: string; pref?: string; muni?: string }
  }
}

const jsonLd = (obj: unknown) => JSON.stringify(obj).replace(/</g, "\\u003c")

export default function HubPage({
  breadcrumb,
  h1,
  lead,
  summaryLabel,
  summary,
  stats,
  totalCount,
  jobs,
  categoryContent,
  bodyHtml,
  faqs = [],
  moreHref,
  related = [],
  relatedArticles = [],
  jobLinks = [],
  heroImage,
  heroLabel,
  heroEyebrow,
  singleCompany = false,
  inventory,
  external,
}: HubPageProps) {
  const hasHero = Boolean(heroImage || heroLabel)
  // companyCount は companyName のユニーク数。地域・職種ハブでは「掲載企業◯社」で正しい。
  //
  // ⚠️ 企業ページ（singleCompany）では出さない。全件が同じ会社なので意味としては
  // 「営業所・店舗の数」になるが、companyName は自由記述で表記ゆれがあり正しく数えられない。
  // 実測: 京浜交通は「京浜交通株式会社 弁天橋営業所」「京浜交通 株式会社 弁天橋営業所」
  // 「京浜交通グループ　京浜交通株式会社 弁天橋営業所」が別物として3回数えられ、実質3拠点が
  // 7拠点と出ていた。日興自動車に至っては「運行管理者」「事故交渉人」という職種名つきの
  // 同一社名が拠点として数えられ、実質1拠点が4拠点になっていた（正規化でも解けない）。
  // 誤った件数を index されるページに出すのは、このPRが解こうとしている問題そのもの。
  // 拠点数を確実に出せる根拠（構造化された営業所マスタ）ができるまでは非表示にする。
  const showCompanyCount = !singleCompany && stats.companyCount > 0
  const breadcrumbLd = generateBreadcrumbStructuredData(breadcrumb)
  // ItemList はこのページに実際に並ぶ求人（自社＋外部）を列挙する。
  // 自社求人0件・外部求人のみのハブ（例: 青森県×トラックドライバー）で
  // itemListElement が空になり「中身のないページ」と受け取られるのを避けるため。
  const itemListItems = [
    ...jobs.map((j) => ({ url: `/job/${j.id}`, name: j.jobName ?? j.title })),
    // URLの作り方は ExternalJobsSection のカードと完全に揃える（source は素通し・sourceId のみエンコード）
    ...(external?.jobs ?? []).map((j) => ({
      url: `/external-job/${j.source}/${encodeURIComponent(j.sourceId)}`,
      name: j.title,
    })),
  ]
  // 1件も無いなら ItemList 自体を出さない（空の構造化データは無意味なため）
  const itemListLd = itemListItems.length > 0 ? generateItemListStructuredData(itemListItems) : null
  const faqLd = faqs.length > 0 ? generateFaqStructuredData(faqs) : null

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd) }} />
      {itemListLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListLd) }} />
      )}
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }} />}
      <SiteHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav aria-label="パンくずリスト" className="text-sm text-gray-500 mb-4">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumb.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {b.url ? (
                  <Link href={b.url} className="hover:underline">{b.name}</Link>
                ) : (
                  <span className="text-gray-700">{b.name}</span>
                )}
                {i < breadcrumb.length - 1 && <span className="mx-1 text-gray-400">/</span>}
              </li>
            ))}
          </ol>
        </nav>

        <div className={hasHero ? "flex flex-col gap-5 sm:flex-row sm:items-center" : undefined}>
          {heroImage ? (
            <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-4 sm:w-64">
              <div className="relative h-16 w-full">
                <Image
                  src={heroImage.src}
                  alt={heroImage.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 256px"
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          ) : heroLabel ? (
            // ロゴを持たない企業でも枠のサイズを揃え、社名を長さに応じて縮めて収める
            <div
              aria-hidden="true"
              className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 sm:w-64"
            >
              <span
                className={`text-center font-bold leading-snug text-gray-800 ${
                  heroLabel.length > 14 ? "text-base" : "text-xl"
                }`}
              >
                {heroLabel}
              </span>
            </div>
          ) : null}
          <div>
            {hasHero && heroEyebrow && <p className="mb-1 text-sm font-semibold text-primary">{heroEyebrow}</p>}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{h1}</h1>
            <p className="mt-3 text-gray-600 leading-relaxed">{lead}</p>
          </div>
        </div>

        {/* 概要・傾向（実データ由来の一次情報） */}
        <section className="mt-8" aria-labelledby="hub-overview">
          <h2 id="hub-overview" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
            {summaryLabel}の求人の傾向
          </h2>
          {summary && <p className="mt-3 text-gray-700 leading-relaxed">{summary}</p>}
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 掲載件数はページに実際に並ぶ求人の合計（媒体別の内訳は出さない）。 */}
            <div className="rounded-lg bg-gray-50 p-3">
              <dt className="text-xs text-gray-500">掲載件数</dt>
              <dd className="text-lg font-bold text-gray-900">
                {totalCount + (external?.count ?? 0)}件
              </dd>
            </div>
            {stats.salaryText && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs text-gray-500">月給の中心帯</dt>
                <dd className="text-lg font-bold text-gray-900">{stats.salaryText}</dd>
              </div>
            )}
            {showCompanyCount && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs text-gray-500">掲載企業</dt>
                <dd className="text-lg font-bold text-gray-900">{stats.companyCount}社</dd>
              </div>
            )}
            {stats.employmentText && (
              <div className="rounded-lg bg-gray-50 p-3">
                <dt className="text-xs text-gray-500">雇用形態</dt>
                <dd className="text-sm font-semibold text-gray-900">{stats.employmentText}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* 掲載中求人の内訳（実データ由来の一次情報） */}
        {inventory && (inventory.salary || inventory.conditions.length > 0) && (
          <section className="mt-10" aria-labelledby="hub-inventory">
            <h2 id="hub-inventory" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
              掲載中の{summaryLabel}求人の内訳
            </h2>
            {inventory.salary && (
              <p className="mt-3 text-gray-700 leading-relaxed">{inventory.salary.text}</p>
            )}
            {inventory.conditions.length > 0 && (
              <>
                <p className="mt-4 text-gray-700 leading-relaxed">
                  勤務条件ごとの掲載件数です。求人票に記載のある条件だけを数えています。
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[20rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500">
                        <th scope="col" className="py-2 pr-4 font-medium">条件</th>
                        <th scope="col" className="py-2 pr-4 font-medium">掲載件数</th>
                        <th scope="col" className="py-2 font-medium">掲載中の求人に占める割合</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.conditions.map((c) => (
                        <tr key={c.name} className="border-b border-gray-100">
                          <th scope="row" className="py-2 pr-4 font-normal text-gray-900">{c.name}</th>
                          <td className="py-2 pr-4 text-gray-900">{c.count}件</td>
                          <td className="py-2 text-gray-600">{c.share}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {/* 職種の解説（Know意図） */}
        {categoryContent && (
          <section className="mt-10" aria-labelledby="hub-about-job">
            <h2 id="hub-about-job" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
              {categoryContent.catName}の仕事内容・必要な資格
            </h2>
            <div className="mt-3 space-y-4 text-gray-700 leading-relaxed">
              <div>
                <h3 className="font-semibold text-gray-900">仕事内容</h3>
                <p className="mt-1">{categoryContent.work}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">必要な資格・免許</h3>
                <p className="mt-1">{categoryContent.license}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">未経験からのキャリア</h3>
                <p className="mt-1">{categoryContent.career}</p>
              </div>
            </div>
          </section>
        )}

        {/* CMS(hub-contents)の手書き本文（登録があれば） */}
        {bodyHtml && (
          <section
            className="mt-10 text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:mt-4 [&_p]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mt-2 [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        )}

        {/* 求人一覧 */}
        <section className="mt-10" aria-labelledby="hub-jobs">
          <h2 id="hub-jobs" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
            {summaryLabel}の求人一覧
          </h2>
          {jobs.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (external?.count ?? 0) > 0 ? (
            /* 自社求人が0件でも掲載求人自体は下のセクションにある。ここで「求人はありません」と
               出すと、見出しの「◯件」および下の一覧と矛盾する（倉敷市ハブで発生）。 */
            <p className="mt-6 text-gray-500">
              この条件の求人は、下の「{summaryLabel}の求人をもっと見る」にまとめています。
            </p>
          ) : (
            <p className="mt-6 text-gray-500">現在この条件に一致する求人はありません。</p>
          )}
          {/* moreHref の先は自社求人だけの /search。自社が0件のときに出すと、
              このページが「◯件」と名乗った直後に0件へ落とすことになる（東京都×トラックで
              248件→0件が発生していた）。自社求人が実在するときだけ導線を出す。
              自社0件のハブでは、下の外部求人セクションの「もっと見る」が全件への導線になる。 */}
          {moreHref && totalCount > 0 && (
            <div className="mt-8 text-center">
              <Link
                href={moreHref}
                className="inline-flex items-center justify-center min-h-[48px] px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity"
              >
                {jobs.length < totalCount
                  ? `この条件の求人をすべて見る（全${totalCount}件）`
                  : "条件を絞り込んで探す"}
              </Link>
            </div>
          )}

          {/* クロール用の求人リンク一覧（各求人詳細への内部リンクを深める / SEO） */}
          {jobLinks.length > 0 && (
            <div className="mt-10 border-t border-gray-100 pt-6">
              <h3 className="text-sm font-semibold text-gray-500">
                {summaryLabel}の求人一覧（{jobLinks.length}件）
              </h3>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                {jobLinks.map((j) => (
                  <li key={j.id} className="truncate">
                    <Link
                      href={`/job/${j.id}`}
                      className="text-gray-600 hover:text-primary hover:underline"
                    >
                      {j.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ハローワーク転載求人（自社求人とは別枠・出典明記） */}
        {external && (
          <ExternalJobsSection
            jobs={external.jobs}
            count={external.count}
            region={external.region}
            catName={external.catName}
            selfJobsHref={external.selfJobsHref}
            selfJobsCount={totalCount}
            query={external.query}
          />
        )}

        {/* よくある質問（AIO / FAQPage） */}
        {faqs.length > 0 && (
          <section className="mt-12" aria-labelledby="hub-faq">
            <h2 id="hub-faq" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
              よくある質問
            </h2>
            <div className="mt-4 space-y-4">
              {faqs.map((f, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900">Q. {f.question}</h3>
                  <p className="mt-2 text-gray-700 leading-relaxed">A. {f.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 関連お役立ち記事（ハブ→メディアの相互リンク / P1-1） */}
        {relatedArticles.length > 0 && (
          <section className="mt-12" aria-labelledby="hub-articles">
            <h2 id="hub-articles" className="text-xl font-bold text-gray-900 border-l-4 border-primary pl-3">
              {summaryLabel}の仕事を知る・役立つ記事
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {relatedArticles.map((a) => (
                <a
                  key={a.href}
                  href={a.href}
                  className="group block overflow-hidden rounded-lg border border-gray-200 transition-colors hover:border-primary"
                >
                  {a.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image} alt="" loading="lazy" className="h-32 w-full object-cover" />
                  )}
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:underline">
                      {a.title}
                    </p>
                    {a.date && <p className="mt-1 text-xs text-gray-500">{a.date}</p>}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 関連の地域・職種 */}
        {related.map(
          (g) =>
            g.links.length > 0 && (
              <section key={g.title} className="mt-12">
                <h2 className="text-lg font-semibold text-gray-800 mb-3">{g.title}</h2>
                <ul className="flex flex-wrap gap-2">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-flex items-center min-h-[40px] px-3 py-1.5 rounded-full border border-gray-300 text-sm text-gray-700 hover:border-primary hover:text-primary transition-colors"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
