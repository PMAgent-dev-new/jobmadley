import Image from "next/image"
import Link from "next/link"
import { FEATURED_COMPANIES } from "@/features/companies/data"
import styles from "./featured-companies-section.module.css"

/**
 * 企業ページへの内部リンク。全法人を並べるのは、sitemap だけでなく本文からも辿れる状態にするため。
 * ロゴを持つ社が先、以降は掲載順（companies.data.json の件数降順）で並べる。
 */
const ORDERED_COMPANIES = [
  ...FEATURED_COMPANIES.filter((company) => company.logoUrl),
  ...FEATURED_COMPANIES.filter((company) => !company.logoUrl),
]

export default function FeaturedCompaniesSection() {
  return (
    <section id="featured-companies" className={styles.section} aria-labelledby="featured-companies-title">
      <div className={styles.inner}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>COMPANY</p>
          <h2 id="featured-companies-title" className={styles.title}>企業から求人を探す</h2>
          <p className={styles.description}>
            気になる企業ごとに、勤務地や職種、給与条件をまとめて比較できます。
          </p>
        </div>

        <ul className={styles.grid}>
          {ORDERED_COMPANIES.map((company) => (
            <li key={company.slug}>
              <Link
                href={`/companies/${company.slug}`}
                className={styles.card}
                aria-label={`${company.name}の求人を見る`}
              >
                <span className={styles.logoWrap}>
                  {company.logoUrl ? (
                    <Image
                      src={company.logoUrl}
                      alt=""
                      fill
                      className={styles.logo}
                      sizes="(max-width: 640px) 40vw, (max-width: 1024px) 25vw, 180px"
                    />
                  ) : (
                    // ロゴを新規に集めない方針のため、社名タイポグラフィで枠を埋める
                    <span className={styles.logoFallback} aria-hidden="true">{company.name}</span>
                  )}
                </span>
                <span className={styles.companyName}>{company.name}の求人</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
