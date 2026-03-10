import { ProgressBar } from './ui/ProgressBar'
import { Tooltip } from './ui/Tooltip'
import { useAgentStore } from '@/stores/agent-store'

interface CompletenessBarProps {
  onRetry: () => void
}

export function CompletenessBar({ onRetry }: CompletenessBarProps) {
  const completeness = useAgentStore((s) => s.completeness)
  const isLoading = useAgentStore((s) => s.isLoading)

  if (!completeness) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-text-muted">完成度</span>
          <span className="text-sm text-text-muted">—</span>
        </div>
        <ProgressBar value={0} className="h-2.5" />
      </div>
    )
  }

  const tooltipContent = (
    <div className="space-y-2 min-w-[220px]">
      {completeness.breakdown.map((dim) => (
        <div key={dim.dimension}>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">{dim.dimension}</span>
            <span className="text-text-primary">{dim.score}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-bg-tertiary mt-0.5">
            <div
              className="h-full rounded-full bg-accent-blue"
              style={{ width: `${dim.score}%` }}
            />
          </div>
          {dim.suggestion && (
            <p className="text-xs text-text-muted mt-0.5">{dim.suggestion}</p>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center justify-between mb-1.5">
        <Tooltip content={tooltipContent} className="!whitespace-normal !max-w-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted">完成度</span>
            <span className="text-sm font-semibold text-text-primary">
              {completeness.overall}%
            </span>
          </div>
        </Tooltip>
        <button
          onClick={onRetry}
          disabled={isLoading}
          className="px-3 py-1 rounded text-xs font-medium text-accent-blue hover:bg-accent-blue/15 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? '分析中...' : 'Retry'}
        </button>
      </div>
      <ProgressBar value={completeness.overall} className="h-2.5" />
    </div>
  )
}
