import Image from "next/image"
import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import type { Municipality } from "@/features/master/types"

interface SearchHeaderProps {
  jobCategoryName: string
  prefectureName: string
  selectedMunicipality: Municipality | null
  heroImageSrc: string
  totalCount: number
}

export default function SearchHeader({
  jobCategoryName,
  prefectureName,
  selectedMunicipality,
  heroImageSrc,
  totalCount,
}: SearchHeaderProps) {
  return (
    <>
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center text-sm text-gray-600">
          <Home className="w-4 h-4 mr-1" />
          {jobCategoryName && (
            <>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Link href="/" className="hover:text-blue-600">
                {jobCategoryName}の求人
              </Link>
            </>
          )}
          <ChevronRight className="w-4 h-4 mx-1" />
          <span>
            {selectedMunicipality ? `${selectedMunicipality.name}（${prefectureName}）` : prefectureName}
            {jobCategoryName ? `の${jobCategoryName}求人` : "の求人"}
          </span>
        </div>
      </div>

      {/* Page Title */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {selectedMunicipality
            ? `${selectedMunicipality.name}（${prefectureName}）`
            : prefectureName}
          {jobCategoryName ? `の${jobCategoryName}の求人情報` : "の求人情報"}
        </h1>
        <div className="flex items-center space-x-4">
          <span className="text-lg text-gray-600">
            該当件数 <span className="font-bold text-red-500">{totalCount}件</span>
          </span>
          {/* 旧実装は href="#" のダミーリンクで、押しても何も起きなかった。
              文言も「登録情報」だったが、このサイトに会員登録の概念は無い（応募は都度フォーム）ため
              存在しない機能を約束していた。実際にこのページで変えられるのは検索条件なので、
              同一ページの絞り込み（FilterSidebar）へアンカーする。 */}
          <a href="#search-filter" className="text-sm text-blue-600 hover:underline">
            検索条件を変更する
          </a>
        </div>
      </div>
    </>
  )
} 