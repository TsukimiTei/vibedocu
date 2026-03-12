import { useTerminalStore } from '@/stores/terminal-store'
import { useDocumentStore } from '@/stores/document-store'
import { usePageStatusStore } from '@/stores/page-status-store'
import { AgentPanel } from './AgentPanel'
import { TerminalView } from './TerminalView'
import { parsePages } from '@/lib/page-utils'

import type { UpdateDocumentAnswerFn } from '@/lib/qa-utils'

interface LeftPanelProps {
  onInsert: (text: string) => void
  onOpenSettings: () => void
  onUpdateDocumentAnswer?: UpdateDocumentAnswerFn
}

export function LeftPanel({ onInsert, onOpenSettings, onUpdateDocumentAnswer }: LeftPanelProps) {
  const activeTab = useTerminalStore((s) => s.activeTab)
  const switchToAsk = useTerminalStore((s) => s.switchToAsk)
  const switchToTerminal = useTerminalStore((s) => s.switchToTerminal)
  const allSessions = useTerminalStore((s) => s.sessions)

  const activePageIndex = useDocumentStore((s) => s.activePageIndex)
  const content = useDocumentStore((s) => s.content)
  const pages = parsePages(content)
  const currentPageName = pages[activePageIndex]?.name || 'Base PRD'

  const hasSession = !!allSessions[currentPageName]
  const pageStatus = usePageStatusStore((s) => s.getStatus(currentPageName))

  // Terminal tab status indicator dot
  const terminalStatusDot = hasSession ? (
    pageStatus === 'running' ? 'bg-accent-blue animate-pulse' :
    pageStatus === 'completed' ? 'bg-accent-green' :
    pageStatus === 'failed' ? 'bg-accent-red' :
    'bg-text-muted/50'
  ) : null

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Segment Control */}
      <div className="flex items-center px-4 py-2 border-b border-border shrink-0 gap-1">
        <div className="flex bg-bg-tertiary rounded-md p-0.5 flex-1">
          <button
            onClick={switchToAsk}
            className={`flex-1 text-[12px] font-mono py-1.5 px-3 rounded transition-colors cursor-pointer ${
              activeTab === 'ask'
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Ask
          </button>
          <button
            onClick={switchToTerminal}
            className={`flex-1 text-[12px] font-mono py-1.5 px-3 rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'terminal'
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Terminal
            {terminalStatusDot && (
              <span className={`w-1.5 h-1.5 rounded-full ${terminalStatusDot}`} />
            )}
          </button>
        </div>
      </div>

      {/* Content — all panels always mounted, toggled via CSS to preserve state */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className={`h-full ${activeTab === 'ask' ? '' : 'hidden'}`}>
          <AgentPanel onInsert={onInsert} onOpenSettings={onOpenSettings} onUpdateDocumentAnswer={onUpdateDocumentAnswer} />
        </div>

        <div className={`h-full flex flex-col ${activeTab === 'terminal' ? '' : 'hidden'}`}>
          {/* Render ALL active terminal sessions, show/hide by current page */}
          {Object.values(allSessions).map((session) => (
            <div
              key={session.sessionId}
              className={`h-full flex flex-col ${session.pageName === currentPageName ? '' : 'hidden'}`}
            >
              <div className="flex items-center px-4 py-1.5 bg-bg-secondary border-b border-border shrink-0">
                <span className="text-[11px] font-mono text-text-secondary truncate">
                  {session.pageName}
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <TerminalView
                  sessionId={session.sessionId}
                  cwd={session.cwd}
                  prompt={session.prompt}
                  pageName={session.pageName}
                  onExit={(exitCode) => {
                    usePageStatusStore.getState().setStatus(session.pageName, exitCode === 0 ? 'completed' : 'failed')
                  }}
                />
              </div>
            </div>
          ))}

          {/* Placeholder when current page has no session */}
          {!hasSession && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <p className="text-sm text-text-muted font-mono">No terminal session</p>
                <p className="text-xs text-text-muted/60 font-mono">
                  Click &quot;Run&quot; on a page to start
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
