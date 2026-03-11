import { usePageStatusStore } from '@/stores/page-status-store'
import type { PageStatus } from '@/types/page-status'

const STATUS_CONFIG: Record<PageStatus, { label: string; color: string; dot: string } | null> = {
  idle: null,
  running: { label: 'Run', color: 'text-accent-blue', dot: 'bg-accent-blue animate-pulse' },
  developing: { label: 'Dev', color: 'text-accent-orange', dot: 'bg-accent-orange' },
  completed: { label: 'Done', color: 'text-accent-green', dot: 'bg-accent-green' },
  failed: { label: 'Fail', color: 'text-accent-red', dot: 'bg-accent-red' }
}

interface PageStatusBadgeProps {
  pageName: string
}

export function PageStatusBadge({ pageName }: PageStatusBadgeProps) {
  const status = usePageStatusStore((s) => s.getStatus(pageName))

  const config = STATUS_CONFIG[status]
  if (!config) return null

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${config.color} shrink-0`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
