import Image from "next/image"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/shared/ui/sheet"
import EntryCtaLink from "./entry-cta-link"
import styles from "./site-header.module.css"

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.row}>
          <Link href="/" className={styles.logoLink}>
            <Image
              src="/images/logo-ridejob.png"
              alt="RIDE JOB"
              width={160}
              height={42}
              className={styles.logoImage}
              priority
            />
          </Link>

          <div className={styles.actions}>
            <EntryCtaLink className={`${styles.btn} ${styles.btnSecondary}`}>
              まずお話を聞く
            </EntryCtaLink>
            <Link href="/search" className={`${styles.btn} ${styles.btnPrimary}`}>
              求人情報を見る
            </Link>
          </div>

          <div className={styles.mobileWrap}>
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" aria-label="メニュー" className={styles.menuButton}>
                  <Menu className="h-5 w-5" strokeWidth={2.5} color="#0d1530" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="p-6">
                <SheetHeader>
                  <SheetTitle className="sr-only">メニュー</SheetTitle>
                </SheetHeader>
                <div className={styles.mobileMenu}>
                  <EntryCtaLink className={`${styles.btn} ${styles.btnSecondary}`}>
                    まずお話を聞く
                  </EntryCtaLink>
                  <Link href="/search" className={`${styles.btn} ${styles.btnPrimary}`}>
                    求人情報を見る
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
