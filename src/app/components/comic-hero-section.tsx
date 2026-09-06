"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Search, MapPin } from "lucide-react"
import styles from "./comic-hero-section.module.css"

// ⚠️ 押すと検索窓に入る語なので、**在庫のある職種だけ**を並べること。
//    「フードデリバリー」は掲載求人が無く、押した人を0件の結果に着地させていた。
//    掲載件数（2026-09-04）: トラック9,074 / 整備士8,765 / 配送5,671 / タクシー1,641
const POPULAR_TAGS = [
  "タクシードライバー",
  "トラックドライバー",
  "自動車整備士",
  "未経験OK",
  "高収入",
  "東京23区",
] as const

export default function ComicHeroSection() {
  const router = useRouter()
  const [keyword, setKeyword] = useState("")
  const [area, setArea] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (keyword.trim()) params.set("q", keyword.trim())
    if (area.trim()) params.set("area", area.trim())
    const qs = params.toString()
    router.push(qs ? `/search?${qs}` : "/search")
  }

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit(e as unknown as FormEvent)
  }

  return (
    <section className={styles.hero} aria-label="ライドジョブ ヒーロー">
      <div className={styles.burstBg} aria-hidden="true" />
      <div className={styles.halftone} aria-hidden="true" />
      <div className={styles.grid}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>⚡ 街を支える仕事の求人サイト</span>
          {/* H1はページの主題を表す見出し。キャッチコピーだけだと、Googleにも読み手にも
              何のサイトか伝わらない（旧: 「ガッ！と街を、動かせ。」のみで事業KWがゼロ、
              TOPは平均30.4位）。コピーは主役のまま残し、主題を1行足す。
              ⚠️ 視覚的に隠さないこと。隠しテキストは検索エンジンに操作と見なされうる。 */}
          <h1 className={styles.h1}>
            <span className={styles.ka}>ガッ！</span>と<br />
            <span className={styles.underline}>街を、動かせ</span>。
            <span className={styles.h1sub}>タクシー・トラック・整備士の求人・転職</span>
          </h1>
          <p className={styles.lede}>
            タクシードライバー、トラックドライバー、自動車整備士…
            街を支える仕事の求人を、ライオン社長が本気でマッチングします。
          </p>

          <div className={styles.searchWrap}>
            <form className={styles.searchCard} onSubmit={submit}>
              <label className={styles.searchField} htmlFor="hero-keyword">
                <span className={styles.searchFieldIcon} aria-hidden="true">
                  <Search size={18} strokeWidth={2.5} color="#0a3f9c" />
                </span>
                <span className={styles.searchFieldBody}>
                  <span className={styles.searchLabel}>キーワード</span>
                  <input
                    id="hero-keyword"
                    type="text"
                    className={styles.searchInput}
                    placeholder="ドライバー / 整備士 / デリバリー"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={onEnter}
                  />
                </span>
              </label>
              <label className={styles.searchField} htmlFor="hero-area">
                <span className={styles.searchFieldIcon} aria-hidden="true">
                  <MapPin size={18} strokeWidth={2.5} color="#0a3f9c" />
                </span>
                <span className={styles.searchFieldBody}>
                  <span className={styles.searchLabel}>エリア</span>
                  <input
                    id="hero-area"
                    type="text"
                    className={styles.searchInput}
                    placeholder="東京 / 大阪 / 横浜"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    onKeyDown={onEnter}
                  />
                </span>
              </label>
              <button className={styles.searchSubmit} type="submit">
                <Search size={18} strokeWidth={3} />
                検索する
              </button>
            </form>

            <div className={styles.searchChips}>
              <span className={styles.searchChipLabel}>人気タグ:</span>
              {POPULAR_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={styles.searchChip}
                  onClick={() => setKeyword(t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.lionStage}>
          <Image
            className={styles.heroLion}
            src="/images/ライオン-ヒーロー.png"
            alt="ライドジョブのライオンマスコット"
            width={560}
            height={560}
            priority
          />
          <div className={styles.speechBubble}>
            街にはキミの<br />出番がある！
            <small>— ライオン社長</small>
          </div>
          <div className={styles.pow}>
            街を<br />動かせ！
          </div>
          <div className={styles.panelTag}>ドライバー / 整備士 / デリバリー</div>
        </div>
      </div>
    </section>
  )
}
