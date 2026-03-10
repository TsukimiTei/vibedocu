import { useCallback } from 'react'
import { useAgentStore } from '@/stores/agent-store'
import { useDocumentStore } from '@/stores/document-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useContextStore } from '@/stores/context-store'
import { analyzeDocument, selectRelevantFiles } from '@/services/openrouter-service'
import {
  scanProjectFiles,
  readContextFiles,
  readContextData,
  writeContextData,
  readImageFile
} from '@/services/file-bridge'
import { getPageContent, extractImages } from '@/lib/page-utils'
import { toast } from '@/components/ui/Toast'
import type { ImageData } from '@/services/prompt-builder'

function getProjectDir(filePath: string): string {
  const i = filePath.lastIndexOf('/')
  return i > 0 ? filePath.substring(0, i) : filePath
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
  const { apiKey, model } = useSettingsStore()
  const { setLoading, setError, addSession, isLoading } = useAgentStore()

  const runAnalysis = useCallback(async () => {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze document'
      setError(message)
    }
  }, [apiKey, model, setLoading, setError, addSession])

  const refreshContext = useCallback(async () => {
    const { filePath, content, activePageIndex } = useDocumentStore.getState()
    if (!filePath || !apiKey) return

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
  }, [apiKey, model])

  return { runAnalysis, refreshContext, isLoading }
}
