/**
 * Meta カタログ商品の遷移先 URL を組み立てる。
 *
 * 整備士（mechanic）だけは求人詳細ページ `/job/{id}` ではなく、応募フォーム
 * `/entry/mechanic` に着地させる。
 *
 * 2026-07〜08 のカタログ配信（整備士）は `/job/{id}` 着地で ¥135,477 を消化し、
 * Lark の実応募は 0〜2 件だった（クリックは出ているのに応募が無い）。一方、同じ整備士でも
 * `/entry/mechanic` に着地する広告は応募・面談を出している。求人カードで興味を引き、
 * 実績のある応募フォームへ直行させる検証として、整備士だけ切り替える。
 *
 * ## 整備士の URL に utm を付けない理由
 * 広告側の url_tags が `utm_source={{site_source_name}}&utm_medium=ad&utm_content={{ad.name}}…` を
 * 付ける。商品URLにも utm を書くと同じキーが二重になり、form_applicant は
 * `URLSearchParams.get`（先頭の値が勝つ）で読むため、どちらが採用されるかが Meta の URL 組み立て順に
 * 依存してしまう。商品側の `utm_medium=catalog` が勝つと form_applicant は広告と認識せず
 * （AD_MEDIUMS に無い）、Lark の「応募経由」が空欄になって日次レポートから消える。
 * → 整備士は `job_id` だけを渡し、utm は url_tags に一本化する。
 *
 * 求人IDは `job_id` で渡す。form_applicant はクエリ付きの着地URL（送信時の Referer）を
 * Lark Base の `LP_URL` に保存しているので、フォームを改修しなくても求人単位で突合できる。
 *
 * タクシー等の他職種は従来どおり `/job/{id}`（jobmadley 側の応募導線）で、URL も1文字も変えない。
 */
export function buildCatalogLink(jobId: string, category: string): string {
  const id = encodeURIComponent(jobId)
  if (category === 'mechanic') {
    return `https://ridejob.jp/entry/mechanic?job_id=${id}`
  }
  return `https://ridejob.jp/job/${id}?utm_content=${id}&utm_source=meta&utm_medium=catalog`
}

/** 行の遷移先が職種に対して正しいか（フィード全行の公開前検査に使う）。 */
export function isCatalogLinkRoutedCorrectly(jobId: string, category: string, link: string): boolean {
  return link === buildCatalogLink(jobId, category)
}
