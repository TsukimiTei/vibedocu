import { useState, useEffect, useCallback } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { AgentPanel } from './components/AgentPanel'
import { EditorPanel } from './components/EditorPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { SplitPanel } from './components/ui/SplitPanel'
import { useDocumentStore } from './stores/document-store'
import { useFileOps } from './hooks/useFileOps'
import { useEditor } from './hooks/useEditor'
import { useAgent } from './hooks/useAgent'

export default function App() {
  const filePath = useDocumentStore((s) => s.filePath)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { save, openExisting, createNew } = useFileOps()
  const { editorRef, insertAtCursor } = useEditor()
  const { runAnalysis } = useAgent()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        openExisting()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        createNew()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openExisting, createNew])

  const handleInsert = useCallback(
    (text: string) => {
      insertAtCursor(text)
    },
    [insertAtCursor]
  )

  if (!filePath) {
    return (
      <>
        <div className="h-full flex flex-col">
          <div className="h-8 shrink-0 app-drag-region" />
          <div className="flex-1">
            <WelcomeScreen />
          </div>
        </div>
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </>
    )
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="h-8 shrink-0 app-drag-region" />
        <div className="flex-1 overflow-hidden">
          <SplitPanel
            left={
              <AgentPanel
                onInsert={handleInsert}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            }
            right={
              <EditorPanel
                editorRef={editorRef}
                onUpdate={runAnalysis}
                onSave={save}
              />
            }
          />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
