/**
 * IndexNow — Bing / Yandex / Naver など対応エンジンへ URL 更新を能動通知する。
 *
 * Google は IndexNow 非対応（sitemap + クロールに任せる）。Bing に載ることは
 * ChatGPT 検索・Microsoft Copilot の参照面に載ることとほぼ同義で、当サイトの
 * AIO 方針（llms.txt 整備・AI 引用ボット許可）と目的が一致する。
 *
 * 仕様: https://www.indexnow.org/documentation
 * - キーは 8〜128 文字の英数字。`https://{host}/{key}.txt` がその key 本文を返す必要がある
 *   （所有権の証明）。当サイトは public/{key}.txt を静的配信する。
 *   ※ env で INDEXNOW_KEY を変える場合は public/ の同名ファイルも差し替えること
 *     （キーとファイルが一致しないと IndexNow が 422 を返す）。
 * - 1リクエストで最大 10,000 URL。同一ホストのURLのみ。
 * - 200/202 が成功。429 はレート超過、422 はキー不一致。
 */

/** 公開情報（所有権証明のため URL で配信する値）。env で上書き可能。 */
export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "618a3ca5f4e2461db7c85a9f30d6e8c7"

/** IndexNow の受け口。どれか1つに送れば参加エンジン全体へ伝播する。 */
const ENDPOINT = "https://api.indexnow.org/indexnow"

export interface IndexNowResult {
  ok: boolean
  status: number
  submitted: number
  message?: string
}

/**
 * URL を IndexNow へ通知する。失敗しても呼び出し元の処理は止めない設計
 * （通知は補助手段であり、sitemap とクロールが本線のため）。
 */
export async function submitToIndexNow(
  urls: string[],
  siteHost = "ridejob.jp",
): Promise<IndexNowResult> {
  const list = Array.from(new Set(urls.filter((u) => u.startsWith(`https://${siteHost}/`))))
  if (list.length === 0) return { ok: true, status: 0, submitted: 0, message: "no urls" }

  // 仕様上の上限は 10,000 件/リクエスト
  const batch = list.slice(0, 10000)
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: siteHost,
        key: INDEXNOW_KEY,
        keyLocation: `https://${siteHost}/${INDEXNOW_KEY}.txt`,
        urlList: batch,
      }),
      // 通知は毎回実行したいのでキャッシュしない
      cache: "no-store",
    })
    return {
      ok: res.status === 200 || res.status === 202,
      status: res.status,
      submitted: batch.length,
      message: res.status === 422 ? "key mismatch" : res.status === 429 ? "rate limited" : undefined,
    }
  } catch (error) {
    console.error("[indexnow] submit failed", error)
    return { ok: false, status: 0, submitted: 0, message: String(error) }
  }
}
