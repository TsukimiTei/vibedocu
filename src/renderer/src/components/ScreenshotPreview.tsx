import { useEffect, useCallback } from 'react'
import type { Screenshot } from '@/types/screenshot'

interface ScreenshotPreviewProps {
  screenshot: Screenshot
  thumbnailSrc: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

export function ScreenshotPreview({
  screenshot,
  thumbnailSrc,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext
}: ScreenshotPreviewProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext && onNext) onNext()
    },
    [onClose, onPrev, onNext, hasPrev, hasNext]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 px-4">
          <span className="text-sm font-mono text-white/80 bg-white/10 px-2 py-0.5 rounded">
            #{screenshot.id}
          </span>
          <span className="text-sm text-white/90 font-medium">
            {screenshot.displayName || screenshot.analysis?.name || screenshot.filename}
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-white/60 hover:text-white transition-colors cursor-pointer text-lg"
          >
            ✕
          </button>
        </div>

        {/* Image */}
        <img
          src={thumbnailSrc}
          alt={screenshot.displayName || screenshot.filename}
          className="max-w-[85vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />

        {/* Navigation arrows */}
        <div className="flex items-center gap-4 mt-4">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="px-4 py-2 rounded bg-white/10 text-white/80 hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-mono text-sm"
          >
            ← Prev
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="px-4 py-2 rounded bg-white/10 text-white/80 hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed font-mono text-sm"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
