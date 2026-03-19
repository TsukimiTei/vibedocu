import { create } from 'zustand'
import type { Question, CompletenessScore, AgentSession } from '@/types/agent'
import { generateId } from '@/lib/utils'
import { useDocumentStore } from '@/stores/document-store'

export interface McpStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done'
}

export interface McpStats {
  durationMs: number
  turns: number
  inputTokens: number
  outputTokens: number
}

const MCP_PIPELINE_FULL: { id: string; label: string }[] = [
  { id: 'analyze', label: 'AI 分析中' }
]

const MCP_PIPELINE_RESUME: { id: string; label: string }[] = [
  { id: 'analyze', label: 'AI 分析中' }
]

interface AgentStore {
  sessions: AgentSession[]
  currentQuestions: Question[]
  completeness: CompletenessScore | null
  isLoading: boolean
  mcpSteps: McpStep[]
  mcpStartTime: number
  mcpStats: McpStats | null
  mcpActivity: string
  mcpSummary: string
  error: string | null

  setLoading: (loading: boolean, resume?: boolean) => void
  setError: (error: string | null) => void
  pushMcpEvent: (raw: string) => void
  addSession: (questions: Omit<Question, 'id' | 'answered'>[], completeness: CompletenessScore, pageIndex: number) => void
  markAnswered: (questionId: string, answer: string) => void
  updateAnswer: (questionId: string, answer: string) => void
  switchToPage: (pageIndex: number) => void
  clearCurrent: () => void
  loadFromFile: (docPath: string) => Promise<void>
  replaceSessions: (sessions: AgentSession[]) => void
  _loadRaw: (raw: string, finalStats?: McpStats) => void
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

/** Patch a single question across currentQuestions and all sessions */
function patchQuestion(
  state: Pick<AgentStore, 'currentQuestions' | 'sessions'>,
  questionId: string,
  patch: Partial<Question>
) {
  const updatedQuestions = state.currentQuestions.map((q) =>
    q.id === questionId ? { ...q, ...patch } : q
  )
  const updatedSessions = state.sessions.map((session) => {
    if (!session.questions.some((q) => q.id === questionId)) return session
    return {
      ...session,
      questions: session.questions.map((q) =>
        q.id === questionId ? { ...q, ...patch } : q
      )
    }
  })
  scheduleSave(updatedSessions)
  return { currentQuestions: updatedQuestions, sessions: updatedSessions }
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  sessions: [],
  currentQuestions: [],
  completeness: null,
  isLoading: false,
  mcpSteps: [],
  mcpStartTime: 0,
  mcpStats: null,
  mcpActivity: '',
  mcpSummary: '',
  error: null,

  setLoading: (loading, resume) => {
    if (!loading) {
      set({ isLoading: false, mcpSteps: [], mcpActivity: '', mcpSummary: '' })
      return
    }
    // Only initialize MCP pipeline state when in MCP mode
    const isMcp = typeof resume === 'boolean'
    set({
      isLoading: true,
      error: null,
      ...(isMcp ? {
        mcpSteps: (resume ? MCP_PIPELINE_RESUME : MCP_PIPELINE_FULL).map((s, i) => ({
          ...s, status: (i === 0 ? 'running' : 'pending') as McpStep['status']
        })),
        mcpStartTime: Date.now(),
        mcpStats: { durationMs: 0, turns: 0, inputTokens: 0, outputTokens: 0 },
        mcpActivity: '',
        mcpSummary: ''
      } : {
        mcpSteps: [],
        mcpActivity: '',
        mcpSummary: ''
      })
    })
  },
  pushMcpEvent: (raw) => {
    try {
      const evt = JSON.parse(raw)
      set((s) => {
        let activity = s.mcpActivity

        if (evt.step === 'delta') {
          const accumulated = s.mcpSummary + (evt.text || '')
          const sepIdx = accumulated.indexOf('---JSON---')
          const visibleSummary = sepIdx >= 0 ? accumulated.slice(0, sepIdx).trim() : accumulated
          return {
            mcpSummary: accumulated,
            mcpActivity: visibleSummary.length > 80 ? visibleSummary.slice(visibleSummary.length - 80) : visibleSummary
          }
        }

        if (evt.step === 'thinking') {
          activity = '思考中...'
        } else if (evt.step === 'text') {
          const text = (evt.text || '').replace(/\n/g, ' ').trim()
          if (text) activity = text.length > 40 ? text.slice(0, 40) + '...' : text
        } else if (evt.step === 'result') {
          return {
            mcpSteps: [],
            mcpStats: {
              durationMs: evt.durationMs || 0,
              turns: evt.turns || 0,
              inputTokens: evt.inputTokens || 0,
              outputTokens: evt.outputTokens || 0
            },
            mcpActivity: '',
            isLoading: false
          }
        }

        return { mcpSteps: s.mcpSteps, mcpStats: s.mcpStats, mcpActivity: activity }
      })
    } catch { /* ignore */ }
  },
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
    set((state) => patchQuestion(state, questionId, { answered: true, answer })),

  updateAnswer: (questionId, answer) =>
    set((state) => patchQuestion(state, questionId, { answer })),

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
      get()._loadRaw(raw)
    } catch {
      // Corrupted file — ignore
    }

