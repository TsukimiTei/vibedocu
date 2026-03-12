import { useState } from 'react'
import { useDocumentStore } from '@/stores/document-store'
import { parsePages, getPageTitle, formatPageLabel } from '@/lib/page-utils'

export function AllPagesView() {
  const content = useDocumentStore((s) => s.content)
  const [descending, setDescending] = useState(false)

  const pages = parsePages(content)
  const indexedPages = pages.map((page, i) => ({ page, originalIndex: i }))
  const displayPages = descending ? [...indexedPages].reverse() : indexedPages

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border sticky top-0 bg-bg-primary z-10">
        <span className="text-[13px] text-text-muted font-mono">
          {pages.length} 个页面
        </span>
        <button
          onClick={() => setDescending(!descending)}
          className="text-[13px] text-text-secondary hover:text-text-primary font-mono cursor-pointer transition-colors px-2 py-1 rounded hover:bg-bg-hover"
        >
          {descending ? '↓ 倒序' : '↑ 正序'}
        </button>
      </div>

      <div className="px-6 py-4">
        {displayPages.map(({ page, originalIndex }) => (
          <div key={`${page.name}-${originalIndex}`} className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[14px] font-semibold text-accent-blue font-mono">
                {formatPageLabel(originalIndex, getPageTitle(content, originalIndex), page.name)}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="milkdown-editor-readonly prose-container">
              <pre className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono">
                {page.content.trim()}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
