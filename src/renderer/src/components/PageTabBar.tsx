import { useState, useRef, useEffect } from 'react'
import { useDocumentStore } from '@/stores/document-store'
import { useAgentStore } from '@/stores/agent-store'
import { parsePages, addNewPage } from '@/lib/page-utils'

export function PageTabBar() {
  const { content, currentPageIndex, setCurrentPageIndex, setContent, markDirty } = useDocumentStore()
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const pages = parsePages(content)

  const handleSwitch = (index: number) => {
    if (index === currentPageIndex) return
    setCurrentPageIndex(index)
  }

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    const newContent = addNewPage(content, name)
    setContent(newContent)
    markDirty()
    const newPages = parsePages(newContent)
    setCurrentPageIndex(newPages.length - 1)
    useAgentStore.getState().switchToPage(newPages.length - 1)
    setIsCreating(false)
    setNewName('')
  }

  useEffect(() => {
    if (isCreating) inputRef.current?.focus()
  }, [isCreating])

  // Only show tab bar when there are multiple pages, or when creating
  if (pages.length <= 1 && !isCreating) return null

  return (
    <div className="flex items-center gap-0 px-2 py-0 border-b border-border bg-bg-primary shrink-0 overflow-x-auto">
      {pages.map((page, i) => (
        <button
          key={i}
          onClick={() => handleSwitch(i)}
          className={`relative px-3 py-1.5 text-xs font-mono whitespace-nowrap transition-colors cursor-pointer ${
            i === currentPageIndex
              ? 'text-accent-blue'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          {page.name}
          {i === currentPageIndex && (
            <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent-blue rounded-full" />
          )}
        </button>
      ))}

      {isCreating ? (
        <div className="flex items-center gap-1 px-1 py-1">
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setIsCreating(false)
                setNewName('')
              }
            }}
            onBlur={() => {
              if (!newName.trim()) {
                setIsCreating(false)
                setNewName('')
              }
            }}
            placeholder="Page name..."
            className="w-[120px] px-2 py-0.5 text-xs bg-bg-secondary border border-border rounded text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue/50 font-mono"
          />
          {newName.trim() && (
            <button
              onClick={handleCreate}
              className="px-1.5 py-0.5 text-xs text-accent-blue hover:bg-accent-blue/10 rounded transition-colors cursor-pointer"
            >
              OK
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="px-2 py-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          title="New Page"
        >
          +
        </button>
      )}
    </div>
  )
}
