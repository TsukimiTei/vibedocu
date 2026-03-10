import { useState, useEffect, useCallback } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { AgentPanel } from './components/AgentPanel'
import { EditorPanel } from './components/EditorPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { OnboardingDialog } from './components/OnboardingDialog'
import { SplitPanel } from './components/ui/SplitPanel'
import { useDocumentStore } from './stores/document-store'
import { useSettingsStore } from './stores/settings-store'
import { useFileOps } from './hooks/useFileOps'
import { useEditor } from './hooks/useEditor'
import { useAgent } from './hooks/useAgent'

export default function App() {
  const filePath = useDocumentStore((s) => s.filePath)
  const theme = useSettingsStore((s) => s.theme)
  const hasSeenOnboarding = useSettingsStore((s) => s.hasSeenOnboarding)
  const markOnboardingSeen = useSettingsStore((s) => s.markOnboardingSeen)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const { save, openExisting, createNew } = useFileOps()
  const { editorRef, insertAtCursor } = useEditor()
  const { runAnalysis } = useAgent()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const handleCreateNew = useCallback(async () => {
    const created = await createNew()
    if (created && !hasSeenOnboarding) {
      setOnboardingOpen(true)
    }
  }, [createNew, hasSeenOnboarding])

  const handleCloseOnboarding = useCallback(() => {
    setOnboardingOpen(false)
    markOnboardingSeen()
  }, [markOnboardingSeen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        openExisting()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        handleCreateNew()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openExisting, handleCreateNew])

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
            <WelcomeScreen onCreateNew={handleCreateNew} />
          </div>
        </div>
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <OnboardingDialog open={onboardingOpen} onClose={handleCloseOnboarding} />
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
      <OnboardingDialog open={onboardingOpen} onClose={handleCloseOnboarding} />
    </>
  )
}
