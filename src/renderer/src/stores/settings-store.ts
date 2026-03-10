import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_MODEL } from '@/lib/constants'

interface SettingsStore {
  apiKey: string
  model: string
  recentFiles: string[]

  setApiKey: (key: string) => void
  setModel: (model: string) => void
  addRecentFile: (filePath: string) => void
  removeRecentFile: (filePath: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      apiKey: '',
      model: DEFAULT_MODEL,
      recentFiles: [],

      setApiKey: (key) => set({ apiKey: key }),
      setModel: (model) => set({ model }),
      addRecentFile: (filePath) =>
        set((state) => ({
          recentFiles: [filePath, ...state.recentFiles.filter((f) => f !== filePath)].slice(0, 10)
        })),
      removeRecentFile: (filePath) =>
        set((state) => ({
          recentFiles: state.recentFiles.filter((f) => f !== filePath)
        }))
    }),
    { name: 'vibedocu-settings' }
  )
)
