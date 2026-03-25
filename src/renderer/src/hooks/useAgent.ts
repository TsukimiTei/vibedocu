import { useCallback, useEffect } from 'react'
import { useAgentStore } from '@/stores/agent-store'
import { useDocumentStore } from '@/stores/document-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useContextStore } from '@/stores/context-store'
import { useSmartAgentStore } from '@/stores/smart-agent-store'
import { analyzeDocument, analyzeSelectedText, selectRelevantFiles } from '@/services/openrouter-service'
import {
  scanProjectFiles,
  readContextFiles,
  readContextData,
  writeContextData,
  readImageFile
} from '@/services/file-bridge'
import { loadStyleProfile, isStyleReady, predictAnswers } from '@/services/style-service'
import { getPageContent, extractImages } from '@/lib/page-utils'
import { useScreenshotStore } from '@/stores/screenshot-store'
import { parseImageRefs } from '@/services/screenshot-service'
import { toast } from '@/components/ui/Toast'
import { buildQABlock } from '@/lib/qa-utils'
import type { ImageData } from '@/services/prompt-builder'

function getProjectDir(filePath: string): string {
  // Use the explicitly configured project directory from settings when available
  const settingsDir = useSettingsStore.getState().projectDir
  if (settingsDir) return settingsDir
  // Fall back to the document's parent directory
  const i = filePath.lastIndexOf('/')
  return i > 0 ? filePath.substring(0, i) : filePath
}

/** Truncate content to a maximum character count, appending a notice if truncated. */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n\n[...内容已截断，共 ${text.length} 字符，显示前 ${maxChars} 字符]`
}

const MAX_PAGE_CHARS = 15_000
const MAX_PROJECT_CONTEXT_CHARS = 30_000
const MAX_SCREENSHOT_CONTEXT_CHARS = 8_000

/**
 * Build screenshot context for analysis.
 * Returns global index + detailed analysis for referenced images.
 */
function buildScreenshotContext(pageContent: string): string | null {
  const store = useScreenshotStore.getState()
  const { manifest } = store
  if (manifest.screenshots.length === 0) return null

  const analyzingCount = manifest.screenshots.filter((s) => s.status === 'analyzing').length

  // Global index (compact, ~2K tokens for 50 images)
  let context = store.buildGlobalIndex()

  // Find #references in page content to include detailed analysis
  const refs = parseImageRefs(pageContent)
  const referencedIds = new Set<number>()
  for (const ref of refs) {
    if (ref.id != null) {
      referencedIds.add(ref.id)
    } else if (ref.name) {
      const match = store.getScreenshotByRef(`#${ref.name}`)
      if (match) referencedIds.add(match.id)
    }
  }

  if (referencedIds.size > 0) {
    context += '\n# Referenced Screenshot Details\n'
    context += store.buildDetailedContext(Array.from(referencedIds))
  }

  if (analyzingCount > 0) {
    context += `\n\n注意：有 ${analyzingCount} 张截图尚在分析中，建议分析完成后再次 Update 以获取完整上下文。`
  }

  // Truncate if too long
  if (context.length > MAX_SCREENSHOT_CONTEXT_CHARS) {
    context = context.slice(0, MAX_SCREENSHOT_CONTEXT_CHARS) + '\n[...截图上下文已截断]'
  }

  return context
}

/** Simple hash for context change detection */
async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

/**
 * Resolve a relative image src to an absolute path based on the document's directory.
 */
function resolveImagePath(docPath: string, imageSrc: string): string {
  const docDir = docPath.substring(0, docPath.lastIndexOf('/'))
  if (imageSrc.startsWith('/')) return imageSrc
  // Handle relative paths like ./docname/assets/image.png
  if (imageSrc.startsWith('./')) {
    return `${docDir}/${imageSrc.slice(2)}`
  }
  return `${docDir}/${imageSrc}`
}

/**
 * Extract and read all images from the page content.
 * Returns images in document order, ready for the AI API.
 */
