import Link from "next/link"
import type { JobCategory } from "@/features/master/types"
import styles from "./job-categories-section.module.css"

interface JobCategoriesSectionProps {
  categories: JobCategory[]
}

const TILE_VARIANTS = [styles.tile0, styles.tile1, styles.tile2, styles.tile3] as const

export default function JobCategoriesSection({ categories }: JobCategoriesSectionProps) {
  return (
    <section className={styles.section} aria-label="職種から探す">
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            <span className={styles.titleBar} aria-hidden="true" />
            職種から探す
          </h2>
          <span className={styles.sticker}>JOB</span>
        </div>

        <div className={styles.grid}>
          {categories.map((c, i) => (
            <Link
              key={c.id}
              href={c.slug ? `/jobs/category/${c.slug}` : `/search?jobCategory=${encodeURIComponent(c.id)}`}
              className={`${styles.tile} ${TILE_VARIANTS[i % TILE_VARIANTS.length]}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
