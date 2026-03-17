import { useState, useCallback } from 'react'
import { Button } from './ui/Button'
import { useFileOps } from '@/hooks/useFileOps'
import { useSettingsStore } from '@/stores/settings-store'
import { useContextStore } from '@/stores/context-store'
import { chooseDirectory, scanProjectFiles } from '@/services/file-bridge'
import { getFileName } from '@/lib/utils'
import { toast } from './ui/Toast'

interface WelcomeScreenProps {
  onCreateNew?: () => void
}

function getDirName(filePath: string): string {
  const parts = filePath.split('/')
  parts.pop()
  return parts.join('/') || '/'
}

export function WelcomeScreen({ onCreateNew }: WelcomeScreenProps) {
  const { openExisting, openRecent, createNew } = useFileOps()
  const {
    recentFiles, removeRecentFile,
    projectDir, setProjectDir,
    docProjectDirs,
    obsidianVaultPath
  } = useSettingsStore()
  const isScanning = useContextStore((s) => s.isScanning)
  const [scanCount, setScanCount] = useState<number | null>(() => {
    const store = useContextStore.getState()
    return store.hasContext ? store.files.length : null
  })

  const handleChooseProjectDir = useCallback(async () => {
    const dir = await chooseDirectory()
    if (!dir) return
    setProjectDir(dir)

    // Immediately scan in background
    useContextStore.getState().setScanning(true)
    setScanCount(null)
    toast('正在扫描项目目录...', 'info')
    try {
      const manifest = await scanProjectFiles(dir)
      setScanCount(manifest.length)
      useContextStore.getState().setFiles(
        manifest.map((f) => ({ relativePath: f.relativePath, size: f.size }))
      )
      toast(`已索引 ${manifest.length} 个项目文件`, 'success')
    } catch {
      toast('扫描项目目录失败', 'error')
    } finally {
      useContextStore.getState().setScanning(false)
    }
  }, [setProjectDir])

  const shortenPath = (path: string) => {
    const home = path.replace(/^\/Users\/[^/]+/, '~')
    if (home.length <= 50) return home
    const parts = home.split('/')
    if (parts.length <= 3) return home
    return parts[0] + '/.../' + parts.slice(-2).join('/')
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-1">VibeDocs</h1>
          <p className="text-xs text-text-muted">
            一个 idea，一份完整的 PRD — 产品经理的项目落地大杀器
          </p>
        </div>

        {/* Workspace info: project dir + obsidian vault */}
        <div className="mb-6 space-y-2">
          {/* Project Directory */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                项目目录
              </label>
              {!projectDir && (
                <span className="text-[10px] text-text-muted">
                  可稍后在 Settings 中设置
                </span>
              )}
            </div>

            {projectDir ? (
              <div className="flex items-center gap-2 bg-bg-tertiary border border-border rounded px-3 py-2">
                <span className="text-accent-green text-xs shrink-0">&#9632;</span>
                <span className="text-xs text-text-secondary font-mono truncate flex-1">
                  {shortenPath(projectDir)}
                </span>
                {isScanning && (
                  <span className="text-[10px] text-accent-blue animate-pulse shrink-0">
                    扫描中...
                  </span>
                )}
                {!isScanning && scanCount !== null && (
                  <span className="text-[10px] text-text-muted shrink-0">
                    {scanCount} 文件
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={handleChooseProjectDir} className="shrink-0 !px-2 !py-1">
                  变更
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setProjectDir('')
                    setScanCount(null)
                  }}
                  className="shrink-0 !px-2 !py-1 hover:!text-accent-red"
                >
                  清除
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                onClick={handleChooseProjectDir}
                className="w-full"
              >
                选择项目目录
              </Button>
            )}
            <p className="text-[10px] text-text-muted mt-1">
              Agent 将读取此目录获取项目 context，帮你提出更有针对性的问题
            </p>
          </div>

          {/* Obsidian Vault */}
          {obsidianVaultPath && (
            <div className="flex items-center gap-2 bg-bg-tertiary border border-border rounded px-3 py-2">
              <span className="text-accent-purple text-xs shrink-0">&#9830;</span>
              <span className="text-[10px] text-text-muted shrink-0">Obsidian</span>
              <span className="text-xs text-text-secondary font-mono truncate flex-1">
                {shortenPath(obsidianVaultPath)}
              </span>
            </div>
          )}
        </div>

        {/* Open / Create MD */}
        <div className="flex gap-3 mb-8">
          <Button variant="primary" size="lg" onClick={openExisting} className="flex-1">
            Open .md File
          </Button>
          <Button variant="secondary" size="lg" onClick={onCreateNew || createNew} className="flex-1">
            Create New
          </Button>
        </div>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Recent Files
            </h2>
            <div className="space-y-1">
              {recentFiles.map((file) => {
                const boundDir = docProjectDirs[file]
                const docDir = getDirName(file)
                return (
                  <div
                    key={file}
                    className="group flex items-start justify-between rounded px-3 py-2.5 hover:bg-bg-hover transition-colors cursor-pointer"
                    onClick={() => openRecent(file)}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs text-text-primary font-medium truncate">
                        {getFileName(file)}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted truncate">
                        <span className="text-accent-blue shrink-0">&#9679;</span>
                        <span className="shrink-0">文档</span>
                        <span className="font-mono truncate">{shortenPath(docDir)}</span>
                      </div>
                      {boundDir && (
                        <div className="flex items-center gap-1.5 text-[10px] text-text-muted truncate">
                          <span className="text-accent-green shrink-0">&#9679;</span>
                          <span className="shrink-0">项目</span>
                          <span className="font-mono truncate">{shortenPath(boundDir)}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecentFile(file)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent-red text-xs ml-2 mt-0.5 transition-opacity cursor-pointer"
                    >
                      &#10005;
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-border">
          <p className="text-xs text-text-muted">
            灵感是碎片的，PRD 不能是。AI Agent 替你追问每一个你没想到的细节，直到 Coding Agent 能精准执行。
          </p>
        </div>
      </div>
    </div>
  )
}
