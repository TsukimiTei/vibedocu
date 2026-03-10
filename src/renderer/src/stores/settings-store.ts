import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_MODEL } from '@/lib/constants'
import type { ThemeId } from '@/types/settings'

interface SettingsStore {
  apiKey: string
  model: string
  theme: ThemeId
  hasSeenOnboarding: boolean
  recentFiles: string[]

  setApiKey: (key: string) => void
  setModel: (model: string) => void
  setTheme: (theme: ThemeId) => void
  markOnboardingSeen: () => void
  addRecentFile: (filePath: string) => void
  removeRecentFile: (filePath: string) => void
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', theme)
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      apiKey: '',
      model: DEFAULT_MODEL,
      theme: 'dark' as ThemeId,
      hasSeenOnboarding: false,
      recentFiles: [],

      setApiKey: (key) => set({ apiKey: key }),
      setModel: (model) => set({ model }),
      markOnboardingSeen: () => set({ hasSeenOnboarding: true }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      addRecentFile: (filePath) =>
        set((state) => ({
          recentFiles: [filePath, ...state.recentFiles.filter((f) => f !== filePath)].slice(0, 10)
        })),
      removeRecentFile: (filePath) =>
        set((state) => ({
          recentFiles: state.recentFiles.filter((f) => f !== filePath)
        }))
    }),
    {
      name: 'vibedocu-settings',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme)
      }
    }
  )
)
