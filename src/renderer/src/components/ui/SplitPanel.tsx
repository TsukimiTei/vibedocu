import { type ReactNode, useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface SplitPanelProps {
  left: ReactNode
  right: ReactNode
  defaultRatio?: number
  minLeft?: number
  minRight?: number
  className?: string
}

export function SplitPanel({
  left,
  right,
  defaultRatio = 0.35,
  minLeft = 280,
  minRight = 400,
  className
}: SplitPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(defaultRatio)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    function handleMouseMove(e: MouseEvent) {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const totalWidth = rect.width
      let newRatio = x / totalWidth

      const minLeftRatio = minLeft / totalWidth
      const maxLeftRatio = 1 - minRight / totalWidth
      newRatio = Math.max(minLeftRatio, Math.min(maxLeftRatio, newRatio))

      setRatio(newRatio)
    }

    function handleMouseUp() {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, minLeft, minRight])

  return (
    <div ref={containerRef} className={cn('flex h-full w-full', className)}>
      <div style={{ width: `${ratio * 100}%` }} className="h-full overflow-hidden">
        {left}
      </div>
      <div
        className={cn(
          'w-[3px] cursor-col-resize flex-shrink-0 bg-border hover:bg-accent-blue/50 transition-colors',
          isDragging && 'bg-accent-blue/50'
        )}
        onMouseDown={handleMouseDown}
      />
      <div style={{ width: `${(1 - ratio) * 100}%` }} className="h-full overflow-hidden">
        {right}
      </div>
      {isDragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  )
}
