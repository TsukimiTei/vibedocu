import { create } from 'zustand'
import type { PageStatus, PageStatusMap } from '@/types/page-status'

interface PageStatusStore {
  statuses: PageStatusMap
  setStatus: (pageName: string, status: PageStatus) => void
  getStatus: (pageName: string) => PageStatus
  loadFromFile: (docPath: string) => Promise<void>
  reset: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(statuses: PageStatusMap) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const docPath = (window as any).__vibedocu_docPath as string | undefined
    if (docPath && window.api?.pageStatus) {
      window.api.pageStatus.write(docPath, JSON.stringify(statuses)).catch(() => {})
    }
  }, 500)
}

export const usePageStatusStore = create<PageStatusStore>((set, get) => ({
  statuses: {},

  setStatus: (pageName, status) => {
    set((state) => {
      const newStatuses = {
        ...state.statuses,
        [pageName]: { status, updatedAt: Date.now() }
      }
      scheduleSave(newStatuses)
      return { statuses: newStatuses }
    })
  },

  getStatus: (pageName) => {
    return get().statuses[pageName]?.status || 'idle'
  },

  loadFromFile: async (docPath: string) => {
    try {
      if (!window.api?.pageStatus) return
      const raw = await window.api.pageStatus.read(docPath)
      if (!raw) return
      const statuses: PageStatusMap = JSON.parse(raw)
      set({ statuses })
    } catch {
      // corrupted — ignore
    }
  },

  reset: () => set({ statuses: {} })
}))
