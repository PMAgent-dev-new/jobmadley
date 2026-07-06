import { getAllJobsForFeed } from "@/features/jobs/api"
import { buildJobDescriptionHtml, SITE_URL } from "@/shared/lib/metadata"
import type { JobDetail } from "@/features/jobs/types"

// 求人アグリゲーター向け求人フィード（Indeed互換の汎用XML。求人ボックス/スタンバイも取り込み可）。
// 1時間ISRでキャッシュ。掲載申請時に https://ridejob.jp/jobs-feed.xml を提出する。
export const revalidate = 3600

const cdata = (s?: string | null) => `<![CDATA[${(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`

/** 日本語の雇用形態 → フィードの jobtype */
const jobtypeOf = (emp?: string[]): string => {
  const v = emp?.[0] ?? ""
  if (v.includes("正社員")) return "fulltime"
  if (v.includes("パート") || v.includes("アルバイト")) return "parttime"
  if (v.includes("契約") || v.includes("委託")) return "contract"
  if (v.includes("派遣")) return "temporary"
  if (v.includes("インターン")) return "internship"
  return ""
}

const salaryOf = (job: JobDetail): string => {
  if (!job.salaryMin) return ""
  const unit = job.wageType?.[0] ?? "月給"
  const min = job.salaryMin.toLocaleString()
  const max = job.salaryMax && job.salaryMax !== job.salaryMin ? `～${job.salaryMax.toLocaleString()}円` : "円"
  return `${unit}${min}${max}`
}

export async function GET() {
  const now = Date.now()
  const jobs = (await getAllJobsForFeed()).filter(
    // 掲載終了(expiresAt過去)の求人はフィードから除外
    (j) => !j.expiresAt || new Date(j.expiresAt).getTime() > now,
  )

  const items = jobs
    .map((j) => {
      const url = `${SITE_URL}/job/${j.id}`
      const company = j.hideCompanyName ? "非公開" : (j.companyName ?? "")
      const date = j.publishedAt ?? j.createdAt ?? ""
      return `  <job>
    <title>${cdata(j.jobName ?? j.title)}</title>
    <date>${cdata(date)}</date>
    <referencenumber>${cdata(j.id)}</referencenumber>
    <url>${cdata(url)}</url>
    <company>${cdata(company)}</company>
    <sourcename>${cdata("RIDE JOB")}</sourcename>
    <city>${cdata(j.municipality?.name)}</city>
    <state>${cdata(j.prefecture?.region)}</state>
    <country>${cdata("JP")}</country>
    <postalcode>${cdata(j.addressZip)}</postalcode>
    <category>${cdata(j.jobCategory?.name)}</category>
    <jobtype>${cdata(jobtypeOf(j.employmentType))}</jobtype>
    <salary>${cdata(salaryOf(j))}</salary>
    <description>${cdata(buildJobDescriptionHtml(j))}</description>
  </job>`
    })
    .join("\n")

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>RIDE JOB</publisher>
  <publisherurl>${SITE_URL}</publisherurl>
${items}
</source>`

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
