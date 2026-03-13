import { create } from 'zustand'
import type { StyleProfile, StylePrediction } from '@/types/smart-agent'

interface SmartAgentStore {
  predictions: Map<string, StylePrediction>
  isPredicting: boolean
  isAutoAnswering: boolean
  autoAnsweredIds: Set<string>
  styleProfile: StyleProfile | null
  isLearning: boolean

  setPredictions: (preds: StylePrediction[]) => void
  setIsPredicting: (v: boolean) => void
  setIsAutoAnswering: (v: boolean) => void
  addAutoAnswered: (questionId: string) => void
  removeAutoAnswered: (questionId: string) => void
  setStyleProfile: (profile: StyleProfile | null) => void
  setIsLearning: (v: boolean) => void
  reset: () => void
}

export const useSmartAgentStore = create<SmartAgentStore>((set) => ({
  predictions: new Map(),
  isPredicting: false,
  isAutoAnswering: false,
  autoAnsweredIds: new Set(),
  styleProfile: null,
  isLearning: false,

  setPredictions: (preds) =>
    set({
      predictions: new Map(preds.map((p) => [p.questionId, p]))
    }),

  setIsPredicting: (v) => set({ isPredicting: v }),
  setIsAutoAnswering: (v) => set({ isAutoAnswering: v }),

  addAutoAnswered: (questionId) =>
    set((state) => {
      const next = new Set(state.autoAnsweredIds)
      next.add(questionId)
      return { autoAnsweredIds: next }
    }),

  removeAutoAnswered: (questionId) =>
    set((state) => {
      const next = new Set(state.autoAnsweredIds)
      next.delete(questionId)
      return { autoAnsweredIds: next }
    }),

  setStyleProfile: (profile) => set({ styleProfile: profile }),
  setIsLearning: (v) => set({ isLearning: v }),

  reset: () =>
    set({
      predictions: new Map(),
      isPredicting: false,
      isAutoAnswering: false,
      autoAnsweredIds: new Set(),
      styleProfile: null,
      isLearning: false
    })
}))
