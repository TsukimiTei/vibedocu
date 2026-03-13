import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { readStyleProfile, writeStyleProfile } from './file-bridge'
import type { StyleProfile, StyleQARecord, StylePrediction } from '@/types/smart-agent'

const MAX_RECORDS = 200
const COLD_START_THRESHOLD = 3

// Serialize concurrent appendQARecord calls to avoid read-modify-write races
let appendQueue: Promise<StyleProfile> = Promise.resolve(null as any)

function emptyProfile(): StyleProfile {
  return {
    styleSummary: '',
    typicalExamples: [],
    totalAnswered: 0,
    lastUpdated: Date.now(),
    allRecords: []
  }
}

export async function loadStyleProfile(dirPath: string): Promise<StyleProfile | null> {
  const raw = await readStyleProfile(dirPath)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StyleProfile
  } catch {
    return null
  }
}

async function saveProfile(dirPath: string, profile: StyleProfile): Promise<void> {
  await writeStyleProfile(dirPath, JSON.stringify(profile))
}

export function appendQARecord(
  dirPath: string,
  record: StyleQARecord
): Promise<StyleProfile> {
  appendQueue = appendQueue.then(() => doAppend(dirPath, record), () => doAppend(dirPath, record))
  return appendQueue
}

async function doAppend(dirPath: string, record: StyleQARecord): Promise<StyleProfile> {
  let profile = await loadStyleProfile(dirPath)
  if (!profile) profile = emptyProfile()

  profile.allRecords.push(record)
  if (profile.allRecords.length > MAX_RECORDS) {
    profile.allRecords = profile.allRecords.slice(-MAX_RECORDS)
  }
  profile.totalAnswered += 1
  // Keep typicalExamples as latest 5
  profile.typicalExamples = profile.allRecords.slice(-5)
  profile.lastUpdated = Date.now()

  await saveProfile(dirPath, profile)
  return profile
}

export function isStyleReady(profile: StyleProfile | null): boolean {
  return !!profile && profile.totalAnswered >= COLD_START_THRESHOLD
}

// --- Re-learn: regenerate style summary from all records ---

const relearnSchema = z.object({
  styleSummary: z.string(),
  typicalExampleIndices: z.array(z.number())
})

export async function relearnStyle(
  dirPath: string,
  apiKey: string,
  model: string
): Promise<StyleProfile> {
  let profile = await loadStyleProfile(dirPath)
  if (!profile) profile = emptyProfile()

  if (profile.allRecords.length === 0) return profile

  const openrouter = createOpenRouter({ apiKey })

  const system = `你是一个风格分析专家。根据用户的历史问答记录，分析用户的答题风格。

包括：
- 用户偏好的回答详细程度（简洁/详细）
- 用户在选择题中的偏好模式（倾向功能性/简洁性/全面性）
- 用户的关注重点（技术/产品/用户体验）
- 用户的表达风格（正式/口语化）

返回 JSON：
{
  "styleSummary": "2-3句话的风格总结",
  "typicalExampleIndices": [最具代表性的5条记录的索引号]
}

只返回 JSON，不要其他内容。`

  const records = profile.allRecords.map((r, i) => (
    `[${i}] Q(${r.questionType}): ${r.question}\n   A: ${r.answer}`
  )).join('\n\n')

  const prompt = `以下是用户的全部历史问答记录（共 ${profile.allRecords.length} 条）：\n\n${records}`

  try {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: relearnSchema,
      system,
      prompt,
      temperature: 0.5,
      maxTokens: 1500
    })

    profile.styleSummary = object.styleSummary
    const indices = object.typicalExampleIndices.filter(
      (i) => i >= 0 && i < profile!.allRecords.length
    )
    profile.typicalExamples = indices.length > 0
      ? indices.map((i) => profile!.allRecords[i])
      : profile.allRecords.slice(-5)
  } catch {
    // Fallback: text parse
    try {
      const { text } = await generateText({
        model: openrouter(model),
        system,
        prompt,
        temperature: 0.5,
        maxTokens: 1500
      })
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        profile.styleSummary = parsed.styleSummary || profile.styleSummary
        profile.typicalExamples = profile.allRecords.slice(-5)
      }
    } catch {
      // Keep existing
    }
  }

  profile.lastUpdated = Date.now()
  await saveProfile(dirPath, profile)
  return profile
}

// --- Predict answers for questions ---

const predictionSchema = z.object({
  predictions: z.array(
    z.object({
      questionIndex: z.number(),
      predictedAnswer: z.string(),
      predictedOptionIndex: z.number().optional().nullable(),
      confidence: z.number()
    })
  )
})

export async function predictAnswers(
  questions: Array<{ id: string; text: string; type: string; options?: Array<{ text: string }> }>,
  profile: StyleProfile,
  documentContext: string,
  apiKey: string,
  model: string
): Promise<StylePrediction[]> {
  const openrouter = createOpenRouter({ apiKey })

  const examples = profile.typicalExamples
    .map((e) => `Q(${e.questionType}): ${e.question}\nA: ${e.answer}`)
    .join('\n\n')

  const system = `你是一个用户风格模拟器。根据用户的答题风格档案，预测用户对新问题的回答。

用户风格：
${profile.styleSummary}

代表性问答示例：
${examples}

对每个问题：
- 如果是选择题（multiple-choice），返回用户最可能选择的选项索引（0开始）和理由
- 如果是开放性问题，以用户风格撰写一段简短回答
- 给出 0-1 的置信度

返回 JSON：
{
  "predictions": [
    {
      "questionIndex": 0,
      "predictedAnswer": "预测答案文本",
      "predictedOptionIndex": null,
      "confidence": 0.8
    }
  ]
}

只返回 JSON，不要其他内容。`

  const questionList = questions.map((q, i) => {
    let desc = `[${i}] (${q.type}) ${q.text}`
    if (q.options && q.options.length > 0) {
      desc += '\n   选项: ' + q.options.map((o, j) => `${j}. ${o.text}`).join(' | ')
    }
    return desc
  }).join('\n\n')

  const prompt = `当前文档概要（部分）：
${documentContext.slice(0, 2000)}

需要预测的问题：
${questionList}`

  try {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: predictionSchema,
      system,
      prompt,
      temperature: 0.5,
      maxTokens: 3000
    })

    return object.predictions.map((p) => ({
      questionId: questions[p.questionIndex]?.id || '',
      predictedAnswer: p.predictedAnswer,
      predictedOptionIndex: p.predictedOptionIndex ?? undefined,
      confidence: p.confidence
    })).filter((p) => p.questionId)
  } catch {
    // Fallback
    try {
      const { text } = await generateText({
        model: openrouter(model),
        system,
        prompt,
        temperature: 0.5,
        maxTokens: 3000
      })
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed.predictions)) {
          return parsed.predictions.map((p: any) => ({
            questionId: questions[p.questionIndex]?.id || '',
            predictedAnswer: p.predictedAnswer || '',
            predictedOptionIndex: p.predictedOptionIndex ?? undefined,
            confidence: p.confidence || 0.5
          })).filter((p: StylePrediction) => p.questionId)
        }
      }
    } catch {
      // give up
    }
    return []
  }
}
