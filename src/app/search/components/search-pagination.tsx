import { ChevronLeft, ChevronRight } from "lucide-react"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationEllipsis } from "@/shared/ui/pagination"

interface SearchPaginationProps {
  currentPage: number
  totalPages: number
  buildPageHref: (page: number) => string
}

export default function SearchPagination({
  currentPage,
  totalPages,
  buildPageHref,
}: SearchPaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="flex justify-center mt-8 mb-8 overflow-x-auto">
      <Pagination>
        <PaginationContent>
          {/* Previous */}
          <PaginationItem>
            {currentPage > 1 ? (
              <PaginationLink href={buildPageHref(currentPage - 1)} className="px-3 sm:px-6 py-2 border text-gray-700 flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> 前へ
              </PaginationLink>
            ) : (
              <span className="px-3 sm:px-6 py-2 border bg-gray-100 text-gray-400 cursor-not-allowed flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> 前へ
              </span>
            )}
          </PaginationItem>

          {/* Page numbers */}
          {(() => {
            const elements: (number | "ellipsis")[] = []
            if (totalPages <= 5) {
              for (let i = 1; i <= totalPages; i++) elements.push(i)
            } else {
              elements.push(1, 2, "ellipsis", totalPages)
            }
            return elements.map((elm, idx) => (
              <PaginationItem key={idx}>
                {elm === "ellipsis" ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href={buildPageHref(elm)}
                    className={`px-3 py-2 border ${
                      currentPage === elm
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {elm}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))
          })()}

          {/* Next */}
          <PaginationItem>
            {currentPage < totalPages ? (
              <PaginationLink href={buildPageHref(currentPage + 1)} className="px-3 sm:px-6 py-2 border text-gray-700 flex items-center gap-1">
                次へ <ChevronRight className="w-4 h-4" />
              </PaginationLink>
            ) : (
              <span className="px-3 sm:px-6 py-2 border bg-gray-100 text-gray-400 cursor-not-allowed flex items-center gap-1">
                次へ <ChevronRight className="w-4 h-4" />
              </span>
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
} 