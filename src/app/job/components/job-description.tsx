import type { JobDetail } from "@/features/jobs/types"
import { formatAccessLines } from "@/features/jobs/format-access"
import { formatSalary } from "@/shared/lib/utils"
import JobPhotoGrid from "./job-photo-grid"

interface JobDescriptionProps {
  job: JobDetail
}

export default function JobDescription({ job }: JobDescriptionProps) {
  return (
    <div className="space-y-8 mt-12 border rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-800">募集内容</h2>
      
      {/* 写真セクション - 新規追加 */}
      {job.images && job.images.length > 0 && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">写真</h3>
          <JobPhotoGrid images={job.images} />
        </div>
      )}

      {/* 給与セクション - 新規追加 */}
      {(job.salaryMin || job.salaryMax) && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">給与</h3>
          <div className="text-gray-700">
            {formatSalary(job.salaryMin, job.salaryMax, job.wageType)}
          </div>
          {job.salaryNote && (
            <p className="text-gray-600 text-sm mt-2 whitespace-pre-wrap break-words">{job.salaryNote}</p>
          )}
        </div>
      )}

      {/* 勤務形態セクション - 新規追加 */}
      {job.workStyle && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">勤務形態</h3>
          <p className="text-gray-700 whitespace-pre-wrap break-words">{job.workStyle}</p>
        </div>
      )}

      {/* アピールポイント */}
      {job.descriptionAppeal && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">アピールポイント</h3>
          <div className="text-gray-700 whitespace-pre-wrap break-words">{job.descriptionAppeal}</div>
        </div>
      )}

      {/* 募集職種 */}
      <div className="border-t pt-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">募集職種</h3>
        {job.jobCategory ? (
          <p className="text-gray-700">{job.jobCategory.name}</p>
        ) : (
          <p className="text-gray-700">職種情報なし</p>
        )}
      </div>

      {/* 仕事内容 */}
      <div className="border-t pt-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">仕事内容</h3>
        {job.descriptionWork ? (
          <div className="text-gray-700 mb-6 whitespace-pre-wrap break-words">{job.descriptionWork}</div>
        ) : (
          <p className="text-gray-700 mb-4">仕事内容なし</p>
        )}
      </div>

      {/* 求める人材 */}
      {job.descriptionPerson && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">求める人材</h3>
          <div className="text-gray-700 whitespace-pre-wrap break-words">{job.descriptionPerson}</div>
        </div>
      )}

      {/* 勤務時間 */}
      {job.workHours && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">勤務時間</h3>
          <p className="text-gray-700">{job.workHours}</p>
        </div>
      )}

      {/* 休日 */}
      {job.holidays && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">休日</h3>
          <p className="text-gray-700 whitespace-pre-wrap break-words">{job.holidays}</p>
        </div>
      )}

      {/* 勤務地 */}
      {(job.addressPrefMuni || job.addressLine || job.addressBuilding || job.access) && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">勤務地</h3>
          <div className="space-y-2 text-gray-700">
            {job.addressZip && <p>〒{job.addressZip}</p>}
            {job.addressPrefMuni && <p>{job.addressPrefMuni}</p>}
            {job.addressLine && <p>{job.addressLine}</p>}
            {job.addressBuilding && <p>{job.addressBuilding}</p>}
            {job.access && (
              <div>
                <h4 className="font-medium mt-4 mb-2">アクセス</h4>
                <p>{job.access}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 社会保険 */}
      {job.socialInsurance && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">社会保険</h3>
          <p className="text-gray-700">{job.socialInsurance}</p>
        </div>
      )}

      {/* 福利厚生 */}
      {job.descriptionBenefits && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">福利厚生</h3>
          <div className="text-gray-700 whitespace-pre-wrap break-words">{job.descriptionBenefits}</div>
        </div>
      )}

      {/* 会社情報セクション - 地図付き */}
      {job.companyName && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">会社情報</h3>
          <div className="space-y-4">
            <div>
              <dt className="text-gray-600 mb-2">会社名</dt>
              <dd className="text-blue-600">{job.companyName}</dd>
            </div>
            
            {(job.addressZip || job.addressPrefMuni || job.addressLine || job.access) && (
              <div>
                <dt className="text-gray-600 mb-2">アクセス</dt>
                <dd className="text-gray-700 space-y-1">
                  {job.addressZip && job.addressPrefMuni && (
                    <p>〒{job.addressZip} {job.addressPrefMuni}</p>
                  )}
                  {job.addressLine && <p>{job.addressLine}</p>}
                  {job.access && (
                    <div className="mt-2">
                      {formatAccessLines(job.access).map((line, index) => (
                        <p key={index} className="text-sm">・{line}</p>
                      ))}
                    </div>
                  )}
                </dd>
                
                {/* 動的Google Map埋め込み */}
                {(job.addressZip || job.addressPrefMuni || job.addressLine) && (
                  <div className="mt-4">
                    <iframe
                      width="100%"
                      height="300"
                      style={{ border: 0 }}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(
                        `${job.addressZip || ''} ${job.addressPrefMuni || ''} ${job.addressLine || ''}`.trim()
                      )}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                      className="rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* その他備考 */}
      {job.descriptionOther && (
        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">その他</h3>
          <div className="text-gray-700 whitespace-pre-wrap break-words">{job.descriptionOther}</div>
        </div>
      )}
    </div>
  )
} 
