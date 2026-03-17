import { useState, useEffect } from 'react'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { chooseDirectory, openFile } from '@/services/file-bridge'

interface OpenDocDialogProps {
  open: boolean
  mode: 'open' | 'new'
  onClose: () => void
  onConfirm: (filePath: string, projectDir: string) => void
}

export function OpenDocDialog({ open, mode, onClose, onConfirm }: OpenDocDialogProps) {
  const [docPath, setDocPath] = useState('')
  const [projDir, setProjDir] = useState('')

  useEffect(() => {
    if (open) {
      setDocPath('')
      setProjDir('')
    }
  }, [open])

  const handleChooseDoc = async () => {
    if (mode === 'open') {
      const path = await openFile()
      if (path) setDocPath(path)
    } else {
      const dir = await chooseDirectory()
      if (dir) setDocPath(dir)
    }
  }

  const handleChooseProject = async () => {
    const dir = await chooseDirectory(projDir || undefined)
    if (dir) setProjDir(dir)
  }

  const handleConfirm = () => {
    if (!docPath) return
    onConfirm(docPath, projDir)
  }

  const shortenPath = (path: string) => {
    const home = path.replace(/^\/Users\/[^/]+/, '~')
    if (home.length <= 55) return home
    const parts = home.split('/')
    if (parts.length <= 3) return home
    return parts[0] + '/.../' + parts.slice(-2).join('/')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'open' ? '打开文档' : '新建文档'}
    >
      <div className="space-y-5">
        {/* Step 1: Doc path */}
        <div>
          <label className="block text-xs text-text-muted mb-1.5">
            {mode === 'open' ? '① 选择 .md 文件' : '① 选择存放目录'}
          </label>
          <div
            onClick={handleChooseDoc}
            className="w-full bg-bg-tertiary border border-border rounded px-3 py-2.5 text-xs font-mono break-all min-h-[36px] flex items-center cursor-pointer hover:border-border-focus transition-colors"
          >
            {docPath ? (
              <span className="text-text-primary">{shortenPath(docPath)}</span>
            ) : (
              <span className="text-text-muted">
                {mode === 'open' ? '点击选择 .md 文件...' : '点击选择目录...'}
              </span>
            )}
          </div>
        </div>

        {/* Step 2: Project dir */}
        <div>
          <label className="block text-xs text-text-muted mb-1.5">
            ② 项目目录 <span className="text-text-muted/60">(可选)</span>
          </label>
          <div
            onClick={handleChooseProject}
            className="w-full bg-bg-tertiary border border-border rounded px-3 py-2.5 text-xs font-mono break-all min-h-[36px] flex items-center cursor-pointer hover:border-border-focus transition-colors"
          >
            {projDir ? (
              <span className="text-text-primary">{shortenPath(projDir)}</span>
            ) : (
              <span className="text-text-muted">点击选择项目目录...</span>
            )}
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            Agent 将读取此目录作为项目 context，帮你提出更有针对性的问题
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!docPath}>
            {mode === 'open' ? '打开' : '创建'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
