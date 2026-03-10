import { useEffect, useState, useCallback } from 'react'
import { create } from 'zustand'

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  action?: { label: string; onClick: () => void }
}

interface ToastStore {
  toasts: ToastItem[]
  add: (toast: Omit<ToastItem, 'id'>) => void
  remove: (id: number) => void
}

let nextId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export function toast(message: string, type: ToastItem['type'] = 'info', action?: ToastItem['action']) {
  useToastStore.getState().add({ message, type, action })
}

function ToastEntry({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setShow(true))
  }, [])

  const borderColor =
    item.type === 'success'
      ? 'border-accent-green/40'
      : item.type === 'error'
        ? 'border-red-500/40'
        : 'border-accent-blue/40'

  const iconColor =
    item.type === 'success'
      ? 'text-accent-green'
      : item.type === 'error'
        ? 'text-red-400'
        : 'text-accent-blue'

  const icon = item.type === 'success' ? '\u2713' : item.type === 'error' ? '!' : 'i'

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border ${borderColor} bg-bg-primary shadow-xl transition-all duration-200 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <span className={`${iconColor} text-xs font-bold font-mono w-4 text-center`}>{icon}</span>
      <span className="text-xs text-text-primary font-mono flex-1">{item.message}</span>
      {item.action && (
        <button
          onClick={() => {
            item.action!.onClick()
            onDismiss()
          }}
          className="text-[11px] text-accent-blue hover:text-accent-blue/80 font-mono cursor-pointer underline"
        >
          {item.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary text-xs cursor-pointer ml-1"
      >
        &times;
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[360px]">
      {toasts.map((t) => (
        <ToastEntry key={t.id} item={t} onDismiss={() => remove(t.id)} />
      ))}
    </div>
  )
}
