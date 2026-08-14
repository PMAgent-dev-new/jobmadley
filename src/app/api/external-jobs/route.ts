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
  getExternalJobsByFeature,
  getExternalJobsForCategory,
  getExternalJobsForHub,
  getExternalJobsForMuniHub,
  getExternalJobsForPrefecture,
  hasExternalJobsForCategory,
} from "@/features/external-jobs/api"
import { findFeature } from "@/features/hub/lib/hub"

/** 都道府県名・市区町村名として許すのは日本語の地名文字＋長音/中黒のみ。
 *  PostgREST の eq. フィルタに入る値なので、記号（, . ( ) & など）は通さない。 */
const PLACE_RE = /^[぀-ヿ一-龯ヶヵ々ー・]{1,20}$/

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const cat = sp.get("cat") ?? ""
  const pref = sp.get("pref") ?? ""
  const muni = sp.get("muni") ?? ""
  const feature = sp.get("feature") ?? ""

  // 条件ハブ（/jobs/feature/route-delivery）は職種をまたぐ。cat で継ぎ足すと
  // ページ初期の24件と25件目以降で別の集合になるので、専用モードで同じ条件を続ける。
  // 許すのは HUB_FEATURES に登録済みの slug だけ（任意の絞り込みを外から作らせない）。
  const featureDef = feature ? findFeature(feature) : undefined
  if (feature && !featureDef) return bad("unknown feature")
  // 県ハブ（/jobs/tokyo）は職種横断なので cat を持たない。pref があれば県モードで通す。
  // cat も pref も無い場合だけ弾く（全件返す入口を作らないため）。
  const prefectureMode = !cat && !!pref
  // 職種は既知 slug のみ（未知なら api 側も空を返すが、ここで弾いて無駄打ちを防ぐ）
  if (!featureDef && !prefectureMode && !hasExternalJobsForCategory(cat)) return bad("unknown cat")
  if (pref && !PLACE_RE.test(pref)) return bad("bad pref")
  if (muni && !PLACE_RE.test(muni)) return bad("bad muni")

  // offset は総件数（最大でも数万）を超えない範囲に丸める。limit は固定でクライアント指定を受けない。
  const offset = Math.min(Math.max(Number(sp.get("offset") ?? 0) | 0, 0), 100_000)

  const args = { hubCatSlug: cat, limit: EXTERNAL_PAGE_SIZE, offset }
  const { jobs, count } = featureDef
    ? await getExternalJobsByFeature({ match: featureDef.match, limit: EXTERNAL_PAGE_SIZE, offset })
    : prefectureMode
    ? await getExternalJobsForPrefecture({ prefectureRegion: pref, limit: EXTERNAL_PAGE_SIZE, offset })
    : muni
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
