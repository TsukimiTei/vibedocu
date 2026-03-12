import { useState, useRef, useEffect } from 'react'
import { useDocumentStore } from '@/stores/document-store'
import { useAgentStore } from '@/stores/agent-store'
import { parsePages, addNewPage, renamePage, getPageTitle, formatPageLabel } from '@/lib/page-utils'

export function PageTabBar() {
  const { content, currentPageIndex, setCurrentPageIndex, setContent, markDirty } = useDocumentStore()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const pages = parsePages(content)

  const handleSwitch = (index: number) => {
    if (index === currentPageIndex) return
    setCurrentPageIndex(index)
  }

  const handleCreatePage = () => {
    const defaultName = `v${pages.length}`
    const newContent = addNewPage(content, defaultName)
    setContent(newContent)
    markDirty()
    const newPages = parsePages(newContent)
    const newIndex = newPages.length - 1
    setCurrentPageIndex(newIndex)
    useAgentStore.getState().switchToPage(newIndex)
    setEditingIndex(newIndex)
    setEditName(defaultName)
  }

  const handleStartRename = (index: number) => {
    if (index === 0) return
    setEditingIndex(index)
    setEditName(pages[index].name)
  }

  const handleConfirmRename = () => {
    if (editingIndex === null) return
    const name = editName.trim()
    if (name && name !== pages[editingIndex]?.name) {
      const newContent = renamePage(content, editingIndex, name)
      setContent(newContent)
      markDirty()
    }
    setEditingIndex(null)
    setEditName('')
  }

  useEffect(() => {
    if (editingIndex !== null) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingIndex])

  // Cmd+1-9 to switch pages (1 = Base PRD, 2+ = pages)
  // Cmd+0 = All Pages
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '0') {
        e.preventDefault()
        setCurrentPageIndex(-1)
        return
      }
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1
        const currentPages = parsePages(useDocumentStore.getState().content)
        if (index < currentPages.length) {
          e.preventDefault()
          setCurrentPageIndex(index)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setCurrentPageIndex])

  const tabClass = (active: boolean) =>
    `relative flex items-center gap-1 px-3 h-[26px] text-[13px] font-mono whitespace-nowrap transition-colors cursor-pointer rounded-md ${
      active
        ? 'bg-bg-primary text-text-primary'
        : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50'
    }`

  return (
    <div className="flex items-center h-[38px] bg-bg-secondary shrink-0 app-drag-region border-b border-border">
      <div className="flex items-center h-full pl-[80px] gap-0.5 overflow-x-auto no-drag">
        {/* All Pages — permanent tab */}
        <button
          onClick={() => handleSwitch(-1)}
          className={tabClass(currentPageIndex === -1)}
        >
          All Pages
          <span className={`text-[10px] ${currentPageIndex === -1 ? 'text-text-muted' : 'text-text-muted/50'}`}>
            ⌘0
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-3 bg-border mx-1" />

        {/* Page tabs */}
        {pages.map((page, i) => (
          editingIndex === i ? (
            <div key={i} className="flex items-center px-1">
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleConfirmRename()
                  if (e.key === 'Escape') {
                    setEditingIndex(null)
                    setEditName('')
                  }
                }}
                onBlur={handleConfirmRename}
                className="w-[120px] px-2 py-1 text-[12px] bg-bg-primary border border-accent-blue/50 rounded text-text-primary outline-none font-mono"
              />
            </div>
          ) : (
            <button
              key={i}
              onClick={() => handleSwitch(i)}
              onDoubleClick={() => handleStartRename(i)}
              className={tabClass(i === currentPageIndex)}
            >
              {formatPageLabel(i, getPageTitle(content, i), page.name)}
              {i < 9 && (
                <span className={`text-[10px] ${i === currentPageIndex ? 'text-text-muted' : 'text-text-muted/50'}`}>
                  ⌘{i + 1}
                </span>
              )}
            </button>
          )
        ))}

        <button
          onClick={handleCreatePage}
          className="flex items-center justify-center w-7 h-[26px] text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50 rounded-md transition-colors cursor-pointer text-base leading-none"
          title="New Page"
        >
          +
        </button>
      </div>
    </div>
  )
}
