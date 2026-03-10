import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/Button'
import { useDocumentStore } from '@/stores/document-store'
import { copyToClipboard } from '@/services/file-bridge'
import { buildCopyMessage } from '@/services/prompt-builder'
import { useAgentStore } from '@/stores/agent-store'
import { getFileName } from '@/lib/utils'

interface EditorToolbarProps {
  onUpdate: () => void
  onSave: () => void
}

export function EditorToolbar({ onUpdate, onSave }: EditorToolbarProps) {
  const { filePath, content, isDirty } = useDocumentStore()
  const isLoading = useAgentStore((s) => s.isLoading)
  const [showMessagePanel, setShowMessagePanel] = useState(false)
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const message = filePath && content ? buildCopyMessage(filePath, content) : ''

  const handleCopyPath = async () => {
    if (filePath) {
      await copyToClipboard(filePath)
    }
  }

  const handleCopy = async () => {
    await copyToClipboard(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => {
    if (!showMessagePanel) return
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowMessagePanel(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowMessagePanel(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showMessagePanel])

  return (
    <div className="relative flex items-center justify-between px-4 py-2 border-b border-border bg-bg-primary shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted truncate max-w-[200px]">
          {filePath ? getFileName(filePath) : 'Untitled'}
        </span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent-orange" title="Unsaved changes" />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={onSave} disabled={!isDirty}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCopyPath} disabled={!filePath}>
          Copy Path
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowMessagePanel(!showMessagePanel)}
          disabled={!content}
        >
          Copy Message
        </Button>
        <Button size="sm" variant="primary" onClick={onUpdate} disabled={isLoading}>
          {isLoading ? 'Analyzing...' : 'Update'}
        </Button>
      </div>

      {showMessagePanel && (
        <div
          ref={panelRef}
          className="absolute right-4 top-full mt-1 z-50 w-[480px] max-h-[400px] flex flex-col rounded-lg border border-border bg-bg-primary shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
            <span className="text-sm font-medium text-text-primary">Message Preview</span>
            <button
              onClick={handleCopy}
              className="px-3 py-1 rounded text-xs font-medium bg-accent-green/15 text-accent-green border border-accent-green/30 hover:bg-accent-green/25 transition-colors cursor-pointer"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <pre className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono">
              {message}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
