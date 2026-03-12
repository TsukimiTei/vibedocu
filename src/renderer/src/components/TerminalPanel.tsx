import { TerminalView } from './TerminalView'
import { useDocumentStore } from '@/stores/document-store'
import { parsePages, getPageTitle, formatPageLabel } from '@/lib/page-utils'

interface TerminalPanelProps {
  sessionId: string
  cwd: string
  prompt: string
  pageName: string
  onClose: () => void
}

export function TerminalPanel({ sessionId, cwd, prompt, pageName, onClose }: TerminalPanelProps) {
  const content = useDocumentStore((s) => s.content)
  const pages = parsePages(content)
  const pageIndex = pages.findIndex((p) => p.name === pageName)
  const displayLabel = pageIndex >= 0 ? formatPageLabel(pageIndex, getPageTitle(content, pageIndex), pageName) : pageName
  return (
    <div
      className="flex flex-col border-t border-border bg-bg-primary"
      style={{ height: '300px', minHeight: '200px' }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-bg-secondary border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-accent-blue">TERMINAL</span>
          <span className="text-[11px] font-mono text-text-muted">&mdash;</span>
          <span className="text-[11px] font-mono text-text-secondary truncate max-w-[300px]">
            {displayLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-[14px] font-mono cursor-pointer transition-colors px-1.5 py-0.5 rounded hover:bg-bg-hover leading-none"
          title="Close terminal"
        >
          &times;
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 min-h-0">
        <TerminalView
          sessionId={sessionId}
          cwd={cwd}
          prompt={prompt}
          pageName={pageName}
        />
      </div>
    </div>
  )
}
