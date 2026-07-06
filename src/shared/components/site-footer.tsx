import Image from "next/image"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { SITE_DESCRIPTION } from "@/shared/lib/metadata"
import styles from "./site-footer.module.css"

// 主要エリア・職種ハブへの全ページ共通リンク網（内部リンク強化）
const FOOTER_AREA_LINKS: Array<{ name: string; slug: string }> = [
  { name: "東京都", slug: "tokyo" },
  { name: "神奈川県", slug: "kanagawa" },
  { name: "埼玉県", slug: "saitama" },
  { name: "千葉県", slug: "chiba" },
  { name: "愛知県", slug: "aichi" },
  { name: "大阪府", slug: "osaka" },
  { name: "兵庫県", slug: "hyogo" },
  { name: "福岡県", slug: "fukuoka" },
  { name: "北海道", slug: "hokkaido" },
  { name: "静岡県", slug: "shizuoka" },
]
const FOOTER_CATEGORY_LINKS: Array<{ name: string; slug: string }> = [
  { name: "タクシードライバー", slug: "taxi-driver" },
  { name: "自動車整備士", slug: "car-mechanic" },
  { name: "バイク整備士", slug: "bike-mechanic" },
  { name: "バスドライバー", slug: "bus-driver" },
  { name: "ハイヤードライバー", slug: "hire-driver" },
  { name: "運行管理者", slug: "operation-manager" },
  { name: "営業", slug: "sales" },
]

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandRow}>
          <div>
            <div className={styles.logoCard}>
              <Image
                src="/images/logo-ridejob.png"
                alt="RIDE JOB"
                width={180}
                height={46}
                className={styles.logoImage}
              />
            </div>
            <p className={styles.description}>{SITE_DESCRIPTION}</p>
          </div>

          <div className={styles.ctaCard}>
            <span className={styles.ctaSticker}>NOW HIRING</span>
            <h3 className={styles.ctaTitle}>あなたにぴったりの求人を探そう</h3>
            <p className={styles.ctaText}>
              タクシードライバー、自動車整備士、フードデリバリーまで。条件で絞り込んで、あなたに合う仕事を見つけよう。
            </p>
            <Link href="/search" className={styles.ctaButton}>
              求人情報を見る
              <ChevronRight size={18} strokeWidth={3} />
            </Link>
          </div>
        </div>

        <div className={styles.linksGrid}>
          <div>
            <h3 className={styles.colTitle}>ライドジョブについて</h3>
            <ul className={styles.list}>
              <li>
                <Link href="/privacy" className={styles.link}>
                  プライバシーポリシー
                </Link>
              </li>
              <li>
                <Link
                  href="https://pmagent.jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  運営会社情報
                </Link>
              </li>
              <li>
                <Link
                  href="https://ridejob.jp/media/contact"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  お問い合わせ
                </Link>
              </li>
              <li>
                <Link href="/about" className={styles.link}>
                  採用企業はこちら
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={styles.colTitle}>エリアから探す</h3>
            <ul className={styles.list}>
              {FOOTER_AREA_LINKS.map((a) => (
                <li key={a.slug}>
                  <Link href={`/jobs/${a.slug}`} className={styles.link}>
                    {a.name}の求人
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={styles.colTitle}>職種から探す</h3>
            <ul className={styles.list}>
              <li>
                <Link href="/jobs/group/driver" className={styles.link}>ドライバー職の求人</Link>
              </li>
              <li>
                <Link href="/jobs/group/mechanic" className={styles.link}>整備士の求人</Link>
              </li>
              {FOOTER_CATEGORY_LINKS.map((c) => (
                <li key={c.slug}>
                  <Link href={`/jobs/category/${c.slug}`} className={styles.link}>
                    {c.name}の求人
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className={styles.colTitle}>運営メディア</h3>
            <ul className={styles.list}>
              <li>
                <Link
                  href="https://ridejob.jp/media/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  ライドジョブ
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>© RIDE JOB</p>
          <span className={styles.bottomMark}>街を、動かせ。</span>
        </div>
      </div>
    </footer>
  )
}
