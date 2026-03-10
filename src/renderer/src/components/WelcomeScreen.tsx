import { Button } from './ui/Button'
import { useFileOps } from '@/hooks/useFileOps'
import { useSettingsStore } from '@/stores/settings-store'
import { getFileName } from '@/lib/utils'

interface WelcomeScreenProps {
  onCreateNew?: () => void
}

export function WelcomeScreen({ onCreateNew }: WelcomeScreenProps) {
  const { openExisting, openRecent, createNew } = useFileOps()
  const { recentFiles, removeRecentFile } = useSettingsStore()

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-1">VibeDocs</h1>
          <p className="text-xs text-text-muted">
            AI-powered requirement refinement for vibe coding
          </p>
        </div>

        <div className="flex gap-3 mb-8">
          <Button variant="primary" size="lg" onClick={openExisting} className="flex-1">
            Open .md File
          </Button>
          <Button variant="secondary" size="lg" onClick={onCreateNew || createNew} className="flex-1">
            Create New
          </Button>
        </div>

        {recentFiles.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Recent Files
            </h2>
            <div className="space-y-1">
              {recentFiles.map((file) => (
                <div
                  key={file}
                  className="group flex items-center justify-between rounded px-3 py-2 hover:bg-bg-hover transition-colors cursor-pointer"
                  onClick={() => openRecent(file)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-text-primary truncate">
                      {getFileName(file)}
                    </div>
                    <div className="text-xs text-text-muted truncate">{file}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecentFile(file)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-red text-xs ml-2 transition-opacity cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-border">
          <p className="text-xs text-text-muted">
            Open or create a markdown document, then let the AI agent ask questions to refine
            your requirements until they are ready for implementation.
          </p>
        </div>
      </div>
    </div>
  )
}
