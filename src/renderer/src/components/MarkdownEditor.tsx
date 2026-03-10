import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { indent } from '@milkdown/kit/plugin/indent'
import { getMarkdown, replaceAll, insert } from '@milkdown/kit/utils'
import type { EditorHandle } from '@/hooks/useEditor'
import type { Ctx } from '@milkdown/kit/ctx'

interface MarkdownEditorProps {
  initialContent: string
  onChange: (markdown: string) => void
}

export const MarkdownEditor = forwardRef<EditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ initialContent, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const editorCtxRef = useRef<Ctx | null>(null)
    const editorInstanceRef = useRef<Editor | null>(null)

    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (!editorCtxRef.current) return ''
        return getMarkdown()(editorCtxRef.current)
      },
      setMarkdown: (md: string) => {
        if (!editorCtxRef.current) return
        replaceAll(md)(editorCtxRef.current)
      },
      insertAtCursor: (text: string) => {
        if (!editorCtxRef.current) return
        insert(text)(editorCtxRef.current)
      }
    }))

    useEffect(() => {
      if (!containerRef.current) return

      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, containerRef.current!)
          ctx.set(defaultValueCtx, initialContent)
          ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
            onChange(md)
          })
        })
        .use(commonmark)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(indent)

      editor.create().then((instance) => {
        editorInstanceRef.current = instance
        editorCtxRef.current = instance.ctx
      })

      return () => {
        editor.destroy()
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return <div ref={containerRef} className="milkdown-editor" />
  }
)
