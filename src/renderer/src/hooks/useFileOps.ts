import { useCallback } from 'react'
import { useDocumentStore } from '@/stores/document-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useAgentStore } from '@/stores/agent-store'
import { useContextStore } from '@/stores/context-store'
import { usePageStatusStore } from '@/stores/page-status-store'
import { useTerminalStore } from '@/stores/terminal-store'
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
    useTerminalStore.getState().reset()
    useAgentStore.getState().loadFromFile(path)
    useContextStore.getState().loadFromFile(path)
    usePageStatusStore.getState().loadFromFile(path)
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
        useTerminalStore.getState().reset()
        useAgentStore.getState().loadFromFile(path)
        useContextStore.getState().loadFromFile(path)
        usePageStatusStore.getState().loadFromFile(path)
      } catch {
        // File no longer exists, remove from recent list
        useSettingsStore.getState().removeRecentFile(path)
      }
    },
    [setFilePath, setContent, markSaved, addRecentFile]
  )

  const createNew = useCallback(async (fileName?: string) => {
    const dir = await fileBridge.chooseDirectory()
    if (!dir) return false
    const name = fileName || 'requirements'
    const path = `${dir}/${name}.md`
    await fileBridge.writeFile(path, NEW_DOC_TEMPLATE)
    setFilePath(path)
    setContent(NEW_DOC_TEMPLATE)
    markSaved()
    addRecentFile(path)
    useTerminalStore.getState().reset()
    useAgentStore.getState().reset()
    useContextStore.getState().reset()
    usePageStatusStore.getState().reset()
    return true
  }, [setFilePath, setContent, markSaved, addRecentFile])

  const save = useCallback(async () => {
    if (!filePath) return
    await fileBridge.writeFile(filePath, content)
    markSaved()
  }, [filePath, content, markSaved])

  const rename = useCallback(async (newName: string): Promise<{ oldFileName: string } | null> => {
    if (!filePath) return null

    const oldFileName = filePath.split('/').pop() || ''

    // Save current content before rename
    const currentContent = useDocumentStore.getState().content
    if (useDocumentStore.getState().isDirty) {
      await fileBridge.writeFile(filePath, currentContent)
    }

    const { newPath, content: updatedContent } = await fileBridge.renameDocument(filePath, newName)

    setFilePath(newPath)
    setContent(updatedContent)
    markSaved()

    // Update recent files & global doc path
    useSettingsStore.getState().updateRecentFile(filePath, newPath)
    ;(window as any).__vibedocu_docPath = newPath

    return { oldFileName }
  }, [filePath, setFilePath, setContent, markSaved])

  const closeDocument = useCallback(() => {
    reset()
    useTerminalStore.getState().reset()
    useAgentStore.getState().reset()
    useContextStore.getState().reset()
    usePageStatusStore.getState().reset()
  }, [reset])

  return { openExisting, openRecent, createNew, save, rename, closeDocument }
}