    // Start watching for MCP changes
    if (window.api.agent.watch) {
      // Clean up previous listener BEFORE setting up new watcher
      if ((window as any).__vibedocu_agentUnwatch) {
        (window as any).__vibedocu_agentUnwatch()
        (window as any).__vibedocu_agentUnwatch = null
      }
      await window.api.agent.watch(docPath)
      ;(window as any).__vibedocu_agentUnwatch = window.api.agent.onChanged((data: string) => {
        get()._loadRaw(data)
      })
    }
  },

  _loadRaw: (raw: string, finalStats?: McpStats) => {
    try {
      const sessions: AgentSession[] = JSON.parse(raw)
      console.log('[agent-store:_loadRaw] sessions:', sessions.length, 'raw length:', raw.length, 'finalStats:', !!finalStats)
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

      // Preserve answered state from in-memory questions.
      // Disk data (from saveAnalysis) doesn't include answered/answer fields,
      // so _loadRaw from file watcher would revert user answers. Merge them back.
      const currentQs = get().currentQuestions
      const answeredMap = new Map<string, { answered: boolean; answer?: string }>()
      for (const q of currentQs) {
        if (q.answered) {
          answeredMap.set(q.id, { answered: true, answer: q.answer })
        }
      }
      if (answeredMap.size > 0) {
        for (const session of sessions) {
          for (const q of session.questions) {
            const mem = answeredMap.get(q.id)
            if (mem && !q.answered) {
              q.answered = mem.answered
              q.answer = mem.answer
            }
          }
        }
      }

      // Only update visible questions if the new data matches the current page
      const visiblePage = useDocumentStore.getState().activePageIndex
      const pageSessions = sessions.filter((s) => s.pageIndex === visiblePage)
      const latest = pageSessions[pageSessions.length - 1]
      console.log('[agent-store:_loadRaw] visiblePage:', visiblePage, 'pageSessions:', pageSessions.length, 'latest questions:', latest?.questions?.length)
      const update: Partial<AgentStore> = {
        sessions,
        error: null,
        ...(latest ? {
          currentQuestions: latest.questions,
          completeness: latest.completeness
        } : {}),
        // When finalStats is provided, atomically clear loading + set stats in the same render
        ...(finalStats ? {
          isLoading: false,
          mcpSteps: [],
          mcpStats: finalStats,
          mcpActivity: '',
          mcpSummary: ''
        } : {})
      }
      set(update)
    } catch {
      // Corrupted data — ignore
    }
  },

  replaceSessions: (newSessions) => {
    const { sessions } = get()
    // Find which page is currently active
    const latest = sessions[sessions.length - 1]
    const pageIndex = latest?.pageIndex ?? 0
    const pageSessions = newSessions.filter((s) => s.pageIndex === pageIndex)
    const latestForPage = pageSessions[pageSessions.length - 1]

    set({
      sessions: newSessions,
      currentQuestions: latestForPage?.questions ?? [],
      completeness: latestForPage?.completeness ?? null
    })
    scheduleSave(newSessions)
  },

  reset: () => {
    set({
      sessions: [],
      currentQuestions: [],
      completeness: null,
      isLoading: false,
      mcpSteps: [],
      mcpStartTime: 0,
      mcpStats: null,
      mcpActivity: '',
      mcpSummary: '',
      error: null
    })
  }
}))
