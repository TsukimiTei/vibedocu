import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject } from 'ai'
import { z } from 'zod'
import { useScreenshotStore } from '@/stores/screenshot-store'
import { useSettingsStore } from '@/stores/settings-store'
import { readScreenshotBase64 } from '@/services/file-bridge'
import { toast } from '@/components/ui/Toast'
import type { ScreenshotAnalysis } from '@/types/screenshot'

const BATCH_DELAY_MS = 5000 // Wait 5s after last upload before batching
const MAX_BATCH_SIZE = 10
const MAX_CONCURRENT_BATCHES = 3

const screenshotAnalysisSchema = z.object({
  screenshots: z.array(z.object({
    filename: z.string(),
    name: z.string(),
    features: z.array(z.string()),
    uiElements: z.array(z.string()),
    navigation: z.record(z.string(), z.string()),
    summary: z.string()
  }))
})

const SCREENSHOT_ANALYSIS_SYSTEM = `你是一个 UI/UX 分析专家。分析用户上传的应用截图，识别每个界面的功能和元素。

对每张截图，你需要生成：
1. name: 界面名称（如 Homepage、Settings Page、Onboarding Step 1）
2. features: 该界面包含的功能列表（如["搜索功能", "用户头像", "导航栏"]）
3. uiElements: UI 元素清单（如["顶部导航栏", "搜索框", "内容卡片列表", "底部 Tab 栏"]）
4. navigation: 页面跳转关系，key 是触发元素，value 是目标（如{"设置按钮": "Settings Page", "首页 Tab": "Homepage"}）
5. summary: 一句话描述这个界面

返回严格 JSON 格式。只返回 JSON 对象，不要其他文字。`

let batchTimer: ReturnType<typeof setTimeout> | null = null
let pendingIds: number[] = []

/**
 * Queue screenshot IDs for batch analysis.
 * Waits BATCH_DELAY_MS after last call before triggering analysis.
 */
export function queueForAnalysis(docPath: string, screenshotIds: number[]): void {
  pendingIds.push(...screenshotIds)

  if (batchTimer) clearTimeout(batchTimer)
  batchTimer = setTimeout(() => {
    const ids = [...pendingIds]
    pendingIds = []
    batchTimer = null
    runBatchAnalysis(docPath, ids)
  }, BATCH_DELAY_MS)
}

/**
 * Run batch analysis: split into batches of MAX_BATCH_SIZE, run MAX_CONCURRENT_BATCHES concurrently.
 */
async function runBatchAnalysis(docPath: string, ids: number[]): Promise<void> {
  const store = useScreenshotStore.getState()

  // Split into batches
  const batches: number[][] = []
  for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
    batches.push(ids.slice(i, i + MAX_BATCH_SIZE))
  }

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const chunk = batches.slice(i, i + MAX_CONCURRENT_BATCHES)
    await Promise.all(chunk.map((batch) => analyzeBatch(docPath, batch)))
  }

  // Save manifest after all analyses complete
  await store.saveManifest(docPath)
}

/**
 * Analyze a batch of screenshots via OpenRouter multimodal API.
 */
async function analyzeBatch(docPath: string, ids: number[]): Promise<void> {
  const store = useScreenshotStore.getState()
  const { apiKey, screenshotModel } = useSettingsStore.getState()

  if (!apiKey) {
    // MCP mode can't send images — warn user and use text-only fallback
    toast('MCP 模式无法发送图片，分析结果基于文件名推测。建议配置 API Key 获取精准分析。', 'info')
    await analyzeBatchMcp(docPath, ids)
    return
  }

  const model = screenshotModel || useSettingsStore.getState().model

  // Mark all as analyzing
  for (const id of ids) {
    store.setScreenshotStatus(id, 'analyzing')
  }

  try {
    const openrouter = createOpenRouter({ apiKey })

    // Build multimodal content
    const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = []
    const filenameMap: Record<string, number> = {} // filename -> screenshot id

    content.push({ type: 'text', text: `分析以下 ${ids.length} 张截图：\n` })

    for (const id of ids) {
      const screenshot = store.manifest.screenshots.find((s) => s.id === id)
      if (!screenshot) continue

      const imgData = await readScreenshotBase64(docPath, screenshot.filename)
      if (!imgData) {
        store.setScreenshotStatus(id, 'failed')
        continue
      }

      filenameMap[screenshot.filename] = id
      content.push({ type: 'text', text: `\n--- #${id} (${screenshot.filename}) ---\n` })
      content.push({
        type: 'image',
        image: `data:${imgData.mimeType};base64,${imgData.base64}`
      })
    }

    content.push({ type: 'text', text: '\n\n返回 JSON 格式分析结果。' })

    const { object } = await generateObject({
      model: openrouter(model),
      schema: screenshotAnalysisSchema,
      system: SCREENSHOT_ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content }],
      temperature: 0.3,
      maxTokens: 4000
    })

    // Apply results
    for (const result of object.screenshots) {
      const id = filenameMap[result.filename]
      if (id != null) {
        const analysis: ScreenshotAnalysis = {
          name: result.name,
          features: result.features,
          uiElements: result.uiElements,
          navigation: result.navigation,
          summary: result.summary
        }
        useScreenshotStore.getState().updateScreenshotAnalysis(id, analysis)
      }
    }
  } catch (err) {
    console.error('[screenshot-analysis] batch failed:', err)
    for (const id of ids) {
      useScreenshotStore.getState().setScreenshotStatus(id, 'failed')
    }
  }
}

