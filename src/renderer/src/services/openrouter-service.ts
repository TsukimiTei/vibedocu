import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import type { AgentResponse } from '@/types/agent'
import { buildAnalysisPrompt } from './prompt-builder'

const agentResponseSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(['open-ended', 'multiple-choice']),
      text: z.string(),
      category: z.string(),
      options: z.array(z.string()).optional().nullable()
    })
  ),
  completeness: z.object({
    overall: z.number(),
    breakdown: z.array(
      z.object({
        dimension: z.string(),
        score: z.number(),
        suggestion: z.string()
      })
    )
  })
})

function extractAndParseJSON(text: string): AgentResponse {
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1)
  }
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
  const parsed = JSON.parse(cleaned)
  if (!parsed.questions || !parsed.completeness) {
    throw new Error('Missing required fields')
  }
  // Normalize question types
  parsed.questions = parsed.questions.map((q: Record<string, unknown>) => ({
    ...q,
    type: q.options && Array.isArray(q.options) && q.options.length > 0
      ? 'multiple-choice' : 'open-ended'
  }))
  return parsed as AgentResponse
}

export async function analyzeDocument(
  markdown: string,
  model: string,
  apiKey: string,
  basePrdContext?: string | null
): Promise<AgentResponse> {
  const openrouter = createOpenRouter({ apiKey })
  const { system, user } = buildAnalysisPrompt(markdown, basePrdContext)

  // Try structured output first
  try {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: agentResponseSchema,
      system,
      prompt: user,
      temperature: 0.7,
      maxTokens: 4000
    })
    return object as AgentResponse
  } catch {
    // Fallback: plain text + manual JSON parse
    const { text } = await generateText({
      model: openrouter(model),
      system,
      prompt: user,
      temperature: 0.7,
      maxTokens: 4000
    })
    return extractAndParseJSON(text)
  }
}
