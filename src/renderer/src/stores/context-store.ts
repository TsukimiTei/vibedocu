import { create } from 'zustand'

export interface ContextFileInfo {
  relativePath: string
  size: number
}

interface ContextData {
  files: ContextFileInfo[]
  contextString: string
  lastScanned: number
}

interface ContextStore {
  files: ContextFileInfo[]
  isScanning: boolean
  hasContext: boolean
  lastScanned: number | null

  setFiles: (files: ContextFileInfo[]) => void
  setScanning: (scanning: boolean) => void
  reset: () => void
  loadFromFile: (docPath: string) => Promise<void>
}

export const useContextStore = create<ContextStore>((set) => ({
  files: [],
  isScanning: false,
  hasContext: false,
  lastScanned: null,

  setFiles: (files) => set({ files, hasContext: files.length > 0, lastScanned: Date.now() }),
  setScanning: (isScanning) => set({ isScanning }),
  reset: () => set({ files: [], isScanning: false, hasContext: false, lastScanned: null }),

  loadFromFile: async (docPath: string) => {
    try {
      if (!window.api?.context) return
      const raw = await window.api.context.readData(docPath)
      if (!raw) return
      const data: ContextData = JSON.parse(raw)
      if (data.files && Array.isArray(data.files)) {
        set({
          files: data.files,
          hasContext: data.files.length > 0,
          lastScanned: data.lastScanned || null
        })
      }
    } catch {
      // corrupted — ignore
    }
  }
}))
