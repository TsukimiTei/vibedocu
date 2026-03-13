import { readAgentData, writeAgentData } from '../../main/file-service'
import { SYSTEM_PROMPT, COMPLETENESS_DIMENSIONS } from '../../renderer/src/lib/constants'
import type { AgentSession, CompletenessScore, Question } from '../../renderer/src/types/agent'

export function getAnalysisSchema() {
  return {
    systemPrompt: SYSTEM_PROMPT,
    dimensions: COMPLETENESS_DIMENSIONS,
    responseFormat: {
      questions: [
        {
          type: 'multiple-choice | open-ended',
          text: 'question text',
          options: [{ text: 'option text', type: 'select-all (optional)' }],
          category: 'one of the 8 dimensions'
        }
      ],
      completeness: {
        overall: 'number 0-100',
        breakdown: [
          { dimension: 'dimension name', score: 'number 0-100', suggestion: 'brief suggestion' }
        ]
      }
    }
  }
}

export async function saveAnalysis(
  filePath: string,
  pageIndex: number,
  analysis: {
    questions: Array<{
      type: 'open-ended' | 'multiple-choice'
      text: string
      category: string
      options?: Array<{ text: string; type?: 'select-all' }>
    }>
    completeness: CompletenessScore
  }
) {
  // Load existing sessions
  let sessions: AgentSession[] = []
  const raw = await readAgentData(filePath)
  if (raw) {
    try {
      sessions = JSON.parse(raw)
    } catch {
      sessions = []
    }
  }

  // Build new session
  const session: AgentSession = {
    id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    pageIndex,
    completeness: analysis.completeness,
    questions: analysis.questions.map((q, i) => ({
      id: `q-${Date.now()}-${i}`,
      type: q.type,
      text: q.text,
      category: q.category,
      options: q.options,
      answered: false
    } as Question))
  }

  sessions.push(session)
  await writeAgentData(filePath, JSON.stringify(sessions, null, 2))

  return {
    success: true,
    sessionId: session.id,
    totalSessions: sessions.length
  }
}
