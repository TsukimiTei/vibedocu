import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import { EditorToolbar } from './EditorToolbar'
import { PageStatusBadge } from './PageStatusBadge'
import { SelectionToolbar } from './SelectionToolbar'
import { useDocumentStore } from '@/stores/document-store'
import { useAgentStore } from '@/stores/agent-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePageStatusStore } from '@/stores/page-status-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useAgent } from '@/hooks/useAgent'
import { parsePages, getPageBody, getPageTitle, updatePageBody, addNewPage, getPageVersion, slugifyToBranchName, formatPageLabel } from '@/lib/page-utils'
import { buildCopyMessage } from '@/services/prompt-builder'
import { copyToClipboard } from '@/services/file-bridge'
import { buildScreenshotCtxForPage } from '@/lib/screenshot-utils'
import type { EditorHandle } from '@/hooks/useEditor'

interface EditorPanelProps {
  activeEditorRef: React.MutableRefObject<EditorHandle | null>
  onUpdate: () => void
  onSave: () => void
  onRename: (newName: string) => Promise<{ oldFileName: string } | null>
  onOpenSettings: () => void
}

export function EditorPanel({ activeEditorRef, onUpdate, onSave, onRename, onOpenSettings }: EditorPanelProps) {
  const { content, activePageIndex, setContent, markDirty, setActivePageIndex } = useDocumentStore()
  const pageOrderReversed = useSettingsStore((s) => s.pageOrderReversed)
  const editorRefs = useRef<Map<number, EditorHandle>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<number | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const { runPartialAnalysis } = useAgent()

  const pages = parsePages(content)

  // Build display order: array of original page indices
  const displayOrder = useMemo(() => {
    const indices = pages.map((_, i) => i)
    if (pageOrderReversed) indices.reverse()
    return indices
  }, [pages.length, pageOrderReversed])

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
    // Scroll to the new page after React renders it
    requestAnimationFrame(() => {
      if (pageOrderReversed) {
        // Reversed: new page appears at top
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        // Normal: new page appears at bottom
        scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current!.scrollHeight, behavior: 'smooth' })
      }
    })
    // Auto-save to disk so pages persist across restarts
    const { filePath } = useDocumentStore.getState()
    if (filePath) {
      window.api.file.write(filePath, newContent).then(() => {
        useDocumentStore.getState().markSaved()
      })
    }
  }, [setContent, setActivePageIndex, pageOrderReversed])

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
              const section = container.querySelector(`[data-page-index="${pageIndex}"]`)
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
      <EditorToolbar onUpdate={onUpdate} onSave={onSave} onRename={onRename} onOpenSettings={onOpenSettings} />
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
        <div ref={editorContainerRef} className="relative">
        <SelectionToolbar
          containerRef={editorContainerRef}
          onAskAgent={(text) => runPartialAnalysis(text)}
          onCustomAsk={(text, question) => runPartialAnalysis(text, question)}
        />
        {/* New Page Button (top when reversed) */}
        {pageOrderReversed && (
          <div className="flex items-center justify-center py-6 border-b border-border/50">
            <button
              onClick={handleNewPage}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:border-accent-blue/50 hover:bg-accent-blue/5 text-text-muted hover:text-accent-blue transition-colors cursor-pointer font-mono text-[13px]"
            >
              + New Page {getPageVersion(pages.length)}
            </button>
          </div>
        )}

        {displayOrder.map((i) => {
          const page = pages[i]
          const pageTitle = i > 0 ? getPageTitle(content, i) : ''
          return (
            <div key={i} data-page-index={i} onFocus={() => handleFocus(i)}>
              {/* Section Header */}
              <div className={`flex items-center gap-3 px-6 py-3 border-b border-border sticky top-0 z-10 ${
                i === activePageIndex ? 'bg-accent-blue/5' : 'bg-bg-secondary'
              }`}>
                {i === 0 ? (
                  <>
                    <span className="text-[13px] font-semibold text-accent-blue font-mono shrink-0">
                      {getPageVersion(i)}
                    </span>
                    <span className="text-[13px] text-text-muted font-mono shrink-0">·</span>
                    <span className="text-[13px] font-medium text-text-primary font-mono shrink-0">
                      Base PRD
                    </span>
                  </>
                ) : (
                  <span className={`text-[13px] font-semibold font-mono shrink-0 ${pageTitle ? 'text-accent-blue' : 'text-text-muted'}`}>
                    {formatPageLabel(i, pageTitle, page.name)}
                    {!pageTitle && <span className="ml-2 text-text-muted/40 italic font-normal text-[12px]">Enter heading</span>}
                  </span>
                )}
                <PageStatusBadge pageName={page.name} />
                <div className="flex-1 h-px bg-border" />
                <RunButton filePath={useDocumentStore.getState().filePath} pageName={page.name} pageIndex={i} />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const store = useDocumentStore.getState()
                    const ssCtx = store.filePath ? buildScreenshotCtxForPage(store.filePath, store.content, i) : null
                    const msg = buildCopyMessage(store.filePath || '', page.name, i, ssCtx)
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
          )
        })}

        {/* New Page Button (bottom when normal order) */}
        {!pageOrderReversed && (
          <div className="flex items-center justify-center py-6 border-t border-border/50">
            <button
              onClick={handleNewPage}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:border-accent-blue/50 hover:bg-accent-blue/5 text-text-muted hover:text-accent-blue transition-colors cursor-pointer font-mono text-[13px]"
            >
              + New Page {getPageVersion(pages.length)}
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

/** Run button with dropdown for internal/external terminal */
function RunButton({ filePath, pageName, pageIndex }: {
  filePath: string | null
  pageName: string
  pageIndex: number
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const setStatus = usePageStatusStore((s) => s.setStatus)

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const getCwd = () => {
    const projectDir = useSettingsStore.getState().projectDir
    return projectDir || filePath!.substring(0, filePath!.lastIndexOf('/'))
  }

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!filePath || isCreating) return

    setIsCreating(true)
    try {
      const docContent = useDocumentStore.getState().content
      const pageTitle = getPageTitle(docContent, pageIndex)
      const asciiTitle = (pageTitle || '').replace(/[^\x20-\x7E]/g, '').trim()
      const branchName = slugifyToBranchName(asciiTitle || pageName)
      const cwd = getCwd()

      // Build claude command
      const ssCtx = buildScreenshotCtxForPage(filePath, docContent, pageIndex)
      const msg = buildCopyMessage(filePath, pageName, pageIndex, ssCtx)
      const escapedMsg = msg.replace(/'/g, "'\\''")

      setStatus(pageName, 'running')

      // Create worktree with feature branch (fetch + branch from origin/main)
      const result = await window.api.git.createWorktree(cwd, branchName)

      let termCwd: string
      let cmd: string

      if (result.success) {
        termCwd = result.worktreePath!
        cmd = `claude '${escapedMsg}'`
      } else {
        // Fallback: open in original dir, show error as shell comment
        termCwd = cwd
        const errorClean = (result.error || 'Unknown error').replace(/[`$"'\\\n\r\t]/g, '')
        cmd = `# Worktree failed: ${errorClean}\nclaude '${escapedMsg}'`
        setStatus(pageName, 'failed')
      }

      const sessionId = `pty-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
      const termStore = useTerminalStore.getState()
      if (termStore.hasSession(pageName)) {
        termStore.removeSession(pageName)
      }

      termStore.createSession(pageName, { sessionId, cwd: termCwd, prompt: cmd, pageName })
      termStore.switchToTerminal()
    } finally {
      setIsCreating(false)
    }
  }

  const handleExternal = (app: string) => {
    if (!filePath) return
    const docContent = useDocumentStore.getState().content
    const ssCtx = buildScreenshotCtxForPage(filePath, docContent, pageIndex)
    const msg = buildCopyMessage(filePath, pageName, pageIndex, ssCtx)
    const cwd = getCwd()
    window.api.terminal.sendExternal(app, msg, cwd)
    setStatus(pageName, 'running')
    setShowMenu(false)
  }

  return (
    <div className="relative shrink-0">
      <div className="flex items-center">
        <button
          onClick={handleRun}
          disabled={isCreating}
          className={`text-[11px] font-mono transition-colors px-1.5 py-0.5 rounded-l ${
            isCreating
              ? 'text-text-muted/50 cursor-wait'
              : 'text-text-muted hover:text-accent-blue cursor-pointer hover:bg-accent-blue/10'
          }`}
        >
          {isCreating ? 'Creating…' : 'Run'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
          className="text-[11px] text-text-muted hover:text-accent-blue font-mono cursor-pointer transition-colors px-1 py-0.5 rounded-r hover:bg-accent-blue/10 border-l border-border"
        >
          ▾
        </button>
      </div>
      {showMenu && (
        <div ref={menuRef} className="absolute right-0 top-full mt-1 z-50 w-[160px] rounded border border-border bg-bg-primary shadow-xl py-1">
          <button onClick={() => handleExternal('terminal')} className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer">
            Terminal.app
          </button>
          <button onClick={() => handleExternal('iterm2')} className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer">
            iTerm2
          </button>
          <button onClick={() => handleExternal('ghostty')} className="w-full text-left px-3 py-1.5 text-[11px] font-mono text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer">
            Ghostty
          </button>
        </div>
      )}
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
