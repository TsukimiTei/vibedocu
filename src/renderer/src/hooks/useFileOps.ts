import { useCallback } from 'react'
import { useDocumentStore } from '@/stores/document-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useAgentStore } from '@/stores/agent-store'
import * as fileBridge from '@/services/file-bridge'
import { NEW_DOC_TEMPLATE } from '@/lib/constants'

export function useFileOps() {
  const { filePath, content, setFilePath, setContent, markSaved, reset } = useDocumentStore()
  const { addRecentFile } = useSettingsStore()

  const openExisting = useCallback(async () => {
    const path = await fileBridge.openFile()
    if (!path) return false
    const fileContent = await fileBridge.readFile(path)
    setFilePath(path)
    setContent(fileContent)
    markSaved()
    addRecentFile(path)
    ;(window as any).__vibedocu_docPath = path
    useAgentStore.getState().loadFromFile(path)
    return true
  }, [setFilePath, setContent, markSaved, addRecentFile])

  const openRecent = useCallback(
    async (path: string) => {
      try {
        const fileContent = await fileBridge.readFile(path)
        setFilePath(path)
        setContent(fileContent)
        markSaved()
        addRecentFile(path)
        ;(window as any).__vibedocu_docPath = path
        useAgentStore.getState().loadFromFile(path)
      } catch {
        // File no longer exists, remove from recent list
        useSettingsStore.getState().removeRecentFile(path)
      }
    },
    [setFilePath, setContent, markSaved, addRecentFile]
  )

  const createNew = useCallback(async () => {
    const dir = await fileBridge.chooseDirectory()
    if (!dir) return false
    const path = `${dir}/requirements.md`
    await fileBridge.writeFile(path, NEW_DOC_TEMPLATE)
    setFilePath(path)
    setContent(NEW_DOC_TEMPLATE)
    markSaved()
    addRecentFile(path)
    useAgentStore.getState().reset()
    return true
  }, [setFilePath, setContent, markSaved, addRecentFile])

  const save = useCallback(async () => {
    if (!filePath) return
    await fileBridge.writeFile(filePath, content)
    markSaved()
  }, [filePath, content, markSaved])

  const closeDocument = useCallback(() => {
    reset()
    useAgentStore.getState().reset()
  }, [reset])

  return { openExisting, openRecent, createNew, save, closeDocument }
}
