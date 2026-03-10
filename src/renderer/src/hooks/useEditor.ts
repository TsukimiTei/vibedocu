import { useCallback, useRef } from 'react'

export interface EditorHandle {
  getMarkdown: () => string
  setMarkdown: (md: string) => void
  insertAtCursor: (text: string) => void
}

export function useEditor() {
  const editorRef = useRef<EditorHandle | null>(null)

  const getMarkdown = useCallback(() => {
    return editorRef.current?.getMarkdown() ?? ''
  }, [])

  const setMarkdown = useCallback((md: string) => {
    editorRef.current?.setMarkdown(md)
  }, [])

  const insertAtCursor = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text)
  }, [])

  return { editorRef, getMarkdown, setMarkdown, insertAtCursor }
}
