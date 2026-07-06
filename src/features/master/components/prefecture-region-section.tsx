import Link from "next/link"
import type { PrefectureGroup } from "@/features/master/types"
import styles from "./prefecture-region-section.module.css"

interface RegionSearchSectionProps {
  prefectures: PrefectureGroup
  countMap: Record<string, number>
}

export default function RegionSearchSection({ prefectures, countMap }: RegionSearchSectionProps) {
  return (
    <section className={styles.section} aria-label="勤務先から探す">
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            <span className={styles.titleBar} aria-hidden="true" />
            勤務先から探す
          </h2>
          <span className={styles.sticker}>AREA</span>
        </div>

        <div className={styles.grid}>
          {Object.entries(prefectures).map(([area, prefs]) => (
            <div key={area} className={styles.regionCard}>
              <div className={styles.regionTag}>{area}</div>
              <div className={styles.prefList}>
                {prefs.map((pref) => (
                  <Link
                    key={pref.id}
                    href={pref.slug ? `/jobs/${pref.slug}` : `/search?prefecture=${encodeURIComponent(pref.id)}`}
                    className={styles.prefLink}
                  >
                    {pref.region}
                    {countMap[pref.id] ? <span className={styles.count}>{countMap[pref.id]}</span> : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