/**
 * Analyze via Claude Code MCP (fallback when no API key).
 */
async function analyzeBatchMcp(docPath: string, ids: number[]): Promise<void> {
  const store = useScreenshotStore.getState()

  for (const id of ids) {
    store.setScreenshotStatus(id, 'analyzing')
  }

  try {
    // Build a text-only prompt describing what we need
    const screenshots = ids
      .map((id) => store.manifest.screenshots.find((s) => s.id === id))
      .filter(Boolean) as typeof store.manifest.screenshots

    const prompt = `${SCREENSHOT_ANALYSIS_SYSTEM}\n\n我有 ${screenshots.length} 张截图需要分析，文件名分别是：${screenshots.map((s) => `#${s.id} (${s.filename})`).join(', ')}。

由于当前通过文本模式，请根据文件名和常见 UI 模式进行合理推测。返回 JSON：
{"screenshots": [{"filename": "xxx.png", "name": "推测名称", "features": [], "uiElements": [], "navigation": {}, "summary": "推测描述"}]}`

    const res = await window.api.mcp.ask(prompt)
    if (!res.success || !res.text) {
      throw new Error(res.error || '分析失败')
    }

    let text = res.text.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('无法解析回复')

    const parsed = JSON.parse(text.slice(start, end + 1))
    const filenameMap = new Map(screenshots.map((s) => [s.filename, s.id]))

    for (const result of (parsed.screenshots || [])) {
      const id = filenameMap.get(result.filename)
      if (id != null) {
        useScreenshotStore.getState().updateScreenshotAnalysis(id, {
          name: result.name || '',
          features: result.features || [],
          uiElements: result.uiElements || [],
          navigation: result.navigation || {},
          summary: result.summary || ''
        })
      }
    }
  } catch (err) {
    console.error('[screenshot-analysis-mcp] failed:', err)
    for (const id of ids) {
      useScreenshotStore.getState().setScreenshotStatus(id, 'failed')
    }
  }
}

/**
 * Retry analysis for a single screenshot.
 */
export function retryAnalysis(docPath: string, screenshotId: number): void {
  queueForAnalysis(docPath, [screenshotId])
}

/**
 * Parse #references from text content.
 * Returns array of { ref: "#1", id: 1 } or { ref: "#setting", name: "setting" }
 *
 * Rules to avoid false positives with markdown:
 * - #\d+ (e.g. #1, #23) always matches — these are unambiguous screenshot refs
 * - #word (e.g. #setting) only matches when NOT at the start of a line
 *   (to avoid matching markdown headings like "# Feature" or "## Title")
 */
export function parseImageRefs(text: string): Array<{ raw: string; id?: number; name?: string }> {
  const refs: Array<{ raw: string; id?: number; name?: string }> = []

  // Pass 1: numeric refs (#1, #23) — always safe, never a markdown heading
  const numericRegex = /#(\d+)(?!\d)/g
  let match
  while ((match = numericRegex.exec(text)) !== null) {
    refs.push({ raw: match[0], id: parseInt(match[1], 10) })
  }

  // Pass 2: name refs (#setting, #homepage) — only if NOT at line start (avoids headings)
  // Also skip if preceded by another # (e.g. ## heading)
  const nameRegex = /(?<=\S.*)#([a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff-]*)/g
  while ((match = nameRegex.exec(text)) !== null) {
    refs.push({ raw: match[0], name: match[1] })
  }

  return refs
}

/**
 * Update #references in text content after reorder.
 * Returns updated text.
 */
export function updateRefsInText(
  text: string,
  mapping: Record<number, number>
): string {
  // Replace #N with new numbers based on mapping
  // Use a two-pass approach to avoid conflicts (e.g., #1→#2 and #2→#1)
  const placeholder = '\x00REF_'
  let result = text

  // First pass: replace all old refs with placeholders
  for (const [oldId] of Object.entries(mapping)) {
    const regex = new RegExp(`#${oldId}(?!\\d)`, 'g')
    result = result.replace(regex, `${placeholder}${oldId}\x00`)
  }

  // Second pass: replace placeholders with new refs
  for (const [oldId, newId] of Object.entries(mapping)) {
    result = result.replaceAll(`${placeholder}${oldId}\x00`, `#${newId}`)
  }

  return result
}

/**
 * Find all text locations that reference a given screenshot ID.
 */
export function findRefsToId(text: string, id: number): Array<{ line: number; text: string }> {
  const lines = text.split('\n')
  const results: Array<{ line: number; text: string }> = []
  const regex = new RegExp(`#${id}(?!\\d)`)
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      results.push({ line: i + 1, text: lines[i].trim() })
    }
  }
  return results
}
