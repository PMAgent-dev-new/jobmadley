"use client"

import Link from "next/link"
import { MapPin, ChevronRight } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import type { PrefectureGroup } from "@/features/master/types"

interface PrefectureTabsSectionProps {
  prefectures: PrefectureGroup
  countMap: Record<string, number>
}

export default function PrefectureTabsSection({ prefectures, countMap }: PrefectureTabsSectionProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
      <Tabs defaultValue="prefecture" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 h-auto">
          <TabsTrigger value="prefecture" className="flex items-center justify-center whitespace-normal min-w-0 leading-tight text-xs sm:text-sm px-1 sm:px-3 py-2 h-auto">
            <MapPin className="w-4 h-4 mr-1 hidden sm:block" />
            <span className="text-gray-800 font-medium">都道府県から選択</span>
          </TabsTrigger>
          <TabsTrigger value="employment" className="flex items-center justify-center whitespace-normal min-w-0 leading-tight text-xs sm:text-sm px-1 sm:px-3 py-2 h-auto">
            雇用形態 給与から選択
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center justify-center whitespace-normal min-w-0 leading-tight text-xs sm:text-sm px-1 sm:px-3 py-2 h-auto">
            特徴から選択
          </TabsTrigger>
        </TabsList>

        {/* 都道府県タブ */}
        <TabsContent value="prefecture">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-6">
            {Object.entries(prefectures).map(([area, prefs]) => (
              <div key={area} className="space-y-3">
                <h3 className="font-semibold text-gray-800 text-center">{area}</h3>
                <div className="space-y-2">
                  {prefs.map((pref) => (
                    <Link
                      key={pref.id}
                      href={`/search?prefecture=${encodeURIComponent(pref.id)}`}
                      className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <span>
                        {pref.region}
                        <span className="ml-1 text-xs text-gray-500">({countMap[pref.id] ?? 0})</span>
                      </span>
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 雇用形態タブ */}
        <TabsContent value="employment">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">雇用形態</h3>
              <div className="space-y-2">
                <Link href="/search?employment=正社員" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>正社員</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?employment=契約社員" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>契約社員</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?employment=パート" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>パート・アルバイト</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">給与</h3>
              <div className="space-y-2">
                <Link href="/search?salary=20万円以上" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>月給20万円以上</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?salary=25万円以上" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>月給25万円以上</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?salary=30万円以上" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>月給30万円以上</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">勤務時間</h3>
              <div className="space-y-2">
                <Link href="/search?worktime=日勤" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>日勤のみ</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?worktime=夜勤" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>夜勤あり</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?worktime=シフト" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>シフト制</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 特徴タブ */}
        <TabsContent value="features">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">働き方</h3>
              <div className="space-y-2">
                <Link href="/search?feature=未経験OK" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>未経験OK</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?feature=研修充実" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>研修充実</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?feature=即日勤務" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>即日勤務可</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">福利厚生</h3>
              <div className="space-y-2">
                <Link href="/search?benefit=社会保険完備" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>社会保険完備</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?benefit=交通費支給" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>交通費支給</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?benefit=賞与あり" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>賞与あり</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-800">環境</h3>
              <div className="space-y-2">
                <Link href="/search?environment=駅近" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>駅近</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?environment=車通勤OK" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>車通勤OK</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
                <Link href="/search?environment=制服貸与" className="flex items-center justify-between p-2 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors">
                  <span>制服貸与</span>
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 