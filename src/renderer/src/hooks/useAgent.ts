import { useCallback } from 'react'
import { useAgentStore } from '@/stores/agent-store'
import { useDocumentStore } from '@/stores/document-store'
import { useSettingsStore } from '@/stores/settings-store'
import { analyzeDocument } from '@/services/openrouter-service'

export function useAgent() {
  const { content } = useDocumentStore()
  const { apiKey, model } = useSettingsStore()
  const { setLoading, setError, addSession, isLoading } = useAgentStore()

  const runAnalysis = useCallback(async () => {
    if (!apiKey) {
      setError('Please set your OpenRouter API key in settings')
      return
    }
    if (!content.trim()) {
      setError('Document is empty')
      return
    }

    setLoading(true)
    try {
      const response = await analyzeDocument(content, model, apiKey)
      addSession(response.questions, response.completeness)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze document'
      setError(message)
    }
  }, [apiKey, model, content, setLoading, setError, addSession])

  return { runAnalysis, isLoading }
}
