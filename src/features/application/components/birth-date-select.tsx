"use client"

import type { FieldErrors, UseFormSetValue } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import type { ApplicationFormValues } from "@/features/application/schema"

type BirthDateSelectProps = {
  setValue: UseFormSetValue<ApplicationFormValues>
  errors: FieldErrors<ApplicationFormValues>
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1949 }, (_, i) => CURRENT_YEAR - i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export function BirthDateSelect({ setValue, errors }: BirthDateSelectProps) {
  const hasError = Boolean(errors.birthYear || errors.birthMonth || errors.birthDay)

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
      <label className="text-sm font-medium text-gray-700 md:text-right md:pt-2">
        生年月日 <span className="text-red-500">必須</span>
      </label>
      <div className="md:col-span-3">
        <div className="text-sm text-gray-600 mb-2">西暦</div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select onValueChange={(value) => setValue("birthYear", value)}>
            <SelectTrigger className="flex-1 min-w-0 sm:flex-none sm:w-24">
              <SelectValue placeholder="年" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm">年</span>

          <Select onValueChange={(value) => setValue("birthMonth", value)}>
            <SelectTrigger className="flex-1 min-w-0 sm:flex-none sm:w-20">
              <SelectValue placeholder="月" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month) => (
                <SelectItem key={month} value={month.toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm">月</span>

          <Select onValueChange={(value) => setValue("birthDay", value)}>
            <SelectTrigger className="flex-1 min-w-0 sm:flex-none sm:w-20">
              <SelectValue placeholder="日" />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((day) => (
                <SelectItem key={day} value={day.toString()}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm">日</span>
        </div>
        {hasError && (
          <p className="text-red-500 text-sm mt-1">生年月日を入力してください</p>
        )}
      </div>
    </div>
  )
}
