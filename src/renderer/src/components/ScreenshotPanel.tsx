import { useState, useRef, useCallback, useEffect } from 'react'
import { useScreenshotStore } from '@/stores/screenshot-store'
import { useDocumentStore } from '@/stores/document-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useAgentStore } from '@/stores/agent-store'
import { ScreenshotCard } from './ScreenshotCard'
import { ScreenshotPreview } from './ScreenshotPreview'
import { ReorderPreviewDialog } from './ReorderPreviewDialog'
import { Button } from './ui/Button'
import { Dialog } from './ui/Dialog'
import { toast } from './ui/Toast'
import {
  queueForAnalysis,
  retryAnalysis,
  findRefsToId,
  updateRefsInText
} from '@/services/screenshot-service'
import { parsePages } from '@/lib/page-utils'

export function ScreenshotPanel() {
  const docPath = useDocumentStore((s) => s.filePath)
  const content = useDocumentStore((s) => s.content)
  const manifest = useScreenshotStore((s) => s.manifest)
  const thumbnails = useScreenshotStore((s) => s.thumbnails)
  const isLoaded = useScreenshotStore((s) => s.isLoaded)

  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [dragSourceId, setDragSourceId] = useState<number | null>(null)
  const [showReorderPreview, setShowReorderPreview] = useState(false)
  const [pendingReorder, setPendingReorder] = useState<number[] | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const screenshots = manifest.screenshots
  const analyzingCount = screenshots.filter((s) => s.status === 'analyzing').length

  // Load manifest on mount / doc change
  useEffect(() => {
    if (docPath) {
      useScreenshotStore.getState().loadManifest(docPath).then(() => {
        useScreenshotStore.getState().loadAllThumbnails(docPath)
      })
    }
  }, [docPath])

  // Handle file upload (shared logic)
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!docPath) return

      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith('image/')
      )
      if (imageFiles.length === 0) return

      const newIds: number[] = []
      for (const file of imageFiles) {
        const buffer = await file.arrayBuffer()
        const screenshot = await useScreenshotStore.getState().addScreenshot(
          docPath,
          buffer,
          file.name
        )
        newIds.push(screenshot.id)
      }

      toast(`已添加 ${imageFiles.length} 张截图`, 'success')

      // Queue for analysis
      queueForAnalysis(docPath, newIds)
    },
    [docPath]
  )

  // Click upload
  const handleClickUpload = () => fileInputRef.current?.click()

  // File input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
      e.target.value = '' // Reset for re-upload
    }
  }

  // Drag and drop file upload
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    // Only hide if leaving the container
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top || e.clientY > rect.bottom
    ) {
      setIsDraggingFile(false)
    }
  }

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // Clipboard paste — only intercept when Screenshots tab is active
  const activeTab = useTerminalStore((s) => s.activeTab)
  useEffect(() => {
    if (activeTab !== 'screenshots') return

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault()
        handleFiles(imageFiles)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handleFiles, activeTab])

  // Preview navigation
  const handlePreview = (index: number) => setPreviewIndex(index)
  const handleClosePreview = () => setPreviewIndex(null)
  const handlePrevPreview = () => {
    if (previewIndex != null && previewIndex > 0) setPreviewIndex(previewIndex - 1)
  }
  const handleNextPreview = () => {
    if (previewIndex != null && previewIndex < screenshots.length - 1) setPreviewIndex(previewIndex + 1)
  }

  // Drag reorder
  const handleCardDragStart = (id: number) => (e: React.DragEvent) => {
    setDragSourceId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }

  const handleCardDragOver = (id: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragSourceId !== null && dragSourceId !== id) {
      setDragOverId(id)
    }
  }

  const handleCardDragEnd = () => {
    setDragSourceId(null)
    setDragOverId(null)
  }

  const handleCardDrop = (targetId: number) => (e: React.DragEvent) => {
    e.preventDefault()
    const sourceId = dragSourceId
    setDragSourceId(null)
    setDragOverId(null)

    if (sourceId == null || sourceId === targetId) return

    // Compute new order
    const currentOrder = screenshots.map((s) => s.id)
    const sourceIdx = currentOrder.indexOf(sourceId)
    const targetIdx = currentOrder.indexOf(targetId)
    if (sourceIdx === -1 || targetIdx === -1) return

    const newOrder = [...currentOrder]
    newOrder.splice(sourceIdx, 1)
    newOrder.splice(targetIdx, 0, sourceId)

    // Check if any IDs actually change
    const hasChanges = newOrder.some((id, i) => id !== i + 1)
    if (!hasChanges) return

    setPendingReorder(newOrder)
    setShowReorderPreview(true)
  }

  // Reorder confirmation
  const getReorderChanges = () => {
    if (!pendingReorder) return { changes: [], affectedLocations: [] }

    const changes = pendingReorder.map((oldId, i) => ({
      oldId,
      newId: i + 1,
      name: screenshots.find((s) => s.id === oldId)?.displayName ||
            screenshots.find((s) => s.id === oldId)?.analysis?.name ||
            screenshots.find((s) => s.id === oldId)?.filename || ''
    }))

    // Build mapping for reference checking
    const mapping: Record<number, number> = {}
    for (const c of changes) {
      if (c.oldId !== c.newId) mapping[c.oldId] = c.newId
    }

    // Find affected references across all pages
    const pages = parsePages(content)
    const affectedLocations: Array<{
      page: string
      refs: Array<{ oldId: number; newId: number; line: number; text: string }>
    }> = []

    for (let i = 0; i < pages.length; i++) {
      const pageName = pages[i].name || 'Base PRD'
      const pageRefs: Array<{ oldId: number; newId: number; line: number; text: string }> = []

      for (const [oldIdStr, newId] of Object.entries(mapping)) {
        const oldId = parseInt(oldIdStr, 10)
        const found = findRefsToId(pages[i].content, oldId)
        for (const ref of found) {
          pageRefs.push({ oldId, newId, ...ref })
        }
      }

      if (pageRefs.length > 0) {
        affectedLocations.push({ page: pageName, refs: pageRefs })
      }
    }

    return { changes, affectedLocations }
  }

  const handleConfirmReorder = async () => {
    if (!pendingReorder || !docPath) return

    // Build mapping
    const mapping: Record<number, number> = {}
    pendingReorder.forEach((oldId, i) => {
      mapping[oldId] = i + 1
    })

    // 1. Update document content references
    const updatedContent = updateRefsInText(content, mapping)
    if (updatedContent !== content) {
      useDocumentStore.getState().setContent(updatedContent)
      useDocumentStore.getState().markDirty()
      // Save document to disk first (before manifest) to ensure consistency
      await window.api.file.write(docPath, updatedContent)
      useDocumentStore.getState().markSaved()
    }

    // 2. Update agent session Q&A text references
    const { sessions } = useAgentStore.getState()
    let sessionsUpdated = false
    const updatedSessions = sessions.map((session) => {
      const updatedQuestions = session.questions.map((q) => {
        const newText = updateRefsInText(q.text, mapping)
        const newAnswer = q.answer ? updateRefsInText(q.answer, mapping) : q.answer
        const newOptions = q.options?.map((o) => ({
          ...o,
          text: updateRefsInText(o.text, mapping)
        }))
        if (newText !== q.text || newAnswer !== q.answer) sessionsUpdated = true
        return { ...q, text: newText, answer: newAnswer, options: newOptions }
      })
      return { ...session, questions: updatedQuestions }
    })
    if (sessionsUpdated) {
      useAgentStore.getState().replaceSessions(updatedSessions)
    }

    // 3. Apply reorder in screenshot store and save manifest
    useScreenshotStore.getState().reorderScreenshots(pendingReorder)
    await useScreenshotStore.getState().applyReorder(docPath)

    setShowReorderPreview(false)
    setPendingReorder(null)
    toast('编号已更新', 'success')
  }

  // Delete with reference check
  const handleDeleteRequest = (id: number) => {
    // Check for references in document
    const refs = findRefsToId(content, id)
    if (refs.length > 0) {
      setDeleteConfirm(id)
    } else {
      doDelete(id)
    }
  }

  const doDelete = async (id: number) => {
    if (!docPath) return
    await useScreenshotStore.getState().removeScreenshot(docPath, id)
    setDeleteConfirm(null)
    toast('截图已删除', 'success')
  }

  const handleConfirmDelete = () => {
    if (deleteConfirm == null) return

    // Mark references as deleted in document
    const regex = new RegExp(`#${deleteConfirm}(?!\\d)`, 'g')
    const updatedContent = content.replace(regex, `#${deleteConfirm}(已删除图片)`)
    if (updatedContent !== content) {
      useDocumentStore.getState().setContent(updatedContent)
      useDocumentStore.getState().markDirty()
    }

    doDelete(deleteConfirm)
  }

  const deleteScreenshot = deleteConfirm != null
    ? screenshots.find((s) => s.id === deleteConfirm)
    : null
  const deleteRefs = deleteConfirm != null ? findRefsToId(content, deleteConfirm) : []

  const { changes: reorderChanges, affectedLocations } = getReorderChanges()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="inline-block w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full bg-bg-primary"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDropFile}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-text-primary uppercase tracking-wider">
            Screenshots
          </span>
          <span className="text-[12px] text-text-muted font-mono">
            {screenshots.length}
          </span>
          {analyzingCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-accent-blue">
              <span className="inline-block w-2.5 h-2.5 border border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
              分析中 {analyzingCount}/{screenshots.length}
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={handleClickUpload}>
          + Upload
        </Button>
      </div>

      {/* Drop zone overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-accent-blue/10 border-2 border-dashed border-accent-blue rounded-lg m-2 pointer-events-none">
          <div className="text-center">
            <p className="text-lg text-accent-blue font-mono mb-1">放开以上传截图</p>
            <p className="text-sm text-accent-blue/60">支持 PNG, JPG, GIF, WebP</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {screenshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
              <span className="text-2xl text-text-muted/30">📸</span>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm text-text-secondary font-medium">上传产品截图</p>
              <p className="text-xs text-text-muted max-w-[200px]">
                拖拽图片到此区域、从剪贴板粘贴 (⌘V)、或点击上传按钮
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleClickUpload}>
              选择图片
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {screenshots.map((screenshot, index) => (
              <ScreenshotCard
                key={screenshot.id}
                screenshot={screenshot}
                thumbnailSrc={thumbnails[screenshot.filename]}
                analyzeProgress={screenshot.status === 'analyzing' ? `${analyzingCount}/${screenshots.length}` : undefined}
                onPreview={() => handlePreview(index)}
                onRename={(name) => {
                  useScreenshotStore.getState().updateScreenshotName(screenshot.id, name)
                  if (docPath) useScreenshotStore.getState().saveManifest(docPath)
                }}
                onDelete={() => handleDeleteRequest(screenshot.id)}
                onRetry={() => docPath && retryAnalysis(docPath, screenshot.id)}
                onDragStart={handleCardDragStart(screenshot.id)}
                onDragOver={handleCardDragOver(screenshot.id)}
                onDragEnd={handleCardDragEnd}
                onDrop={handleCardDrop(screenshot.id)}
                isDragOver={dragOverId === screenshot.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Preview lightbox */}
      {previewIndex != null && screenshots[previewIndex] && (
        <ScreenshotPreview
          screenshot={screenshots[previewIndex]}
          thumbnailSrc={thumbnails[screenshots[previewIndex].filename] || ''}
          onClose={handleClosePreview}
          onPrev={handlePrevPreview}
          onNext={handleNextPreview}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < screenshots.length - 1}
        />
      )}

      {/* Reorder preview dialog */}
      <ReorderPreviewDialog
        open={showReorderPreview}
        onClose={() => { setShowReorderPreview(false); setPendingReorder(null) }}
        onConfirm={handleConfirmReorder}
        changes={reorderChanges}
        affectedLocations={affectedLocations}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirm != null}
        onClose={() => setDeleteConfirm(null)}
        title="删除截图"
      >
        <div className="space-y-3">
          {deleteRefs.length > 0 ? (
            <>
              <p className="text-xs text-accent-orange">
                截图 #{deleteScreenshot?.id} ({deleteScreenshot?.displayName || deleteScreenshot?.filename}) 在文档中被引用了 {deleteRefs.length} 处：
              </p>
              <div className="max-h-[120px] overflow-y-auto space-y-1">
                {deleteRefs.map((ref, i) => (
                  <div key={i} className="text-[11px] font-mono text-text-muted px-2 py-1 rounded bg-bg-secondary">
                    L{ref.line}: {ref.text}
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted">
                确认删除后，文档中的引用将标记为「已删除图片」。
              </p>
            </>
          ) : (
            <p className="text-xs text-text-secondary">
              确定要删除截图 #{deleteScreenshot?.id} ({deleteScreenshot?.displayName || deleteScreenshot?.filename})？
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
              删除
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
