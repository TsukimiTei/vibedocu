import { useAgentStore } from '@/stores/agent-store'
import { CompletenessBar } from './CompletenessBar'
import { QuestionCard } from './QuestionCard'
import { Button } from './ui/Button'
import { useAgent } from '@/hooks/useAgent'

interface AgentPanelProps {
  onInsert: (text: string) => void
  onOpenSettings: () => void
}

export function AgentPanel({ onInsert, onOpenSettings }: AgentPanelProps) {
  const { currentQuestions, sessions, isLoading, error } = useAgentStore()
  const { runAnalysis } = useAgent()

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-text-primary uppercase tracking-wider">
          Agent
        </span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onOpenSettings}>
            Settings
          </Button>
        </div>
      </div>

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
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-text-muted mb-1">暂无问题</p>
            <p className="text-xs text-text-muted">
              点击编辑器工具栏的 "Update" 来分析你的文档
            </p>
          </div>
        )}

        {currentQuestions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            onInsert={(text) => {
              onInsert(text)
              useAgentStore.getState().markAnswered(q.id, text)
            }}
          />
        ))}

        {sessions.length > 1 && (
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
              历史会话 ({sessions.length - 1})
            </p>
            {sessions.slice(0, -1).reverse().map((session) => (
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