async function loadPageImages(
  pageContent: string,
  docPath: string | null
): Promise<ImageData[]> {
  const extracted = extractImages(pageContent)
  if (extracted.length === 0) return []

  const imageDataList: ImageData[] = []

  for (const img of extracted) {
    if (img.isDataUri) {
      // Parse data URI: data:image/png;base64,xxxxx
      const match = img.src.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        imageDataList.push({
          index: img.index,
          base64: match[2],
          mimeType: match[1]
        })
      }
    } else if (docPath) {
      // File-based image — resolve path and read via IPC
      const absPath = resolveImagePath(docPath, img.src)
      const result = await readImageFile(absPath)
      if (result) {
        imageDataList.push({
          index: img.index,
          base64: result.base64,
          mimeType: result.mimeType
        })
      }
    }
  }

  return imageDataList
}

export function useAgent() {
  const { apiKey, model, aiMode } = useSettingsStore()
  const { setLoading, setError, addSession, pushMcpEvent, isLoading } = useAgentStore()

  // Pre-warm claude process when in MCP mode with current doc
  useEffect(() => {
    if (aiMode === 'mcp' && window.api.mcp.warmup) {
      const docPath = useDocumentStore.getState().filePath
      window.api.mcp.warmup(docPath || undefined).catch(() => {})
    }
  }, [aiMode])

  const runAnalysis = useCallback(async () => {
    if (aiMode === 'mcp') {
      const { content, activePageIndex, filePath } = useDocumentStore.getState()
      if (!filePath) {
        setError('请先保存文档')
        return
      }
      const pageContent = getPageContent(content, activePageIndex)
      if (!pageContent.trim()) {
        setError('当前页面内容为空')
        return
      }

      const hasHistory = useAgentStore.getState().sessions.some((s) => s.pageIndex === activePageIndex)
      setLoading(true, hasHistory)
      try {
        // Save before analyzing to ensure latest content is on disk
        if (useDocumentStore.getState().isDirty) {
          await window.api.file.write(filePath, content)
          useDocumentStore.getState().markSaved()
        }

        // Pre-fetch all context to include directly in the prompt
        // This avoids multiple tool call round-trips (6+ turns → 2-3 turns)
        const basePrdContext = activePageIndex > 0 ? getPageContent(content, 0) : null
        let projectContext: string | null = null
        if (filePath) {
          const savedData = await readContextData(filePath)
          if (savedData) {
            try {
              const parsed = JSON.parse(savedData)
              projectContext = parsed.contextString || null
            } catch { /* ignore */ }
          }
          // No cached context → quick scan + read relevant files
          if (!projectContext) {
            try {
              const projectDir = getProjectDir(filePath)
              const manifest = await scanProjectFiles(projectDir, filePath)
              if (manifest.length > 0) {
                const manifestPaths = manifest.map((f) => f.relativePath)
                const selectedPaths = apiKey
                  ? await selectRelevantFiles(pageContent, manifestPaths, model, apiKey)
                  : manifestPaths.slice(0, 10)
                const pathMap = new Map(manifest.map((f) => [f.relativePath, f.absolutePath]))
                const absolutePaths = selectedPaths.map((rel) => pathMap.get(rel)).filter((p): p is string => !!p)
                if (absolutePaths.length > 0) {
                  const fileContents = await readContextFiles(absolutePaths)
                  if (fileContents.length > 0) {
                    projectContext = `# Project Context\n\n${fileContents.length} relevant files from ${manifest.length} total.\n\n`
                    for (const file of fileContents) {
                      const rel = manifest.find((m) => m.absolutePath === file.path)?.relativePath || file.path
                      projectContext += `## ${rel}\n\`\`\`\n${file.content}\n\`\`\`\n\n`
                    }
                  }
                }
                // Cache for next time
                if (projectContext) {
                  const dataToSave = JSON.stringify({
                    files: manifest.map((f) => ({ relativePath: f.relativePath, size: f.size })),
                    contextString: projectContext,
                    lastScanned: Date.now()
                  })
                  await writeContextData(filePath, dataToSave)
                }
              }
            } catch (err) {
              console.error('[mcp] project scan failed:', err)
            }
          }
        }

        const screenshotContext = buildScreenshotContext(pageContent)

        // Compute context hash for session invalidation (includes screenshot context)
        const hashSource = [projectContext || '', screenshotContext || ''].join('\n')
        const contextHash = hashSource.trim() ? await computeHash(hashSource) : ''

        // Build full prompt (used for first analysis or resume fallback)
        const fullPrompt = `## 当前页面内容（第 ${activePageIndex} 页）
${truncate(pageContent, MAX_PAGE_CHARS)}
${basePrdContext ? `\n## 基础 PRD 信息（第 0 页）\n${truncate(basePrdContext, MAX_PAGE_CHARS)}` : ''}
${projectContext ? `\n## 项目上下文\n${truncate(projectContext, MAX_PROJECT_CONTEXT_CHARS)}` : ''}
${screenshotContext ? `\n## 截图上下文\n用户上传了产品截图，以下是截图的结构化分析摘要。当文档中出现 #编号 引用时，它指代对应的截图。请结合截图信息进行更精准的分析和提问。你也可以在问题和选项中使用 #编号 来引用截图。\n${screenshotContext}` : ''}
请根据分析框架对第 ${activePageIndex} 页进行 8 维度分析，生成最多 5 个问题和完成度评分。
按输出格式要求，先给出简短总结，再输出精简 JSON。`

        // Build incremental prompt (used when resuming a session)
        const resumePrompt = `用户更新了文档。以下是第 ${activePageIndex} 页的最新完整内容（替换之前的版本）：

${truncate(pageContent, MAX_PAGE_CHARS)}
${screenshotContext ? `\n## 截图上下文（最新）\n${screenshotContext}` : ''}
请重新进行 8 维度分析，生成最多 5 个问题和完成度评分。
按输出格式要求，先给出简短总结，再输出精简 JSON。`

        const handleAnalysisResult = (result: any) => {
          if (!result.success) {
            if (result.rawText) {
              setError(result.error || '分析结果解析失败')
              toast('分析完成但结果解析失败，请重试', 'error')
              console.error('[mcp] raw text from failed parse:', result.rawText.slice(0, 500))
            } else {
              setError(result.error || 'Claude Code 分析失败')
            }
          }
          // Atomically update questions + stats + isLoading in a single set() to avoid UI flash
          console.log('[mcp:handleResult] success:', result.success, 'hasAgentData:', !!result.agentData, 'agentDataLen:', result.agentData?.length)
          const stats = result.stats ? {
            durationMs: result.stats.durationMs || 0,
            turns: result.stats.turns || 0,
            inputTokens: result.stats.inputTokens || 0,
            outputTokens: result.stats.outputTokens || 0
          } : undefined
          if (result.agentData) {
            useAgentStore.getState()._loadRaw(result.agentData, stats)
          } else if (stats) {
            // No agent data but have stats — just clear loading
            useAgentStore.getState().pushMcpEvent(JSON.stringify({ step: 'result', ...stats }))
          }
        }

        const unsubProgress = window.api.mcp.onProgress((chunk: string) => {
          pushMcpEvent(chunk)
        })
        try {
          // Try resume if this page has been analyzed before
          if (hasHistory) {
            console.log('[mcp] attempting resume for page %d', activePageIndex)
            const result = await window.api.mcp.analyze(resumePrompt, filePath, {
              maxTurns: 1, pageIndex: activePageIndex, resume: true, contextHash
            })
            // Resume failed — fallback to full prompt
            if (!result.success && result.error?.includes('resume')) {
              console.warn('[mcp] resume failed, falling back to full prompt:', result.error)
              toast('会话恢复失败，使用完整分析', 'info')
              const fullResult = await window.api.mcp.analyze(fullPrompt, filePath, {
                maxTurns: 1, pageIndex: activePageIndex, resume: false, contextHash
              })
              handleAnalysisResult(fullResult)
            } else {
              handleAnalysisResult(result)
            }
          } else {
            // First analysis — full prompt, no resume
            const result = await window.api.mcp.analyze(fullPrompt, filePath, {
              maxTurns: 1, pageIndex: activePageIndex, resume: false, contextHash
            })
            handleAnalysisResult(result)
          }
        } finally {
          unsubProgress()
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'MCP 分析失败'
        setError(message)
      } finally {
        setTimeout(() => {
          if (useAgentStore.getState().isLoading) setLoading(false)
        }, 30_000)
      }
      return
    }

    if (!apiKey) {
      setError('Please set your OpenRouter API key in settings')
      return
    }

    const { content, activePageIndex, filePath } = useDocumentStore.getState()
    const pageContent = getPageContent(content, activePageIndex)
    const basePrdContext = activePageIndex > 0 ? getPageContent(content, 0) : null

    if (!pageContent.trim()) {
      setError('当前页面内容为空')
      return
    }

    setLoading(true)
    try {
      let projectContext: string | null = null

      if (filePath) {
        const projectDir = getProjectDir(filePath)

        // Try reading saved context first
        const savedData = await readContextData(filePath)
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData)
            projectContext = parsed.contextString || null
            // Also restore file list to UI
            if (parsed.files && !useContextStore.getState().hasContext) {
              useContextStore.getState().setFiles(parsed.files)
            }
          } catch {
            // corrupted, will re-scan
          }
        }

        // No saved context → two-step flow: scan → AI selects files → read → build context
        if (!projectContext) {
          useContextStore.getState().setScanning(true)
          toast('Agent 正在熟悉你的项目...', 'info')

          try {
            // Step 1: Scan all project files
            const manifest = await scanProjectFiles(projectDir, filePath)

            if (manifest.length > 0) {
              const manifestPaths = manifest.map((f) => f.relativePath)

              // Step 2: AI selects which files are relevant based on user's document
              const selectedPaths = await selectRelevantFiles(
                pageContent,
                manifestPaths,
                model,
                apiKey
              )

              // Map selected relative paths back to absolute paths
              const pathMap = new Map(manifest.map((f) => [f.relativePath, f.absolutePath]))
              const absolutePaths = selectedPaths
                .map((rel) => pathMap.get(rel))
                .filter((p): p is string => !!p)

              // Step 3: Read selected files
              if (absolutePaths.length > 0) {
                const fileContents = await readContextFiles(absolutePaths)

                // Build context string from selected files
                if (fileContents.length > 0) {
                  projectContext = `# Project Context\n\nAI selected ${fileContents.length} relevant files from ${manifest.length} total project files.\n\n`
                  for (const file of fileContents) {
                    // Find relative path for display
                    const rel =
                      manifest.find((m) => m.absolutePath === file.path)?.relativePath ||
                      file.path
                    projectContext += `## ${rel}\n\`\`\`\n${file.content}\n\`\`\`\n\n`
                  }
                }
              }

              // Update UI with scanned files (show all, mark selected)
              useContextStore.getState().setFiles(
                manifest.map((f) => ({
                  relativePath: f.relativePath,
                  size: f.size
                }))
              )

              // Save for future updates
              if (projectContext) {
                const dataToSave = JSON.stringify({
                  files: manifest.map((f) => ({
                    relativePath: f.relativePath,
                    size: f.size
                  })),
                  contextString: projectContext,
                  lastScanned: Date.now()
                })
                await writeContextData(filePath, dataToSave)
              }
            }
          } catch (err) {
            console.error('[context] scan/select failed:', err)
            // Continue without context — not blocking
          } finally {
            useContextStore.getState().setScanning(false)
          }
        }
      }

      // Extract and read images from the page content
      const images = await loadPageImages(pageContent, filePath)
      if (images.length > 0) {
        console.log(`[agent] Loaded ${images.length} image(s) from page`)
      }

      // Build screenshot context from manifest
      const screenshotContext = buildScreenshotContext(pageContent)
      const fullProjectContext = [projectContext, screenshotContext].filter(Boolean).join('\n\n')

      // Step 4: Full analysis with context and images
      const response = await analyzeDocument(
        pageContent,
        model,
        apiKey,
        basePrdContext,
        fullProjectContext || null,
        images.length > 0 ? images : undefined
      )
      addSession(response.questions, response.completeness, activePageIndex)

      // Smart Agent: trigger prediction if enabled
      const { smartAgentMode, styleHistoryDir } = useSettingsStore.getState()
      if (smartAgentMode !== 'off' && styleHistoryDir) {
        try {
          const profile = await loadStyleProfile(styleHistoryDir)
          useSmartAgentStore.getState().setStyleProfile(profile)

          if (isStyleReady(profile)) {
            const latestSession = useAgentStore.getState().sessions
            const latest = latestSession[latestSession.length - 1]
            if (latest) {
              useSmartAgentStore.getState().setIsPredicting(true)
              try {
                const preds = await predictAnswers(
                  latest.questions.map((q) => ({
                    id: q.id,
                    text: q.text,
                    type: q.type,
                    options: q.options?.map((o) => ({ text: typeof o === 'string' ? o : o.text }))
                  })),
                  profile!,
                  pageContent.slice(0, 3000),
                  apiKey,
                  model
                )
                useSmartAgentStore.getState().setPredictions(preds)
              } finally {
                useSmartAgentStore.getState().setIsPredicting(false)
              }
            }
          }
        } catch (err) {
          console.error('[smart-agent] prediction failed:', err)
          useSmartAgentStore.getState().setIsPredicting(false)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze document'
      setError(message)
    }
  }, [aiMode, apiKey, model, setLoading, setError, addSession])

  const refreshContext = useCallback(async () => {
    const { filePath, content, activePageIndex } = useDocumentStore.getState()
    if (!filePath) return
    if (aiMode !== 'mcp' && !apiKey) return

    const projectDir = getProjectDir(filePath)
    const pageContent = getPageContent(content, activePageIndex)

    useContextStore.getState().setScanning(true)
    toast('正在重新扫描项目目录...', 'info')

    try {
      const manifest = await scanProjectFiles(projectDir, filePath)

      if (manifest.length === 0) {
        useContextStore.getState().setFiles([])
        toast('未找到项目文件', 'info')
        return
      }

      const manifestPaths = manifest.map((f) => f.relativePath)
      const selectedPaths = apiKey
        ? await selectRelevantFiles(pageContent, manifestPaths, model, apiKey)
        : manifestPaths.slice(0, 10)

      const pathMap = new Map(manifest.map((f) => [f.relativePath, f.absolutePath]))
      const absolutePaths = selectedPaths
        .map((rel) => pathMap.get(rel))
        .filter((p): p is string => !!p)

      let contextString = ''
      if (absolutePaths.length > 0) {
        const fileContents = await readContextFiles(absolutePaths)
        if (fileContents.length > 0) {
          contextString = `# Project Context\n\nAI selected ${fileContents.length} relevant files from ${manifest.length} total project files.\n\n`
          for (const file of fileContents) {
            const rel =
              manifest.find((m) => m.absolutePath === file.path)?.relativePath || file.path
            contextString += `## ${rel}\n\`\`\`\n${file.content}\n\`\`\`\n\n`
          }
        }
      }

      const files = manifest.map((f) => ({ relativePath: f.relativePath, size: f.size }))
      useContextStore.getState().setFiles(files)

      const dataToSave = JSON.stringify({
        files,
        contextString,
        lastScanned: Date.now()
      })
      await writeContextData(filePath, dataToSave)

      toast(`已索引 ${manifest.length} 个文件，选取 ${absolutePaths.length} 个相关文件`, 'success')
    } catch (err) {
      console.error('[context] refresh failed:', err)
      toast('扫描失败', 'error')
    } finally {
      useContextStore.getState().setScanning(false)
    }
  }, [aiMode, apiKey, model])

  const runPartialAnalysis = useCallback(async (selectedText: string, customQuestion?: string) => {
    if (aiMode === 'mcp') {
      const { filePath, content, activePageIndex } = useDocumentStore.getState()
      if (!filePath) {
        setError('请先保存文档')
        return
      }

      setLoading(true)
      try {
        if (useDocumentStore.getState().isDirty) {
          await window.api.file.write(filePath, content)
          useDocumentStore.getState().markSaved()
        }

        const pageContent = getPageContent(content, activePageIndex)
        const basePrdContext = activePageIndex > 0 ? getPageContent(content, 0) : null
        let projectContext: string | null = null
        const savedData = await readContextData(filePath)
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData)
            projectContext = parsed.contextString || null
          } catch { /* ignore */ }
        }

        const partialScreenshotContext = buildScreenshotContext(pageContent)

        const prompt = `请分析以下选中文字。

## 选中内容
<user_selection>${selectedText}</user_selection>
${customQuestion ? `\n## 用户问题\n<user_question>${customQuestion}</user_question>` : ''}

## 所在页面上下文（第 ${activePageIndex} 页）
${truncate(pageContent, MAX_PAGE_CHARS)}
${basePrdContext ? `\n## 基础 PRD 信息（第 0 页）\n${truncate(basePrdContext, MAX_PAGE_CHARS)}` : ''}
${projectContext ? `\n## 项目上下文（仅供参考）\n${truncate(projectContext, MAX_PROJECT_CONTEXT_CHARS)}` : ''}
${partialScreenshotContext ? `\n## 截图上下文\n${partialScreenshotContext}` : ''}
以选中文字为焦点，根据分析框架进行 8 维度分析，生成最多 5 个问题和完成度评分。
按输出格式要求，先给出简短总结，再输出精简 JSON。`

        const unsubPartialProgress = window.api.mcp.onProgress((chunk: string) => {
          pushMcpEvent(chunk)
        })
        try {
          const result = await window.api.mcp.analyze(prompt, filePath, { maxTurns: 1, pageIndex: activePageIndex })
          if (!result.success) {
            if (result.rawText) {
              setError(result.error || '分析结果解析失败')
              toast('局部分析完成但结果解析失败，请重试', 'error')
              console.error('[mcp] partial raw text from failed parse:', result.rawText.slice(0, 500))
            } else {
              setError(result.error || 'Claude Code 分析失败')
            }
            if (result.stats) {
              useAgentStore.getState().pushMcpEvent(JSON.stringify({
                step: 'result',
                durationMs: result.stats.durationMs,
                turns: result.stats.turns,
                inputTokens: result.stats.inputTokens,
                outputTokens: result.stats.outputTokens
              }))
            }
          } else if (result.stats) {
            useAgentStore.getState().pushMcpEvent(JSON.stringify({
              step: 'result',
              durationMs: result.stats.durationMs,
              turns: result.stats.turns,
              inputTokens: result.stats.inputTokens,
              outputTokens: result.stats.outputTokens
            }))
          }
        } finally {
          unsubPartialProgress()
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'MCP 分析失败'
        setError(message)
      } finally {
        setTimeout(() => {
          if (useAgentStore.getState().isLoading) setLoading(false)
        }, 30_000)
      }
      return
    }

    if (!apiKey) {
      setError('Please set your OpenRouter API key in settings')
      return
    }

    const { content, activePageIndex } = useDocumentStore.getState()
    const pageContent = getPageContent(content, activePageIndex)
    const basePrdContext = activePageIndex > 0 ? getPageContent(content, 0) : null

    if (!selectedText.trim()) return

    setLoading(true)
    try {
      const response = await analyzeSelectedText(
        selectedText,
        pageContent,
        model,
        apiKey,
        customQuestion,
        basePrdContext
      )
      addSession(response.questions, response.completeness, activePageIndex)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze selected text'
      setError(message)
    }
  }, [aiMode, apiKey, model, setLoading, setError, addSession])

  const runAutoAnswer = useCallback(
    (onInsert: (text: string) => void) => {
      const { predictions } = useSmartAgentStore.getState()
      const { currentQuestions } = useAgentStore.getState()
      if (predictions.size === 0) return

      useSmartAgentStore.getState().setIsAutoAnswering(true)

      const parts: string[] = []
      for (const q of currentQuestions) {
        if (q.answered) continue
        const pred = predictions.get(q.id)
        if (!pred) continue

        let answerText = pred.predictedAnswer
        // For multiple-choice with predicted option index, use the option text
        if (
          q.type === 'multiple-choice' &&
          q.options &&
          pred.predictedOptionIndex != null &&
          pred.predictedOptionIndex >= 0 &&
          pred.predictedOptionIndex < q.options.length
        ) {
          const opt = q.options[pred.predictedOptionIndex]
          answerText = typeof opt === 'string' ? opt : opt.text
        }

        const block = buildQABlock(q.text, answerText)
        parts.push(block)
        useAgentStore.getState().markAnswered(q.id, block)
        useSmartAgentStore.getState().addAutoAnswered(q.id)
      }

      if (parts.length > 0) {
        onInsert(parts.join('\n'))
      }

      useSmartAgentStore.getState().setIsAutoAnswering(false)
    },
    []
  )

  return { runAnalysis, runPartialAnalysis, refreshContext, runAutoAnswer, isLoading }
}
