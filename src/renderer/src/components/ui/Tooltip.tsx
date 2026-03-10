import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={cn(
            'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-md',
            'bg-bg-primary border border-border shadow-lg text-xs text-text-secondary',
            'whitespace-nowrap pointer-events-none',
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
