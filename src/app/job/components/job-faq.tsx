import type { JobFaq } from "@/features/jobs/lib/job-faq"

interface JobFaqSectionProps {
  faqs: JobFaq[]
}

/**
 * 求人詳細のFAQ表示。ここに出す question/answer は FAQPage 構造化データと同一の文字列を使う
 * （本文に無い回答を FAQPage で宣言しないため）。「Q. 」「A. 」は表示上の装飾で、
 * 構造化データ側の文字列には含めない（ハブ hub-page.tsx と同じ扱い）。
 *
 * ⚠️ job-description.tsx は noindex の /job/standby/[id] からも使われるため、FAQは
 * そちらに混ぜず独立コンポーネントにしている。index対象の /job/[id] からのみ描画すること。
 */
export default function JobFaqSection({ faqs }: JobFaqSectionProps) {
  if (faqs.length === 0) return null

  return (
    <section className="mt-12 border rounded-lg p-6" aria-labelledby="job-faq">
      <h2 id="job-faq" className="text-xl font-semibold text-gray-800">
        この求人のよくある質問
      </h2>
      <div className="mt-4 space-y-4">
        {faqs.map((faq, index) => (
          <div key={index} className="rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 break-words">Q. {faq.question}</h3>
            <p className="mt-2 text-gray-700 leading-relaxed break-words">A. {faq.answer}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
