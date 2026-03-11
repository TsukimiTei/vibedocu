import { create } from 'zustand'
import type { Question, CompletenessScore, AgentSession } from '@/types/agent'
import { generateId } from '@/lib/utils'

interface AgentStore {
  sessions: AgentSession[]
  currentQuestions: Question[]
  completeness: CompletenessScore | null
  isLoading: boolean
  error: string | null

  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  addSession: (questions: Omit<Question, 'id' | 'answered'>[], completeness: CompletenessScore, pageIndex: number) => void
  markAnswered: (questionId: string, answer: string) => void
  switchToPage: (pageIndex: number) => void
  clearCurrent: () => void
  loadFromFile: (docPath: string) => Promise<void>
  reset: () => void
}

/** Debounced save of sessions to disk */
let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(sessions: AgentSession[]) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const docPath = (window as any).__vibedocu_docPath as string | undefined
    if (docPath) {
      const data = JSON.stringify(sessions)
      window.api.agent.write(docPath, data).catch(() => {})
    }
  }, 500)
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  sessions: [],
  currentQuestions: [],
  completeness: null,
  isLoading: false,
  error: null,

  setLoading: (loading) => set({ isLoading: loading, error: null }),
  setError: (error) => set({ error, isLoading: false }),

  addSession: (rawQuestions, completeness, pageIndex) => {
    const questions: Question[] = rawQuestions.map((q) => ({
      ...q,
      id: generateId(),
      answered: false
    }))
    const session: AgentSession = {
      id: generateId(),
      timestamp: Date.now(),
      questions,
      completeness,
      pageIndex
    }
    set((state) => {
      const newSessions = [...state.sessions, session]
      scheduleSave(newSessions)
      return {
        sessions: newSessions,
        currentQuestions: questions,
        completeness,
        isLoading: false,
        error: null
      }
    })
  },

  markAnswered: (questionId, answer) =>
    set((state) => {
      const updatedQuestions = state.currentQuestions.map((q) =>
        q.id === questionId ? { ...q, answered: true, answer } : q
      )
      const updatedSessions = state.sessions.map((session) => ({
        ...session,
        questions: session.questions.map((q) =>
          q.id === questionId ? { ...q, answered: true, answer } : q
        )
      }))
      scheduleSave(updatedSessions)
      return { currentQuestions: updatedQuestions, sessions: updatedSessions }
    }),

  switchToPage: (pageIndex) => {
    const { sessions } = get()
    if (pageIndex < 0) {
      const latest = sessions[sessions.length - 1]
      set({
        currentQuestions: latest?.questions || [],
        completeness: latest?.completeness || null,
        error: null
      })
      return
    }
    const pageSessions = sessions.filter((s) => s.pageIndex === pageIndex)
    const latest = pageSessions[pageSessions.length - 1]
    if (latest) {
      set({
        currentQuestions: latest.questions,
        completeness: latest.completeness,
        error: null
      })
    } else {
      set({ currentQuestions: [], completeness: null, error: null })
    }
  },

  clearCurrent: () => set({ currentQuestions: [], completeness: null }),

  loadFromFile: async (docPath: string) => {
    (window as any).__vibedocu_docPath = docPath
    try {
      const raw = await window.api.agent.read(docPath)
      if (!raw) return
      const sessions: AgentSession[] = JSON.parse(raw)
      if (!Array.isArray(sessions) || sessions.length === 0) return
      // Migrate old string[] options to QuestionOption[] format
      for (const session of sessions) {
        for (const q of session.questions) {
          if (q.options) {
            q.options = q.options.map((o: any) =>
              typeof o === 'string' ? { text: o } : o
            )
          }
        }
      }
      // Restore latest session as current view
      const latest = sessions[sessions.length - 1]
      set({
        sessions,
        currentQuestions: latest.questions,
        completeness: latest.completeness,
        error: null
      })
    } catch {
      // Corrupted file — ignore
    }
  },

  reset: () => {
    set({
      sessions: [],
      currentQuestions: [],
      completeness: null,
      isLoading: false,
      error: null
    })
  }
}))
