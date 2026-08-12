/**
 * ハブページの外部求人セクション「もっと見る」用。24件ずつ追加で返す。
 *
 * なぜサーバー経由か: features/external-jobs/api.ts の Supabase anon key は
 * NEXT_PUBLIC_ を付けずサーバーからのみ使う設計（RLSが安全境界とはいえ、
 * 鍵をブラウザに出さない前提を崩さない）。したがってブラウザから Supabase を
 * 直接叩かせず、このルートを踏ませる。
 *
 * なぜ URL を増やさないか: ハブは index 対象で、?page= のような
 * ページネーションURLはインデックス方針として廃止済み。ここは
 * fetch で継ぎ足すだけなのでクロール対象のURLは1本のまま増えない。
 */
import { NextResponse } from "next/server"
import {
  EXTERNAL_PAGE_SIZE,
  getExternalJobsForCategory,
  getExternalJobsForHub,
  getExternalJobsForMuniHub,
  hasExternalJobsForCategory,
} from "@/features/external-jobs/api"

/** 都道府県名・市区町村名として許すのは日本語の地名文字＋長音/中黒のみ。
 *  PostgREST の eq. フィルタに入る値なので、記号（, . ( ) & など）は通さない。 */
const PLACE_RE = /^[぀-ヿ一-龯ヶヵ々ー・]{1,20}$/

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const cat = sp.get("cat") ?? ""
  const pref = sp.get("pref") ?? ""
  const muni = sp.get("muni") ?? ""

  // 職種は既知 slug のみ（未知なら api 側も空を返すが、ここで弾いて無駄打ちを防ぐ）
  if (!hasExternalJobsForCategory(cat)) return bad("unknown cat")
  if (pref && !PLACE_RE.test(pref)) return bad("bad pref")
  if (muni && !PLACE_RE.test(muni)) return bad("bad muni")

  // offset は総件数（最大でも数万）を超えない範囲に丸める。limit は固定でクライアント指定を受けない。
  const offset = Math.min(Math.max(Number(sp.get("offset") ?? 0) | 0, 0), 100_000)

  const args = { hubCatSlug: cat, limit: EXTERNAL_PAGE_SIZE, offset }
  const { jobs, count } = muni
    ? await getExternalJobsForMuniHub({ ...args, prefectureRegion: pref, municipalityName: muni })
    : pref
      ? await getExternalJobsForHub({ ...args, prefectureRegion: pref })
      : await getExternalJobsForCategory(args)

  return NextResponse.json(
    { jobs, count, nextOffset: offset + jobs.length },
    // 転載求人は日次更新（launchd com.ridejob.hellowork は週次）なので、
    // 1時間キャッシュしても鮮度は十分。Supabase への往復を抑える。
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  )
}
