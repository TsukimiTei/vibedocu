import { useCallback, useEffect } from 'react'
import { useAgentStore } from '@/stores/agent-store'
import { useDocumentStore } from '@/stores/document-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useContextStore } from '@/stores/context-store'
import { useSmartAgentStore } from '@/stores/smart-agent-store'
import { analyzeDocument, analyzeSelectedText, selectRelevantFiles } from '@/services/openrouter-service'
import { SYSTEM_PROMPT } from '@/lib/constants'
import {
  scanProjectFiles,
  readContextFiles,
  readContextData,
  writeContextData,
  readImageFile
} from '@/services/file-bridge'
import { loadStyleProfile, isStyleReady, predictAnswers } from '@/services/style-service'
import { getPageContent, extractImages } from '@/lib/page-utils'
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

        const prompt = `你是 PRD 文档分析师。请分析以下文档并调用 vibedocs_save_analysis 保存结果。

## 分析框架
${SYSTEM_PROMPT}

## 当前页面内容（第 ${activePageIndex} 页）
${truncate(pageContent, MAX_PAGE_CHARS)}
${basePrdContext ? `\n## 基础 PRD 信息（第 0 页）\n${truncate(basePrdContext, MAX_PAGE_CHARS)}` : ''}
${projectContext ? `\n## 项目上下文\n${truncate(projectContext, MAX_PROJECT_CONTEXT_CHARS)}` : ''}
请根据分析框架对第 ${activePageIndex} 页进行 8 维度分析，生成最多 5 个问题和完成度评分。
直接调用 vibedocs_save_analysis(file_path="${filePath}", page_index=${activePageIndex}, analysis={...}) 保存结果。
不要调用其他工具，不要输出额外文字。`

        const unsubProgress = window.api.mcp.onProgress((chunk: string) => {
          pushMcpEvent(chunk)
        })
        try {
          const maxTurns = hasHistory ? 1 : 3
          const result = await window.api.mcp.analyze(prompt, filePath, { maxTurns })
          if (!result.success) {
            setError(result.error || 'Claude Code 分析失败')
          }
        } finally {
          // Delay unsubscribe so queued mcp:progress events (especially 'result') get processed
          setTimeout(() => unsubProgress(), 500)
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

      // Step 4: Full analysis with context and images
      const response = await analyzeDocument(
        pageContent,
        model,
        apiKey,
        basePrdContext,
        projectContext,
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
      const selectedPaths = await selectRelevantFiles(pageContent, manifestPaths, model, apiKey)

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

        const prompt = `你是 PRD 文档分析师。请分析以下选中文字并调用 vibedocs_save_analysis 保存结果。

## 分析框架
${SYSTEM_PROMPT}

## 选中内容
<user_selection>${selectedText}</user_selection>
${customQuestion ? `\n## 用户问题\n<user_question>${customQuestion}</user_question>` : ''}

## 所在页面上下文（第 ${activePageIndex} 页）
${truncate(pageContent, MAX_PAGE_CHARS)}
${basePrdContext ? `\n## 基础 PRD 信息（第 0 页）\n${truncate(basePrdContext, MAX_PAGE_CHARS)}` : ''}
${projectContext ? `\n## 项目上下文\n${truncate(projectContext, MAX_PROJECT_CONTEXT_CHARS)}` : ''}

以选中文字为焦点，根据分析框架进行分析，生成最多 5 个问题和完成度评分。
直接调用 vibedocs_save_analysis(file_path="${filePath}", page_index=${activePageIndex}, analysis={...}) 保存结果。
不要调用其他工具，不要输出额外文字。`

        const unsubPartialProgress = window.api.mcp.onProgress((chunk: string) => {
          pushMcpEvent(chunk)
        })
        try {
          const result = await window.api.mcp.analyze(prompt, filePath, { maxTurns: 1 })
          if (!result.success) {
            setError(result.error || 'Claude Code 分析失败')
          }
        } finally {
          setTimeout(() => unsubPartialProgress(), 500)
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
