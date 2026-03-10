import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { useDocumentStore } from '@/stores/document-store'
import { useAgentStore } from '@/stores/agent-store'
import { useSettingsStore } from '@/stores/settings-store'
import { copyToClipboard, syncToVault } from '@/services/file-bridge'
import { buildCopyMessage } from '@/services/prompt-builder'
import { toast } from './ui/Toast'
import { getFileName } from '@/lib/utils'
import { parsePages } from '@/lib/page-utils'

interface EditorToolbarProps {
  onUpdate: () => void
  onSave: () => void
  onOpenSettings: () => void
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

export function EditorToolbar({ onUpdate, onSave, onOpenSettings }: EditorToolbarProps) {
  const { filePath, content, isDirty, createdAt, lastEdited, lastSaved, activePageIndex } = useDocumentStore()
  const isLoading = useAgentStore((s) => s.isLoading)
  const sessions = useAgentStore((s) => s.sessions)
  const pageOrderReversed = useSettingsStore((s) => s.pageOrderReversed)
  const togglePageOrder = useSettingsStore((s) => s.togglePageOrder)

  const [showMessagePanel, setShowMessagePanel] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState<'msg' | 'path' | false>(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const messagePanelRef = useRef<HTMLDivElement>(null)
  const detailsPanelRef = useRef<HTMLDivElement>(null)

  const pages = parsePages(content)
  const currentPageName = pages[activePageIndex]?.name || 'Base PRD'
  const message = filePath && content ? buildCopyMessage(filePath, currentPageName, activePageIndex) : ''

  const handleCopyPath = async () => {
    if (filePath) {
      await copyToClipboard(filePath)
      setCopied('path')
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleCopyMsg = async () => {
    await copyToClipboard(message)
    setCopied('msg')
    setTimeout(() => setCopied(false), 1500)
  }

  const doSync = useCallback(async (overwrite: boolean) => {
    const vaultPath = useSettingsStore.getState().obsidianVaultPath
    if (!filePath) return

    // Save before syncing to ensure latest content is on disk
    if (isDirty) {
      await window.api.file.write(filePath, content)
      useDocumentStore.getState().markSaved()
    }

    setIsSyncing(true)
    try {
      const result = await syncToVault(filePath, vaultPath, overwrite)
      if (result.conflict) {
        setShowConflictDialog(true)
      } else if (result.success) {
        toast('同步成功', 'success')
      } else {
        toast(result.error || '同步失败', 'error', {
          label: '打开设置',
          onClick: onOpenSettings
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[sync] error:', msg)
      toast(`同步失败: ${msg}`, 'error', {
        label: '打开设置',
        onClick: onOpenSettings
      })
    } finally {
      setIsSyncing(false)
    }
  }, [filePath, isDirty, content, onOpenSettings])

  const handleSync = useCallback(() => {
    const vaultPath = useSettingsStore.getState().obsidianVaultPath
    if (!vaultPath) {
      toast('请先配置 Obsidian Vault 路径', 'info', {
        label: '打开设置',
        onClick: onOpenSettings
      })
      return
    }
    doSync(false)
  }, [doSync, onOpenSettings])

  const handleConflictOverwrite = useCallback(() => {
    setShowConflictDialog(false)
    doSync(true)
  }, [doSync])

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
    { label: '当前页面', value: currentPageName },
    { label: '页面数', value: `${pages.length}` },
    { label: '创建时间', value: formatTime(createdAt) },
    { label: '最后编辑', value: formatTime(lastEdited) },
    { label: '最后保存', value: formatTime(lastSaved) },
    { label: '字数 (当前页)', value: pages[activePageIndex] ? countWords(pages[activePageIndex].content).toLocaleString() : '0' },
    { label: '问答轮次', value: `${sessions.length}` },
  ]

  return (
    <div className="relative flex items-center justify-between px-4 py-2 border-b border-border bg-bg-primary shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-text-muted truncate max-w-[200px]">
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
        <button
          onClick={togglePageOrder}
          className="inline-flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer text-[13px] font-mono"
        >
          {pageOrderReversed ? '↓' : '↑'}
        </button>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" onClick={handleSync} disabled={!filePath || isSyncing}>
          {isSyncing ? 'Syncing...' : 'Sync'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setShowMessagePanel(!showMessagePanel); setShowDetails(false) }}
          disabled={!filePath}
        >
          Copy
        </Button>
        <button
            onClick={onUpdate}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-accent-blue/30 bg-accent-blue/20 text-accent-blue text-[13px] font-mono hover:bg-accent-blue/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Analyzing...' : 'Update'}
            <kbd className="px-1 py-0.5 rounded bg-accent-blue/20 text-[10px] font-mono text-accent-blue/70">⌘↵</kbd>
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
          className="absolute right-4 top-full mt-1 z-50 w-[480px] max-h-[440px] flex flex-col rounded-lg border border-border bg-bg-primary shadow-2xl"
        >
          {/* Copy Path */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-text-muted font-mono uppercase tracking-wider">Path</span>
              <p className="text-xs text-text-secondary font-mono truncate mt-0.5">{filePath || '—'}</p>
            </div>
            <button
              onClick={handleCopyPath}
              className="shrink-0 ml-3 px-3 py-1 rounded text-xs font-medium bg-bg-secondary text-text-secondary border border-border hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              {copied === 'path' ? 'Copied!' : 'Copy Path'}
            </button>
          </div>
          {/* Copy Message */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
            <span className="text-[11px] text-text-muted font-mono uppercase tracking-wider">Message</span>
            <button
              onClick={handleCopyMsg}
              className="px-3 py-1 rounded text-xs font-medium bg-accent-green/15 text-accent-green border border-accent-green/30 hover:bg-accent-green/25 transition-colors cursor-pointer"
            >
              {copied === 'msg' ? 'Copied!' : 'Copy Message'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <pre className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono">
              {message}
            </pre>
          </div>
        </div>
      )}

      <Dialog
        open={showConflictDialog}
        onClose={() => setShowConflictDialog(false)}
        title="文件冲突"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary font-mono leading-relaxed">
            Vault 中已存在同名文件 <span className="text-text-primary">{filePath ? getFileName(filePath) : ''}</span>，是否覆盖？
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowConflictDialog(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConflictOverwrite}
            >
              覆盖
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
