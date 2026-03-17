import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { DEFAULT_MODEL } from '@/lib/constants'
import type { ThemeId } from '@/types/settings'
import type { SmartAgentMode } from '@/types/smart-agent'

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
  aiMode: AiMode
  apiKey: string
  model: string
  theme: ThemeId
  hasSeenOnboarding: boolean
  recentFiles: string[]
  obsidianVaultPath: string
  projectDir: string
  pageOrderReversed: boolean
  docProjectDirs: Record<string, string>
  smartAgentMode: SmartAgentMode
  styleHistoryDir: string

  setAiMode: (mode: AiMode) => void
  setApiKey: (key: string) => void
  setModel: (model: string) => void
  setTheme: (theme: ThemeId) => void
  markOnboardingSeen: () => void
  addRecentFile: (filePath: string) => void
  removeRecentFile: (filePath: string) => void
  setObsidianVaultPath: (path: string) => void
  setProjectDir: (path: string) => void
  togglePageOrder: () => void
  updateRecentFile: (oldPath: string, newPath: string) => void
  bindProjectDir: (docPath: string, dir: string) => void
  setSmartAgentMode: (mode: SmartAgentMode) => void
  setStyleHistoryDir: (dir: string) => void
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', theme)
}

export type AiMode = 'openrouter' | 'mcp'

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      aiMode: 'openrouter' as AiMode,
      apiKey: '',
      model: DEFAULT_MODEL,
      theme: 'dark' as ThemeId,
      hasSeenOnboarding: false,
      recentFiles: [],
      obsidianVaultPath: '',
      projectDir: '',
      pageOrderReversed: true,
      docProjectDirs: {},
      smartAgentMode: 'off' as SmartAgentMode,
      styleHistoryDir: '',

      setAiMode: (mode) => set({ aiMode: mode }),
      setApiKey: (key) => set({ apiKey: key }),
      setModel: (model) => set({ model }),
      markOnboardingSeen: () => set({ hasSeenOnboarding: true }),
      setObsidianVaultPath: (path) => set({ obsidianVaultPath: path }),
      setProjectDir: (path) => set({ projectDir: path }),
      togglePageOrder: () => set((state) => ({ pageOrderReversed: !state.pageOrderReversed })),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      addRecentFile: (filePath) =>
        set((state) => ({
          recentFiles: [filePath, ...state.recentFiles.filter((f) => f !== filePath)].slice(0, 10)
        })),
      removeRecentFile: (filePath) =>
        set((state) => {
          const { [filePath]: _, ...remainingDirs } = state.docProjectDirs
          return {
            recentFiles: state.recentFiles.filter((f) => f !== filePath),
            docProjectDirs: remainingDirs
          }
        }),
      updateRecentFile: (oldPath, newPath) =>
        set((state) => {
          const updated: Record<string, string> = { ...state.docProjectDirs }
          if (updated[oldPath]) {
            updated[newPath] = updated[oldPath]
            delete updated[oldPath]
          }
          return {
            recentFiles: state.recentFiles.map((f) => (f === oldPath ? newPath : f)),
            docProjectDirs: updated
          }
        }),
      bindProjectDir: (docPath, dir) =>
        set((state) => ({
          docProjectDirs: { ...state.docProjectDirs, [docPath]: dir }
        })),
      setSmartAgentMode: (mode) => set({ smartAgentMode: mode }),
      setStyleHistoryDir: (dir) => set({ styleHistoryDir: dir })
    }),
    {
      name: 'vibedocu-settings',
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({
        aiMode: state.aiMode,
        apiKey: state.apiKey,
        model: state.model,
        theme: state.theme,
        hasSeenOnboarding: state.hasSeenOnboarding,
        recentFiles: state.recentFiles,
        obsidianVaultPath: state.obsidianVaultPath,
        pageOrderReversed: state.pageOrderReversed,
        docProjectDirs: state.docProjectDirs,
        smartAgentMode: state.smartAgentMode,
        styleHistoryDir: state.styleHistoryDir
        // projectDir intentionally excluded — per-window runtime state
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme)
      }
    }
  )
)
