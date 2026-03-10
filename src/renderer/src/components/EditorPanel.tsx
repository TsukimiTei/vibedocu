import { useRef, useCallback, useEffect } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import { EditorToolbar } from './EditorToolbar'
import { PageTabBar } from './PageTabBar'
import { useDocumentStore } from '@/stores/document-store'
import { useAgentStore } from '@/stores/agent-store'
import { getPageContent, updatePageContent } from '@/lib/page-utils'
import type { EditorHandle } from '@/hooks/useEditor'

interface EditorPanelProps {
  editorRef: React.MutableRefObject<EditorHandle | null>
  onUpdate: () => void
  onSave: () => void
}

export function EditorPanel({ editorRef, onUpdate, onSave }: EditorPanelProps) {
  const { content, currentPageIndex, setContent, markDirty } = useDocumentStore()
  const internalRef = useRef<EditorHandle>(null)
  const prevPageIndexRef = useRef(currentPageIndex)

  const initialPageContent = getPageContent(content, currentPageIndex)

  const handleChange = useCallback(
    (pageMd: string) => {
      const store = useDocumentStore.getState()
      const newFull = updatePageContent(store.content, store.currentPageIndex, pageMd)
      setContent(newFull)
      markDirty()
    },
    [setContent, markDirty]
  )

  const setRef = useCallback(
    (handle: EditorHandle | null) => {
      ;(internalRef as React.MutableRefObject<EditorHandle | null>).current = handle
      editorRef.current = handle
    },
    [editorRef]
  )

  // Switch page → update editor content and agent panel
  useEffect(() => {
    if (prevPageIndexRef.current !== currentPageIndex) {
      prevPageIndexRef.current = currentPageIndex
      const pageContent = getPageContent(
        useDocumentStore.getState().content,
        currentPageIndex
      )
      internalRef.current?.setMarkdown(pageContent)
      useAgentStore.getState().switchToPage(currentPageIndex)
    }
  }, [currentPageIndex])

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
      <EditorToolbar onUpdate={onUpdate} onSave={onSave} />
      <PageTabBar />
      <div className="flex-1 overflow-hidden">
        <MarkdownEditor
          ref={setRef}
          initialContent={initialPageContent}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}
