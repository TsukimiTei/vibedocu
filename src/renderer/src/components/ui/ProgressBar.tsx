import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  className?: string
}

function getColor(value: number): string {
  if (value < 30) return 'bg-accent-red'
  if (value < 60) return 'bg-accent-orange'
  if (value < 85) return 'bg-accent-blue'
  return 'bg-accent-green'
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className={cn('h-2 w-full rounded-full bg-bg-tertiary overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500 ease-out', getColor(clamped))}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
