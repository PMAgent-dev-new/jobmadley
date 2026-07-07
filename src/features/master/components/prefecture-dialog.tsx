"use client"

import Link from "next/link"
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose } from "@/shared/ui/dialog"
import { Card, CardContent } from "@/shared/ui/card"
import { MapPin } from "lucide-react"
import type { PrefectureGroup } from "@/features/master/types"

interface PrefectureDialogProps {
  groups: PrefectureGroup
  keyword?: string
  jobCategoryId?: string
  tagIds?: string[]
}

export default function PrefectureDialog({ groups, keyword, jobCategoryId, tagIds }: PrefectureDialogProps) {
  const buildHref = (prefId: string) => {
    const p = new URLSearchParams()
    if (keyword) p.set("q", keyword)
    p.set("prefecture", prefId)
    if (jobCategoryId) p.set("jobCategory", jobCategoryId)
    if (tagIds?.length) p.set("tags", tagIds.join(","))
    // 都道府県変更時は municipality を意図的に付与しない
    return `/search?${p.toString()}`
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card className="cursor-pointer hover:bg-gray-50">
          <CardContent className="p-4 sm:p-6 text-center">
              <MapPin className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <span className="text-gray-800 font-medium">都道府県から選択</span>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="text-lg font-semibold mb-4">都道府県を選択</DialogTitle>
        {/* 市区町村モーダルと同じように、内部をスクロール可能にする */}
        <div className="max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.values(groups).flat().map((pref) => (
              <DialogClose asChild key={pref.id}>
                <Link
                  href={buildHref(pref.id)}
                  className="p-2 text-sm text-blue-600 hover:bg-blue-50 rounded"
                >
                  {pref.region}
                </Link>
              </DialogClose>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


