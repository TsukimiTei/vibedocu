import { useRef, useCallback, useEffect } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import { EditorToolbar } from './EditorToolbar'
import { useDocumentStore } from '@/stores/document-store'
import type { EditorHandle } from '@/hooks/useEditor'

interface EditorPanelProps {
  editorRef: React.MutableRefObject<EditorHandle | null>
  onUpdate: () => void
  onSave: () => void
}

export function EditorPanel({ editorRef, onUpdate, onSave }: EditorPanelProps) {
  const { content, setContent, markDirty } = useDocumentStore()
  const internalRef = useRef<EditorHandle>(null)

  const handleChange = useCallback(
    (md: string) => {
      setContent(md)
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
      <div className="flex-1 overflow-hidden">
        <MarkdownEditor
          ref={setRef}
          initialContent={content}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}
