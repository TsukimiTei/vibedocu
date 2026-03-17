import { useState, useCallback } from 'react'
import { Button } from './ui/Button'
import { OpenDocDialog } from './OpenDocDialog'
import { useFileOps } from '@/hooks/useFileOps'
import { useSettingsStore } from '@/stores/settings-store'
import { getFileName } from '@/lib/utils'

interface WelcomeScreenProps {
  onCreateNew?: () => void
  onOpenSettings?: () => void
}

function getDocTitle(filePath: string): string {
  const name = getFileName(filePath)
  return name.replace(/\.md$/i, '')
}

function getDirName(filePath: string): string {
  const parts = filePath.split('/')
  parts.pop()
  return parts.join('/') || '/'
}

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps) {
  const { openRecent, openAtPath, createAtDir } = useFileOps()
  const { recentFiles, removeRecentFile, docProjectDirs } = useSettingsStore()
  const [dialogMode, setDialogMode] = useState<'open' | 'new' | null>(null)

  const handleConfirm = useCallback(
    async (path: string, projectDir: string) => {
      setDialogMode(null)
      if (dialogMode === 'open') {
        await openAtPath(path, projectDir || undefined)
      } else if (dialogMode === 'new') {
        await createAtDir(path, undefined, projectDir || undefined)
      }
    },
    [dialogMode, openAtPath, createAtDir]
  )

  const shortenPath = (path: string) => {
    const home = path.replace(/^\/Users\/[^/]+/, '~')
    if (home.length <= 35) return home
    const parts = home.split('/')
    if (parts.length <= 3) return home
    return parts[0] + '/.../' + parts.slice(-2).join('/')
  }

  return (
    <>
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto">
        <div className="w-full max-w-3xl px-10 py-8">
          {/* Toolbar header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-text-primary">VibeDocs</h1>
              <p className="text-[11px] text-text-muted mt-0.5">
                一个 idea，一份完整的 PRD
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => setDialogMode('open')}>
                Open .md File
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDialogMode('new')}>
                Create New
              </Button>
              {onOpenSettings && (
                <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                  &#9881; Settings
                </Button>
              )}
            </div>
          </div>

          <div className="border-b border-border mb-6" />

          {/* Recent Files Grid */}
          {recentFiles.length > 0 ? (
            <div>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                Recent Files
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                {recentFiles.map((file) => {
                  const boundDir = docProjectDirs[file]
                  const docDir = getDirName(file)
                  const title = getDocTitle(file)
                  return (
                    <div
                      key={file}
                      className="group relative rounded-lg border border-border bg-bg-secondary hover:border-border-focus hover:bg-bg-hover transition-colors cursor-pointer px-3.5 py-3"
                      onClick={() => openRecent(file)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeRecentFile(file)
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-red text-[10px] transition-opacity cursor-pointer"
                      >
                        &#10005;
                      </button>

                      <div className="text-sm font-semibold text-text-primary truncate mb-2 pr-4">
                        {title}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-[10px] text-text-muted truncate">
                          <span className="text-accent-blue shrink-0">&#9679;</span>
                          <span className="font-mono truncate">{shortenPath(docDir)}</span>
                        </div>
                        {boundDir && (
                          <div className="flex items-center gap-1 text-[10px] text-text-muted truncate">
                            <span className="text-accent-green shrink-0">&#9679;</span>
                            <span className="font-mono truncate">{shortenPath(boundDir)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <p className="text-sm mb-2">还没有最近文件</p>
              <p className="text-xs">点击 Open 打开已有文档，或 New 创建新文档</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-border text-center">
            <p className="text-[11px] text-text-muted">
              灵感是碎片的，PRD 不能是。AI Agent 替你追问每一个你没想到的细节，直到 Coding Agent 能精准执行。
            </p>
          </div>
        </div>
      </div>

      <OpenDocDialog
        open={dialogMode !== null}
        mode={dialogMode || 'open'}
        onClose={() => setDialogMode(null)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
