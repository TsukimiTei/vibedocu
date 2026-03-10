import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { AgentResponse } from '@/types/agent'
import { buildAnalysisPrompt } from './prompt-builder'

const agentResponseSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(['open-ended', 'multiple-choice']),
      text: z.string(),
      category: z.string(),
      options: z.array(z.string()).optional()
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

export async function analyzeDocument(
  markdown: string,
  model: string,
  apiKey: string
): Promise<AgentResponse> {
  const openrouter = createOpenRouter({ apiKey })
  const { system, user } = buildAnalysisPrompt(markdown)

  const { object } = await generateObject({
    model: openrouter(model),
    schema: agentResponseSchema,
    system,
    prompt: user,
    temperature: 0.7,
    maxTokens: 4000
  })

  return object as AgentResponse
}
