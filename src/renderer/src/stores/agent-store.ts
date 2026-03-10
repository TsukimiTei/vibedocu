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
  addSession: (questions: Omit<Question, 'id' | 'answered'>[], completeness: CompletenessScore) => void
  markAnswered: (questionId: string, answer: string) => void
  clearCurrent: () => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  sessions: [],
  currentQuestions: [],
  completeness: null,
  isLoading: false,
  error: null,

  setLoading: (loading) => set({ isLoading: loading, error: null }),
  setError: (error) => set({ error, isLoading: false }),

  addSession: (rawQuestions, completeness) => {
    const questions: Question[] = rawQuestions.map((q) => ({
      ...q,
      id: generateId(),
      answered: false
    }))
    const session: AgentSession = {
      id: generateId(),
      timestamp: Date.now(),
      questions,
      completeness
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
    set((state) => ({
      currentQuestions: state.currentQuestions.map((q) =>
        q.id === questionId ? { ...q, answered: true, answer } : q
      )
    })),

  clearCurrent: () => set({ currentQuestions: [], completeness: null })
}))
