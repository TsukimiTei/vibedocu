import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/Button'
import { useDocumentStore } from '@/stores/document-store'
import { useAgentStore } from '@/stores/agent-store'
import { copyToClipboard } from '@/services/file-bridge'
import { buildCopyMessage } from '@/services/prompt-builder'
import { getFileName } from '@/lib/utils'
import { getPageContent, parsePages } from '@/lib/page-utils'

interface EditorToolbarProps {
  onUpdate: () => void
  onSave: () => void
}

function formatTime(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function countWords(text: string): number {
  const chinese = text.match(/[\u4e00-\u9fff]/g)?.length || 0
  const english = text.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return chinese + english
}

export function EditorToolbar({ onUpdate, onSave }: EditorToolbarProps) {
  const { filePath, content, isDirty, createdAt, lastEdited, lastSaved, currentPageIndex } = useDocumentStore()
  const isLoading = useAgentStore((s) => s.isLoading)
  const sessions = useAgentStore((s) => s.sessions)

  const [showMessagePanel, setShowMessagePanel] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)
  const messagePanelRef = useRef<HTMLDivElement>(null)
  const detailsPanelRef = useRef<HTMLDivElement>(null)

  const pages = parsePages(content)
  const pageContent = getPageContent(content, currentPageIndex)
  const basePrdContent = currentPageIndex > 0 ? getPageContent(content, 0) : null
  const message = filePath && content ? buildCopyMessage(filePath, pageContent, basePrdContent) : ''

  const handleCopyPath = async () => {
    if (filePath) await copyToClipboard(filePath)
  }

  const handleCopy = async () => {
    await copyToClipboard(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showMessagePanel && messagePanelRef.current && !messagePanelRef.current.contains(e.target as Node)) {
        setShowMessagePanel(false)
      }
      if (showDetails && detailsPanelRef.current && !detailsPanelRef.current.contains(e.target as Node)) {
        setShowDetails(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowMessagePanel(false)
        setShowDetails(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showMessagePanel, showDetails])

  const detailRows = [
    { label: '文件路径', value: filePath || '—' },
    { label: '当前页面', value: pages[currentPageIndex]?.name || 'Base PRD' },
    { label: '页面数', value: `${pages.length}` },
    { label: '创建时间', value: formatTime(createdAt) },
    { label: '最后编辑', value: formatTime(lastEdited) },
    { label: '最后保存', value: formatTime(lastSaved) },
    { label: '字数 (当前页)', value: pageContent ? countWords(pageContent).toLocaleString() : '0' },
    { label: '问答轮次', value: `${sessions.length}` },
  ]

  return (
    <div className="relative flex items-center justify-between px-4 py-2 border-b border-border bg-bg-primary shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted truncate max-w-[200px]">
          {filePath ? getFileName(filePath) : 'Untitled'}
        </span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent-orange" title="Unsaved changes" />
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setShowDetails(!showDetails); setShowMessagePanel(false) }}
        >
          Details
        </Button>
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
          onClick={() => { setShowMessagePanel(!showMessagePanel); setShowDetails(false) }}
          disabled={!content}
        >
          Copy Message
        </Button>
        <button
          onClick={onUpdate}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-1 rounded border border-accent-blue/30 bg-accent-blue/20 text-accent-blue text-xs font-mono hover:bg-accent-blue/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Analyzing...' : 'Update'}
          <kbd className="px-1.5 py-0.5 rounded bg-accent-blue/20 text-[10px] font-mono text-accent-blue/70">⌘↵</kbd>
        </button>
      </div>

      {showDetails && (
        <div
          ref={detailsPanelRef}
          className="absolute left-4 top-full mt-1 z-50 w-[320px] rounded-lg border border-border bg-bg-primary shadow-2xl"
        >
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-sm font-medium text-text-primary">文档详情</span>
          </div>
          <div className="p-3 space-y-2">
            {detailRows.map((row) => (
              <div key={row.label} className="flex justify-between text-xs">
                <span className="text-text-muted">{row.label}</span>
                <span className="text-text-primary truncate max-w-[180px] text-right">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showMessagePanel && (
        <div
          ref={messagePanelRef}
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
