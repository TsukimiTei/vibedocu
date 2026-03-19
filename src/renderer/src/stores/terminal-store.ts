import { create } from 'zustand'

export interface TerminalSession {
  sessionId: string
  cwd: string
  prompt: string
  pageName: string
}

interface TerminalStore {
  sessions: Record<string, TerminalSession>  // keyed by pageName
  activeTab: 'ask' | 'terminal' | 'screenshots'

  createSession: (pageName: string, session: TerminalSession) => void
  getSession: (pageName: string) => TerminalSession | undefined
  removeSession: (pageName: string) => void
  hasSession: (pageName: string) => boolean
  switchToAsk: () => void
  switchToTerminal: () => void
  switchToScreenshots: () => void
  reset: () => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: {},
  activeTab: 'ask',

  createSession: (pageName, session) => {
    set((state) => ({
      sessions: { ...state.sessions, [pageName]: session },
      activeTab: 'terminal'
    }))
  },

  getSession: (pageName) => get().sessions[pageName],

  hasSession: (pageName) => !!get().sessions[pageName],

  removeSession: (pageName) => {
    const session = get().sessions[pageName]
    if (session) {
      // Destroy the PTY process
      window.api.pty.destroy(session.sessionId).catch(() => {})
    }
    set((state) => {
      const { [pageName]: _, ...rest } = state.sessions
      return { sessions: rest }
    })
  },

  switchToAsk: () => set({ activeTab: 'ask' }),
  switchToTerminal: () => set({ activeTab: 'terminal' }),
  switchToScreenshots: () => set({ activeTab: 'screenshots' }),
  reset: () => {
    // Destroy all PTY sessions
    const sessions = get().sessions
    Object.values(sessions).forEach((s) => {
      window.api.pty.destroy(s.sessionId).catch(() => {})
    })
    set({ sessions: {}, activeTab: 'ask' })
  }
}))
