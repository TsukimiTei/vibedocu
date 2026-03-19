import { useState } from 'react'
import type { Screenshot } from '@/types/screenshot'
import { cn } from '@/lib/utils'

interface ScreenshotCardProps {
  screenshot: Screenshot
  thumbnailSrc?: string
  /** Total number of screenshots (for progress display like "分析中 3/50") */
  analyzeProgress?: string
  onPreview: () => void
  onRename: (newName: string) => void
  onDelete: () => void
  onRetry: () => void
  /** Drag handlers */
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: (e: React.DragEvent) => void
  isDragOver?: boolean
}

export function ScreenshotCard({
  screenshot,
  thumbnailSrc,
  analyzeProgress,
  onPreview,
  onRename,
  onDelete,
  onRetry,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver
}: ScreenshotCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const displayName = screenshot.displayName || screenshot.analysis?.name || ''
  const statusIcon =
    screenshot.status === 'analyzing' ? (
      <span className="inline-block w-3 h-3 border border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
    ) : screenshot.status === 'completed' ? (
      <span className="text-accent-green text-[10px]">&#10003;</span>
    ) : screenshot.status === 'failed' ? (
      <span className="text-accent-red text-[10px]">✕</span>
    ) : null

  const handleStartEdit = () => {
    setEditValue(displayName)
    setIsEditing(true)
  }

  const handleConfirmEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== displayName) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={cn(
        'group relative rounded-lg border overflow-hidden transition-all duration-150 cursor-grab active:cursor-grabbing',
        isDragOver
          ? 'border-accent-blue bg-accent-blue/10 scale-[1.02]'
          : 'border-border hover:border-accent-blue/30 bg-bg-secondary'
      )}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-auto cursor-pointer"
        onClick={onPreview}
      >
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={displayName || screenshot.filename}
            className="w-full h-auto object-contain bg-black/5"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-video bg-bg-tertiary flex items-center justify-center">
            <span className="text-text-muted/30 text-2xl">🖼</span>
          </div>
        )}

        {/* ID badge overlay */}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono font-bold">
          #{screenshot.id}
        </div>

        {/* Status overlay */}
        {screenshot.status === 'analyzing' && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="flex flex-col items-center gap-1">
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {analyzeProgress && (
                <span className="text-[10px] text-white/80 font-mono">{analyzeProgress}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1.5 min-h-[20px]">
          {statusIcon}
          {isEditing ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmEdit()
                if (e.key === 'Escape') setIsEditing(false)
              }}
              onBlur={handleConfirmEdit}
              className="flex-1 text-[11px] font-mono bg-bg-tertiary border border-border rounded px-1 py-0.5 text-text-primary outline-none focus:border-accent-blue"
            />
          ) : (
            <span
              className="flex-1 text-[11px] font-mono text-text-secondary truncate cursor-pointer hover:text-text-primary"
              onDoubleClick={handleStartEdit}
              title={displayName || '双击编辑名称'}
            >
              {displayName || (
                <span className="text-text-muted/50 italic">未命名</span>
              )}
            </span>
          )}
        </div>

        {/* Action buttons — visible on hover */}
        <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleStartEdit}
            className="text-[10px] text-text-muted hover:text-accent-blue transition-colors cursor-pointer font-mono px-1 rounded hover:bg-bg-hover"
          >
            编辑
          </button>
          {screenshot.status === 'failed' && (
            <button
              onClick={onRetry}
              className="text-[10px] text-accent-orange hover:text-accent-orange/80 transition-colors cursor-pointer font-mono px-1 rounded hover:bg-bg-hover"
            >
              重试
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onDelete}
            className="text-[10px] text-text-muted hover:text-accent-red transition-colors cursor-pointer font-mono px-1 rounded hover:bg-bg-hover"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
