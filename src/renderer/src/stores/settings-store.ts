import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { DEFAULT_MODEL } from '@/lib/constants'
import type { ThemeId } from '@/types/settings'

// File-based storage via main process IPC — survives app crashes
const fileStorage: StateStorage = {
  getItem: async () => {
    return (await window.api.settings.read()) ?? null
  },
  setItem: async (_name, value) => {
    await window.api.settings.write(value)
  },
  removeItem: async () => {
    await window.api.settings.write('{}')
  }
}

interface SettingsStore {
  apiKey: string
  model: string
  theme: ThemeId
  hasSeenOnboarding: boolean
  recentFiles: string[]
  obsidianVaultPath: string

  setApiKey: (key: string) => void
  setModel: (model: string) => void
  setTheme: (theme: ThemeId) => void
  markOnboardingSeen: () => void
  addRecentFile: (filePath: string) => void
  removeRecentFile: (filePath: string) => void
  setObsidianVaultPath: (path: string) => void
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
      obsidianVaultPath: '',

      setApiKey: (key) => set({ apiKey: key }),
      setModel: (model) => set({ model }),
      markOnboardingSeen: () => set({ hasSeenOnboarding: true }),
      setObsidianVaultPath: (path) => set({ obsidianVaultPath: path }),
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
      storage: createJSONStorage(() => fileStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme)
      }
    }
  )
)
