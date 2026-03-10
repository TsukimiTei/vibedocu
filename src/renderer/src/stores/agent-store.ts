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
    set((state) => ({
      sessions: [...state.sessions, session],
      currentQuestions: questions,
      completeness,
      isLoading: false,
      error: null
    }))
  },

  markAnswered: (questionId, answer) =>
    set((state) => {
      const updatedQuestions = state.currentQuestions.map((q) =>
        q.id === questionId ? { ...q, answered: true, answer } : q
      )
      // Also update the question in its session so state persists across page switches
      const updatedSessions = state.sessions.map((session) => ({
        ...session,
        questions: session.questions.map((q) =>
          q.id === questionId ? { ...q, answered: true, answer } : q
        )
      }))
      return { currentQuestions: updatedQuestions, sessions: updatedSessions }
    }),

  switchToPage: (pageIndex) => {
    const { sessions } = get()
    if (pageIndex < 0) {
      // All Pages view — show all questions from latest session
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

  clearCurrent: () => set({ currentQuestions: [], completeness: null })
}))
