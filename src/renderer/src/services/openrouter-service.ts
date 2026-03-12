import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import type { AgentResponse } from '@/types/agent'
import { buildAnalysisPrompt, buildFileSelectionPrompt, buildPartialAnalysisPrompt } from './prompt-builder'
import type { ImageData } from './prompt-builder'

const optionSchema = z.union([
  z.string().transform((s) => ({ text: s })),
  z.object({ text: z.string(), type: z.enum(['select-all']).optional() })
])

const agentResponseSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(['open-ended', 'multiple-choice']),
      text: z.string(),
      category: z.string(),
      options: z.array(optionSchema).optional().nullable()
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
  // Normalize question types and option format
  parsed.questions = parsed.questions.map((q: Record<string, unknown>) => ({
    ...q,
    type: q.options && Array.isArray(q.options) && q.options.length > 0
      ? 'multiple-choice' : 'open-ended',
    options: Array.isArray(q.options)
      ? q.options.map((o: unknown) => typeof o === 'string' ? { text: o } : o)
      : q.options
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

export interface OptionExplanation {
  optionText: string
  explanation: string
}

export interface ExplainOptionsResult {
  explanations: OptionExplanation[]
  summary: string
}

const explainResponseSchema = z.object({
  explanations: z.array(
    z.object({
      optionText: z.string(),
      explanation: z.string()
    })
  ),
  summary: z.string()
})

export async function explainOptions(
  questionText: string,
  options: string[],
  model: string,
  apiKey: string
): Promise<ExplainOptionsResult> {
  const openrouter = createOpenRouter({ apiKey })
  const system = `你是一个产品顾问，帮助不太懂技术的用户理解选项含义。请用简洁、口语化的中文解释。

对于每个选项，用 1-2 句话解释它的含义和适用场景。
最后给出一段总结，格式如「如果你想要 X，就选 A；如果你更在意 Y，就选 B」。

返回严格 JSON 格式：
{
  "explanations": [
    { "optionText": "选项原文", "explanation": "通俗解释" }
  ],
  "summary": "总结建议"
}

只返回 JSON 对象，不要其他文字。`

  const prompt = `问题：${questionText}\n\n选项：\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`

  try {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: explainResponseSchema,
      system,
      prompt,
      temperature: 0.5,
      maxTokens: 2000
    })
    return object as ExplainOptionsResult
  } catch {
    const { text } = await generateText({
      model: openrouter(model),
      system,
      prompt,
      temperature: 0.5,
      maxTokens: 2000
    })
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1)
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(cleaned) as ExplainOptionsResult
  }
}

export async function analyzeSelectedText(
  selectedText: string,
  fullPageContent: string,
  model: string,
  apiKey: string,
  customQuestion?: string,
  basePrdContext?: string | null
): Promise<AgentResponse> {
  const openrouter = createOpenRouter({ apiKey })
  const { system, userContent } = buildPartialAnalysisPrompt(
    selectedText,
    fullPageContent,
    customQuestion,
    basePrdContext
  )
  const plainText = userContent.map((p) => p.type === 'text' ? p.text : '').join('')

  try {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: agentResponseSchema,
      system,
      prompt: plainText,
      temperature: 0.7,
      maxTokens: 4000
    })
    return object as AgentResponse
  } catch {
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
