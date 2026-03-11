import { useState, useEffect, useCallback } from 'react'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateInfo {
  version?: string
  percent?: number
  message?: string
}

export function UpdateNotifier() {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [info, setInfo] = useState<UpdateInfo>({})
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const updater = (window as any).updater
    if (!updater?.onStatus) return
    return updater.onStatus((s: string, data?: any) => {
      setStatus(s as UpdateStatus)
      if (data) setInfo(data)
      if (s === 'available') setDismissed(false)
    })
  }, [])

  const handleDownload = useCallback(() => {
    ;(window as any).updater?.download()
  }, [])

  const handleInstall = useCallback(() => {
    ;(window as any).updater?.install()
  }, [])

  // Only show when there's something actionable
  if (dismissed || (status !== 'available' && status !== 'downloading' && status !== 'downloaded')) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[320px] rounded-lg border border-border bg-bg-primary shadow-2xl p-4 font-mono">
      {status === 'available' && (
        <>
          <p className="text-xs text-text-primary mb-1">
            新版本可用: <span className="text-accent-blue font-semibold">v{info.version}</span>
          </p>
          <p className="text-[11px] text-text-muted mb-3">是否立即下载更新？</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              稍后
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded text-xs bg-accent-blue/20 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/30 transition-colors cursor-pointer"
            >
              下载更新
            </button>
          </div>
        </>
      )}

      {status === 'downloading' && (
        <>
          <p className="text-xs text-text-primary mb-2">正在下载更新...</p>
          <div className="w-full h-1.5 rounded-full bg-bg-secondary overflow-hidden">
            <div
              className="h-full bg-accent-blue rounded-full transition-all duration-300"
              style={{ width: `${info.percent || 0}%` }}
            />
          </div>
          <p className="text-[11px] text-text-muted mt-1 text-right">{info.percent || 0}%</p>
        </>
      )}

      {status === 'downloaded' && (
        <>
          <p className="text-xs text-text-primary mb-1">更新已下载完成</p>
          <p className="text-[11px] text-text-muted mb-3">重启应用以完成安装</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              稍后
            </button>
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 rounded text-xs bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-colors cursor-pointer"
            >
              立即重启
            </button>
          </div>
        </>
      )}
    </div>
  )
}
