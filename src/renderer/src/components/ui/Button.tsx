import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/30',
  secondary: 'bg-bg-tertiary text-text-secondary border-border hover:bg-bg-hover hover:text-text-primary',
  ghost: 'bg-transparent text-text-secondary border-transparent hover:bg-bg-hover hover:text-text-primary',
  danger: 'bg-accent-red/20 text-accent-red border-accent-red/30 hover:bg-accent-red/30'
}

const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-xs',
  lg: 'px-4 py-2 text-sm'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded border font-mono transition-colors duration-150 cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
