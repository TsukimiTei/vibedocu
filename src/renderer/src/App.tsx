import { useState, useEffect, useCallback, useRef } from 'react'
import { WelcomeScreen } from './components/WelcomeScreen'
import { LeftPanel } from './components/LeftPanel'
import { EditorPanel } from './components/EditorPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { OnboardingDialog } from './components/OnboardingDialog'
import { SplitPanel } from './components/ui/SplitPanel'
import { ToastContainer } from './components/ui/Toast'
import { UpdateNotifier } from './components/UpdateNotifier'
import { useDocumentStore } from './stores/document-store'
import { useSettingsStore } from './stores/settings-store'
import { useFileOps } from './hooks/useFileOps'
import { useAgent } from './hooks/useAgent'
import * as fileBridge from './services/file-bridge'
import type { EditorHandle } from './hooks/useEditor'
import { findQAInMarkdown, replaceQAAnswer, extractAnswerText, buildQABlock, type UpdateAnswerResult } from './lib/qa-utils'

export default function App() {
  const filePath = useDocumentStore((s) => s.filePath)
  const theme = useSettingsStore((s) => s.theme)
  const hasSeenOnboarding = useSettingsStore((s) => s.hasSeenOnboarding)
  const markOnboardingSeen = useSettingsStore((s) => s.markOnboardingSeen)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const { save, openExisting, createNew, rename } = useFileOps()
  const { runAnalysis } = useAgent()
  const activeEditorRef = useRef<EditorHandle | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Auto-save on window close, then signal main process
  useEffect(() => {
    return window.api.window.onBeforeClose(async (isAppQuitting) => {
      let saved = true
      const { filePath: fp, content: c, isDirty } = useDocumentStore.getState()
      if (fp && isDirty) {
        try {
          await fileBridge.writeFile(fp, c)
          useDocumentStore.getState().markSaved()
        } catch {
          saved = false
        }
      }
      window.api.window.closeReady(isAppQuitting, saved)
    })
  }, [])

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
      activeEditorRef.current?.insertAtCursor(text)
    },
    []
  )

  const handleUpdateDocumentAnswer = useCallback(
    (questionText: string, newAnswer: string, storedAnswer: string, force?: boolean): UpdateAnswerResult => {
      const editor = activeEditorRef.current
      if (!editor) {
        return 'not-found-inserted'
      }

      const markdown = editor.getMarkdown()
      const found = findQAInMarkdown(markdown, questionText)

      if (!found) {
        // Q&A not found in document — append to end
        const qaBlock = buildQABlock(questionText, newAnswer)
        editor.setMarkdown(markdown + qaBlock)
        return 'not-found-inserted'
      }

      // Check if the document answer was manually modified
      const storedAnswerText = extractAnswerText(storedAnswer)
      if (!force && found.answer !== storedAnswerText) {
        return 'conflict'
      }

      // Replace the answer in the document
      const newMd = replaceQAAnswer(markdown, questionText, newAnswer)
      editor.setMarkdown(newMd)
      return 'replaced'
    },
    []
  )

  if (!filePath) {
    return (
      <>
        <div className="h-full flex flex-col">
          <div className="h-[38px] shrink-0 app-drag-region bg-bg-secondary border-b border-border" />
          <div className="flex-1">
            <WelcomeScreen onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </div>
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <OnboardingDialog open={onboardingOpen} onClose={handleCloseOnboarding} />
        <ToastContainer />
        <UpdateNotifier />
      </>
    )
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="h-[38px] shrink-0 app-drag-region bg-bg-secondary border-b border-border" />
        <div className="flex-1 overflow-hidden">
          <SplitPanel
            left={
              <LeftPanel
                onInsert={handleInsert}
                onOpenSettings={() => setSettingsOpen(true)}
                onUpdateDocumentAnswer={handleUpdateDocumentAnswer}
              />
            }
            right={
              <EditorPanel
                activeEditorRef={activeEditorRef}
                onUpdate={runAnalysis}
                onSave={save}
                onRename={rename}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            }
          />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <OnboardingDialog open={onboardingOpen} onClose={handleCloseOnboarding} />
      <ToastContainer />
      <UpdateNotifier />
    </>
  )
}
