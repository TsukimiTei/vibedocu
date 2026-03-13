import { create } from 'zustand'
import type { Question, CompletenessScore, AgentSession } from '@/types/agent'
import { generateId } from '@/lib/utils'

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
  { id: 'schema', label: '加载分析框架' },
  { id: 'read', label: '读取文档' },
  { id: 'scan', label: '扫描项目文件' },
  { id: 'readfiles', label: '读取项目文件' },
  { id: 'analyze', label: 'AI 分析中' },
  { id: 'save', label: '保存分析结果' }
]

const MCP_PIPELINE_RESUME: { id: string; label: string }[] = [
  { id: 'read', label: '读取最新文档' },
  { id: 'analyze', label: 'AI 分析中' },
  { id: 'save', label: '保存分析结果' }
]

// Map tool names to pipeline step ids
const TOOL_TO_STEP: Record<string, string> = {
  '加载分析框架': 'schema',
  '读取文档': 'read',
  '扫描项目文件': 'scan',
  '读取项目文件': 'readfiles',
  '保存分析结果': 'save'
}

interface AgentStore {
  sessions: AgentSession[]
  currentQuestions: Question[]
  completeness: CompletenessScore | null
  isLoading: boolean
  mcpSteps: McpStep[]
  mcpStartTime: number
  mcpStats: McpStats | null
  mcpActivity: string
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
  _loadRaw: (raw: string) => void
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
  mcpActivity: '',
  error: null,

  setLoading: (loading, resume) => set(loading
    ? {
        isLoading: true,
        error: null,
        mcpSteps: (resume ? MCP_PIPELINE_RESUME : MCP_PIPELINE_FULL).map((s, i) => ({
          ...s, status: (i === 0 ? 'running' : 'pending') as McpStep['status']
        })),
        mcpStartTime: Date.now(),
        mcpStats: { durationMs: 0, turns: 0, inputTokens: 0, outputTokens: 0 },
        mcpActivity: ''
      }
    : {
        isLoading: false,
        mcpSteps: [],
        mcpActivity: ''
      }
  ),
  pushMcpEvent: (raw) => {
    try {
      const evt = JSON.parse(raw)
      set((s) => {
        const steps = s.mcpSteps.map((st) => ({ ...st }))
        let stats = s.mcpStats

        // Helper: mark a step by id (never regress from done)
        const mark = (id: string, status: McpStep['status']) => {
          const idx = steps.findIndex((st) => st.id === id)
          if (idx >= 0 && !(steps[idx].status === 'done' && status !== 'done')) {
            steps[idx].status = status
          }
        }

        let activity = s.mcpActivity

        const DATA_STEP_IDS = ['schema', 'read', 'scan', 'readfiles']

        // Check if all data-gathering tools are done
        // Steps not in the current pipeline are treated as done (e.g. resume mode skips schema/scan)
        const stepDone = (id: string) => {
          const st = steps.find((s) => s.id === id)
          return !st || st.status === 'done'
        }
        const stepNotRunning = (id: string) => {
          const st = steps.find((s) => s.id === id)
          return !st || st.status !== 'running'
        }
        const dataGatheringDone = () =>
          stepDone('schema') && stepDone('read') && stepNotRunning('scan') && stepNotRunning('readfiles')

        // When analyze starts, mark skipped data steps as done so no pending dots above running
        const startAnalyze = () => {
          for (const id of DATA_STEP_IDS) {
            const st = steps.find((s) => s.id === id)
            if (st && st.status === 'pending') st.status = 'done'
          }
          mark('analyze', 'running')
        }

        if (evt.step === 'tool') {
          const stepId = TOOL_TO_STEP[evt.name]
          if (!stepId) return s

          if (evt.status === 'running') {
            mark(stepId, 'running')
            activity = evt.name
          } else if (evt.status === 'done') {
            mark(stepId, 'done')
            if (dataGatheringDone()) {
              startAnalyze()
            }
            activity = ''
            if (stepId === 'save') {
              mark('analyze', 'done')
            }
          }
        } else if (evt.step === 'tokens') {
          stats = {
            ...(stats || { durationMs: 0, turns: 0 }),
            inputTokens: evt.inputTokens || 0,
            outputTokens: evt.outputTokens || 0
          }
        } else if (evt.step === 'thinking') {
          activity = '思考中...'
          if (dataGatheringDone()) startAnalyze()
        } else if (evt.step === 'text') {
          // Show brief snippet of AI output
          const text = (evt.text || '').replace(/\n/g, ' ').trim()
          if (text) activity = text.length > 40 ? text.slice(0, 40) + '...' : text
        } else if (evt.step === 'result') {
          activity = ''
          for (const st of steps) { st.status = 'done' }
          stats = {
            durationMs: evt.durationMs || 0,
            turns: evt.turns || 0,
            inputTokens: evt.inputTokens || 0,
            outputTokens: evt.outputTokens || 0
          }
          // Result event is the definitive completion signal — stats are final
          return { mcpSteps: [], mcpStats: stats, mcpActivity: '', isLoading: false }
        }

        return { mcpSteps: steps, mcpStats: stats, mcpActivity: activity }
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
      window.api.agent.watch(docPath)
      // Clean up previous listener
      if ((window as any).__vibedocu_agentUnwatch) {
        (window as any).__vibedocu_agentUnwatch()
      }
      (window as any).__vibedocu_agentUnwatch = window.api.agent.onChanged((data: string) => {
        get()._loadRaw(data)
      })
    }
  },

  _loadRaw: (raw: string) => {
    try {
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
      // Corrupted data — ignore
    }
  },

  reset: () => {
    set({
      sessions: [],
      currentQuestions: [],
      completeness: null,
      isLoading: false,
      mcpSteps: [],
      mcpStats: null,
      mcpActivity: '',
      error: null
    })
  }
}))
