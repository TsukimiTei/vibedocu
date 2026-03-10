import { useRef, useCallback, useEffect, useMemo } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import { EditorToolbar } from './EditorToolbar'
import { useDocumentStore } from '@/stores/document-store'
import { useAgentStore } from '@/stores/agent-store'
import { parsePages, getPageBody, getPageTitle, updatePageBody, addNewPage, getPageVersion } from '@/lib/page-utils'
import { buildCopyMessage } from '@/services/prompt-builder'
import { copyToClipboard } from '@/services/file-bridge'
import type { EditorHandle } from '@/hooks/useEditor'

interface EditorPanelProps {
  activeEditorRef: React.MutableRefObject<EditorHandle | null>
  onUpdate: () => void
  onSave: () => void
  onOpenSettings: () => void
}

export function EditorPanel({ activeEditorRef, onUpdate, onSave, onOpenSettings }: EditorPanelProps) {
  const { content, activePageIndex, setContent, markDirty, setActivePageIndex } = useDocumentStore()
  const editorRefs = useRef<Map<number, EditorHandle>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<number | null>(null)

  const pages = parsePages(content)

  // Debounced auto-save: saves to disk 1s after last edit
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      const { filePath, content: c } = useDocumentStore.getState()
      if (filePath) {
        window.api.file.write(filePath, c).then(() => {
          useDocumentStore.getState().markSaved()
        })
      }
    }, 1000)
  }, [])

  const handlePageChange = useCallback(
    (pageIndex: number, bodyMd: string) => {
      const store = useDocumentStore.getState()
      const newFull = updatePageBody(store.content, pageIndex, bodyMd)
      store.setContent(newFull)
      store.markDirty()
      scheduleAutoSave()
    },
    [scheduleAutoSave]
  )

  const handleFocus = useCallback(
    (pageIndex: number) => {
      setActivePageIndex(pageIndex)
      activeEditorRef.current = editorRefs.current.get(pageIndex) || null
      useAgentStore.getState().switchToPage(pageIndex)
    },
    [setActivePageIndex, activeEditorRef]
  )

  const handleNewPage = useCallback(() => {
    const currentPages = parsePages(useDocumentStore.getState().content)
    const newIndex = currentPages.length
    const defaultName = `Feature ${newIndex}`
    const newContent = addNewPage(useDocumentStore.getState().content, defaultName)
    setContent(newContent)
    setActivePageIndex(newIndex)
    pendingFocusRef.current = newIndex
    // Scroll to bottom after React renders the new section
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' })
    })
    // Auto-save to disk so pages persist across restarts
    const { filePath } = useDocumentStore.getState()
    if (filePath) {
      window.api.file.write(filePath, newContent).then(() => {
        useDocumentStore.getState().markSaved()
      })
    }
  }, [setContent, setActivePageIndex])

  const setEditorRef = useCallback(
    (pageIndex: number, handle: EditorHandle | null) => {
      if (handle) {
        editorRefs.current.set(pageIndex, handle)
        if (pageIndex === useDocumentStore.getState().activePageIndex) {
          activeEditorRef.current = handle
        }
        // Auto-focus newly created page's editor — cursor goes into the h1 heading
        if (pendingFocusRef.current === pageIndex) {
          pendingFocusRef.current = null
          setTimeout(() => {
            // Focus the editor's contenteditable element
            const container = scrollContainerRef.current
            if (container) {
              const sections = container.querySelectorAll('[data-page-index]')
              const section = sections[pageIndex]
              const editable = section?.querySelector('[contenteditable]') as HTMLElement
              if (editable) {
                editable.focus()
                // Place cursor at end of first line (inside the h1)
                const h1 = editable.querySelector('h1')
                if (h1) {
                  const range = document.createRange()
                  const sel = window.getSelection()
                  range.selectNodeContents(h1)
                  range.collapse(false) // collapse to end
                  sel?.removeAllRanges()
                  sel?.addRange(range)
                }
              }
            }
          }, 100)
        }
      } else {
        editorRefs.current.delete(pageIndex)
      }
    },
    [activeEditorRef]
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        onSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onUpdate()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSave, onUpdate])

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <EditorToolbar onUpdate={onUpdate} onSave={onSave} onOpenSettings={onOpenSettings} />
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {pages.map((page, i) => (
          <div key={i} data-page-index={i} onFocus={() => handleFocus(i)}>
            {/* Section Header */}
            <div className={`flex items-center gap-3 px-6 py-3 border-b border-border sticky top-0 z-10 ${
              i === activePageIndex ? 'bg-accent-blue/5' : 'bg-bg-secondary'
            }`}>
              <span className="text-[13px] font-semibold text-accent-blue font-mono shrink-0">
                {getPageVersion(i)}
              </span>
              <span className="text-[13px] text-text-muted font-mono shrink-0">·</span>
              <span className="text-[13px] font-medium text-text-primary font-mono shrink-0">
                {page.name}
              </span>
              {i > 0 && getPageTitle(content, i) && (
                <>
                  <span className="text-[13px] text-text-muted font-mono shrink-0">·</span>
                  <span className="text-[13px] text-text-secondary font-mono truncate">
                    {getPageTitle(content, i)}
                  </span>
                </>
              )}
              <div className="flex-1 h-px bg-border" />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const store = useDocumentStore.getState()
                  const msg = buildCopyMessage(store.filePath || '', page.name, i)
                  copyToClipboard(msg)
                }}
                className="text-[11px] text-text-muted hover:text-accent-green font-mono cursor-pointer transition-colors px-1.5 py-0.5 rounded hover:bg-accent-green/10"
              >
                Copy Msg
              </button>
              {i === activePageIndex && (
                <span className="text-[10px] text-accent-blue/60 font-mono">EDITING</span>
              )}
            </div>

            {/* Editor */}
            <div className="min-h-[120px]">
              <PageEditor
                pageIndex={i}
                initialBody={getPageBody(content, i)}
                onChange={handlePageChange}
                onRef={setEditorRef}
              />
            </div>
          </div>
        ))}

        {/* New Page Button */}
        <div className="flex items-center justify-center py-6 border-t border-border/50">
          <button
            onClick={handleNewPage}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:border-accent-blue/50 hover:bg-accent-blue/5 text-text-muted hover:text-accent-blue transition-colors cursor-pointer font-mono text-[13px]"
          >
            + New Page {getPageVersion(pages.length)}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Individual page editor — wraps MarkdownEditor with stable onChange per page.
 * Memoized to prevent re-renders when other pages change.
 */
import { memo } from 'react'

interface PageEditorProps {
  pageIndex: number
  initialBody: string
  onChange: (pageIndex: number, body: string) => void
  onRef: (pageIndex: number, handle: EditorHandle | null) => void
}

const PageEditor = memo(function PageEditor({ pageIndex, initialBody, onChange, onRef }: PageEditorProps) {
  const handleChange = useCallback(
    (md: string) => onChange(pageIndex, md),
    [pageIndex, onChange]
  )

  const handleRef = useCallback(
    (handle: EditorHandle | null) => onRef(pageIndex, handle),
    [pageIndex, onRef]
  )

  return (
    <MarkdownEditor
      ref={handleRef}
      initialContent={initialBody || '\n'}
      onChange={handleChange}
    />
  )
})
