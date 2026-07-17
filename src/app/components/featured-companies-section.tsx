import Image from "next/image"
import Link from "next/link"
import { FEATURED_COMPANIES } from "@/features/companies/data"
import styles from "./featured-companies-section.module.css"

export default function FeaturedCompaniesSection() {
  return (
    <section id="featured-companies" className={styles.section} aria-labelledby="featured-companies-title">
      <div className={styles.inner}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>COMPANY</p>
          <h2 id="featured-companies-title" className={styles.title}>企業から求人を探す</h2>
          <p className={styles.description}>
            気になる企業・タクシーグループのロゴから、勤務地や職種、給与条件をまとめて比較できます。
          </p>
        </div>

        <ul className={styles.grid}>
          {FEATURED_COMPANIES.map((company) => (
            <li key={company.slug}>
              <Link
                href={`/companies/${company.slug}`}
                className={styles.card}
                aria-label={`${company.name}の求人を見る`}
              >
                <span className={styles.logoWrap}>
                  <Image
                    src={company.logoUrl}
                    alt=""
                    fill
                    className={styles.logo}
                    sizes="(max-width: 640px) 40vw, (max-width: 1024px) 25vw, 180px"
                  />
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
