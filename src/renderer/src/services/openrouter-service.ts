import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import type { AgentResponse } from '@/types/agent'
import { buildAnalysisPrompt, buildFileSelectionPrompt } from './prompt-builder'
import type { ImageData } from './prompt-builder'

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

const fileSelectionSchema = z.object({
  files: z.array(z.string())
})

/**
 * Step 1: AI reads the user's document, then picks which project files to read.
 */
export async function selectRelevantFiles(
  markdown: string,
  fileManifest: string[],
  model: string,
  apiKey: string
): Promise<string[]> {
  const openrouter = createOpenRouter({ apiKey })
  const { system, user } = buildFileSelectionPrompt(markdown, fileManifest)

  try {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: fileSelectionSchema,
      system,
      prompt: user,
      temperature: 0.3,
      maxTokens: 1000
    })
    return object.files || []
  } catch {
    // Fallback: plain text parse
    try {
      const { text } = await generateText({
        model: openrouter(model),
        system,
        prompt: user,
        temperature: 0.3,
        maxTokens: 1000
      })
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return Array.isArray(parsed.files) ? parsed.files : []
      }
    } catch {
      // give up
    }
    return []
  }
}

/**
 * Build Vercel AI SDK messages array from multimodal content parts.
 */
function buildMessages(
  system: string,
  userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string; mimeType: string }
  >
) {
  return {
    system,
    messages: [
      {
        role: 'user' as const,
        content: userContent.map((part) => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text }
          }
          // Convert base64 to data URI for the AI SDK
          return {
            type: 'image' as const,
            image: `data:${part.mimeType};base64,${part.image}`
          }
        })
      }
    ]
  }
}

export async function analyzeDocument(
  markdown: string,
  model: string,
  apiKey: string,
  basePrdContext?: string | null,
  projectContext?: string | null,
  images?: ImageData[]
): Promise<AgentResponse> {
  const openrouter = createOpenRouter({ apiKey })
  const { system, userContent } = buildAnalysisPrompt(
    markdown,
    basePrdContext,
    projectContext,
    images
  )

  const hasImages = images && images.length > 0
  const { system: sys, messages } = buildMessages(system, userContent)

  // Try structured output first
  try {
    if (hasImages) {
      // Use messages format for multimodal content
      const { object } = await generateObject({
        model: openrouter(model),
        schema: agentResponseSchema,
        system: sys,
        messages,
        temperature: 0.7,
        maxTokens: 4000
      })
      return object as AgentResponse
    } else {
      // Text-only: use simple prompt format
      const plainText = userContent.map((p) => p.type === 'text' ? p.text : '').join('')
      const { object } = await generateObject({
        model: openrouter(model),
        schema: agentResponseSchema,
        system,
        prompt: plainText,
        temperature: 0.7,
        maxTokens: 4000
      })
      return object as AgentResponse
    }
  } catch {
    // Fallback: plain text + manual JSON parse
    if (hasImages) {
      const { text } = await generateText({
        model: openrouter(model),
        system: sys,
        messages,
        temperature: 0.7,
        maxTokens: 4000
      })
      return extractAndParseJSON(text)
    } else {
      const plainText = userContent.map((p) => p.type === 'text' ? p.text : '').join('')
      const { text } = await generateText({
        model: openrouter(model),
        system,
        prompt: plainText,
        temperature: 0.7,
        maxTokens: 4000
      })
      return extractAndParseJSON(text)
    }
  }
}
