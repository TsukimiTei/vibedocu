import { useState } from 'react'
import { useAgentStore } from '@/stores/agent-store'
import { useDocumentStore } from '@/stores/document-store'
import { useContextStore } from '@/stores/context-store'
import { CompletenessBar } from './CompletenessBar'
import { QuestionCard } from './QuestionCard'
import type { UpdateDocumentAnswerFn } from '@/lib/qa-utils'
import { Button } from './ui/Button'
import { useAgent } from '@/hooks/useAgent'
import { parsePages, getPageTitle, formatPageLabel } from '@/lib/page-utils'

interface AgentPanelProps {
  onInsert: (text: string) => void
  onOpenSettings: () => void
  onUpdateDocumentAnswer?: UpdateDocumentAnswerFn
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

function ContextSection() {
  const { files, hasContext, isScanning } = useContextStore()
  const { refreshContext } = useAgent()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="px-4 py-2.5 border-b border-border">
      <div className="flex items-center justify-between">
        <button
          onClick={() => hasContext && setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          <span
            className={`transition-transform duration-150 text-[10px] ${expanded ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className="uppercase tracking-wider font-medium">Context</span>
          {isScanning ? (
            <span className="inline-block w-3 h-3 border border-accent-blue/30 border-t-accent-blue rounded-full animate-spin ml-1" />
          ) : hasContext ? (
            <span className="text-text-muted ml-1">{files.length} files</span>
          ) : (
            <span className="text-text-muted/50 ml-1">not scanned</span>
          )}
        </button>
        <button
          onClick={refreshContext}
          disabled={isScanning}
          className="text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed px-1.5 py-0.5 rounded hover:bg-bg-secondary"
          title="重新扫描项目目录"
        >
          ↻
        </button>
      </div>

      {expanded && hasContext && (
        <div className="mt-2 max-h-[160px] overflow-y-auto space-y-0.5">
          {files.map((f) => (
            <div
              key={f.relativePath}
              className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded hover:bg-bg-secondary"
            >
              <span className="text-text-secondary truncate mr-2">{f.relativePath}</span>
              <span className="text-text-muted shrink-0">{formatSize(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AgentPanel({ onInsert, onOpenSettings, onUpdateDocumentAnswer }: AgentPanelProps) {
  const { currentQuestions, sessions, isLoading, error } = useAgentStore()
  const { runAnalysis } = useAgent()
  const activePageIndex = useDocumentStore((s) => s.activePageIndex)
  const content = useDocumentStore((s) => s.content)

  const pages = parsePages(content)
  const currentPageName = pages[activePageIndex]?.name || 'Base PRD'
  const currentPageTitle = getPageTitle(content, activePageIndex)
  const currentPageLabel = formatPageLabel(activePageIndex, currentPageTitle, currentPageName)
  const pageSessions = sessions.filter((s) => s.pageIndex === activePageIndex)

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-text-primary uppercase tracking-wider">
            Agent
          </span>
          <span className="text-[13px] text-text-muted px-2 py-0.5 rounded bg-bg-secondary">
            {currentPageLabel}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onOpenSettings}>
            Settings
          </Button>
        </div>
      </div>

      <ContextSection />

      <CompletenessBar onRetry={runAnalysis} />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span className="inline-block w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
              正在分析文档...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-4 py-3">
            <p className="text-sm text-accent-red">{error}</p>
            <Button
              size="sm"
              variant="danger"
              className="mt-2"
              onClick={runAnalysis}
            >
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && currentQuestions.length === 0 && (
          <div className="py-6 space-y-5">
            <p className="text-sm font-medium text-text-primary">如何使用 VibeDocs</p>
            <div className="space-y-4">
              {[
                { step: '1', text: '在右侧编辑器写下一句话，描述你想做的产品' },
                { step: '2', text: '点击工具栏 Update，AI 会分析文档并提出问题' },
                { step: '3', text: '回答 Agent 的问题，不断完善你的需求文档' },
                { step: '4', text: '重复直到完成度超过 80%' },
                { step: '5', text: '点击 Copy Message，将完整 prompt 复制给 Coding Agent' },
                { step: '6', text: 'Coding Agent 根据你的需求文档开始编码' }
              ].map((item) => (
                <div key={item.step} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-accent-blue/15 text-accent-blue flex items-center justify-center text-xs font-bold">
                    {item.step}
                  </span>
                  <p className="text-sm text-text-secondary leading-relaxed pt-0.5">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentQuestions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={idx + 1}
            total={currentQuestions.length}
            onInsert={(text) => {
              onInsert(text)
              useAgentStore.getState().markAnswered(q.id, text)
            }}
            onUpdateDocumentAnswer={onUpdateDocumentAnswer}
          />
        ))}

        {pageSessions.length > 1 && (
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
              历史会话 ({pageSessions.length - 1})
            </p>
            {pageSessions.slice(0, -1).reverse().map((session) => (
              <div key={session.id} className="mb-2 px-3 py-2 rounded bg-bg-secondary">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>{new Date(session.timestamp).toLocaleTimeString()}</span>
                  <span>{session.completeness.overall}%</span>
                </div>
                <p className="text-xs text-text-muted">
                  {session.questions.length} 个问题
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
