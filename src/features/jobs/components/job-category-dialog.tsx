"use client"

import Link from "next/link"
import { useState } from "react"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/shared/ui/dialog"
import { Card, CardContent } from "@/shared/ui/card"
import { ScrollArea } from "@/shared/ui/scroll-area"
import { Briefcase } from "lucide-react"
import type { JobCategory } from "@/features/master/types"

interface JobCategoryDialogProps {
  jobCategories: JobCategory[]
  selectedJobCategoryId?: string
  keyword?: string
  prefectureId?: string
  municipalityId?: string
}

export default function JobCategoryDialog({
  jobCategories,
  selectedJobCategoryId,
  keyword,
  prefectureId,
  municipalityId,
}: JobCategoryDialogProps) {
  const [selected, setSelected] = useState<string | undefined>(selectedJobCategoryId)

  const buildHref = (jobCategoryId: string) => {
    const params = new URLSearchParams()
    if (keyword) params.set("q", keyword)
    if (prefectureId) params.set("prefecture", prefectureId)
    if (municipalityId) params.set("municipality", municipalityId)
    if (jobCategoryId) params.set("jobCategory", jobCategoryId)
    return `/search?${params.toString()}`
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card className="cursor-pointer hover:bg-gray-50">
          <CardContent className="p-4 sm:p-6 text-center">
            <Briefcase className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <span className="text-gray-800 font-medium">募集職種から選択</span>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="text-lg font-semibold mb-4">募集職種を選択</DialogTitle>
        <ScrollArea className="max-h-[60vh]">
          <ul className="divide-y">
            {jobCategories.map((jc) => (
              <li
                key={jc.id}
                className={`p-3 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                  selected === jc.id ? "bg-teal-50" : ""
                }`}
                onClick={() => setSelected(jc.id)}
              >
                <span className="text-gray-800">{jc.name}</span>
                {selected === jc.id && <span className="text-blue-600">✓</span>}
              </li>
            ))}
            {jobCategories.length === 0 && (
              <li className="p-4 text-sm text-gray-500 text-center">職種データがありません</li>
            )}
          </ul>
        </ScrollArea>
        <div className="flex justify-end pt-4 border-t mt-4 space-x-2">
          <DialogClose asChild>
            <button className="min-h-[40px] inline-flex items-center justify-center px-4 py-2 text-sm text-gray-600 rounded hover:bg-gray-100">キャンセル</button>
          </DialogClose>
          <DialogClose asChild>
            <Link href={buildHref(selected || "")} className="min-h-[40px] inline-flex items-center justify-center px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
              適用
            </Link>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
} 