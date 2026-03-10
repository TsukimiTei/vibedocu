import { useCallback } from 'react'
import { useAgentStore } from '@/stores/agent-store'
import { useDocumentStore } from '@/stores/document-store'
import { useSettingsStore } from '@/stores/settings-store'
import { analyzeDocument } from '@/services/openrouter-service'
import { getPageContent } from '@/lib/page-utils'

export function useAgent() {
  const { apiKey, model } = useSettingsStore()
  const { setLoading, setError, addSession, isLoading } = useAgentStore()

  const runAnalysis = useCallback(async () => {
    if (!apiKey) {
      setError('Please set your OpenRouter API key in settings')
      return
    }

    const { content, activePageIndex } = useDocumentStore.getState()
    const pageContent = getPageContent(content, activePageIndex)
    const basePrdContext = activePageIndex > 0 ? getPageContent(content, 0) : null

    if (!pageContent.trim()) {
      setError('当前页面内容为空')
      return
    }

    setLoading(true)
    try {
      const response = await analyzeDocument(pageContent, model, apiKey, basePrdContext)
      addSession(response.questions, response.completeness, activePageIndex)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze document'
      setError(message)
    }
  }, [apiKey, model, setLoading, setError, addSession])

  return { runAnalysis, isLoading }
}
