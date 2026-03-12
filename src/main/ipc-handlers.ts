import { ipcMain, app } from 'electron'
import {
  readFile,
  writeFile,
  saveImage,
  readImageAsBase64,
  readAgentData,
  writeAgentData,
  readContextData,
  writeContextData,
  renameDocument,
  readPageStatusData,
  writePageStatusData
} from './file-service'
import { openFileDialog, chooseDirectoryDialog } from './dialog-service'
import { checkSyncConflict, syncToVault, syncFileExists, renameSyncedFile } from './sync-service'
import { scanAllFiles, readFiles } from './context-service'
import { createPtySession, writeToPty, resizePty, destroyPty } from './pty-service'
import { sendToExternalTerminal } from './external-terminal'
import { createWorktree } from './git-service'
import { clipboard } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'vibedocu-settings.json')
}

export function registerIpcHandlers(): void {
  ipcMain.handle('settings:read', async () => {
    const p = getSettingsPath()
    if (!existsSync(p)) return null
    try {
      return readFileSync(p, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:write', async (_event, data: string) => {
    writeFileSync(getSettingsPath(), data, 'utf-8')
  })
  ipcMain.handle('dialog:openFile', async () => {
    return openFileDialog()
  })

  ipcMain.handle('dialog:chooseDirectory', async () => {
    return chooseDirectoryDialog()
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    return readFile(filePath)
  })

  ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
    return writeFile(filePath, content)
  })

  ipcMain.handle(
    'file:saveImage',
    async (_event, docPath: string, imageBuffer: ArrayBuffer, filename: string) => {
      return saveImage(docPath, Buffer.from(imageBuffer), filename)
    }
  )

  ipcMain.handle(
    'file:readImage',
    async (_event, imagePath: string) => {
      return readImageAsBase64(imagePath)
    }
  )

  ipcMain.handle('file:rename', async (_event, oldPath: string, newName: string) => {
    return renameDocument(oldPath, newName)
  })

  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    clipboard.writeText(text)
    return true
  })

  ipcMain.handle('agent:read', async (_event, docPath: string) => {
    return readAgentData(docPath)
  })

  ipcMain.handle('agent:write', async (_event, docPath: string, data: string) => {
    return writeAgentData(docPath, data)
  })

  ipcMain.handle('sync:checkConflict', async (_event, filePath: string, vaultPath: string) => {
    return checkSyncConflict(filePath, vaultPath)
  })

  ipcMain.handle(
    'sync:toVault',
    async (_event, filePath: string, vaultPath: string, overwrite: boolean) => {
      return syncToVault(filePath, vaultPath, overwrite)
    }
  )

  ipcMain.handle('sync:exists', async (_event, vaultPath: string, fileName: string) => {
    return syncFileExists(vaultPath, fileName)
  })

  ipcMain.handle(
    'sync:renameSynced',
    async (_event, vaultPath: string, oldFileName: string, newFileName: string) => {
      return renameSyncedFile(vaultPath, oldFileName, newFileName)
    }
  )

  ipcMain.handle(
    'context:scan',
    async (_event, projectDir: string, excludeFile?: string) => {
      const files = await scanAllFiles(projectDir, excludeFile)
      return files.map((f) => ({ relativePath: f.relativePath, absolutePath: f.absolutePath, size: f.size }))
    }
  )

  ipcMain.handle(
    'context:readFiles',
    async (_event, absolutePaths: string[]) => {
      return readFiles(absolutePaths)
    }
  )

  ipcMain.handle('context:readData', async (_event, docPath: string) => {
    return readContextData(docPath)
  })

  ipcMain.handle('context:writeData', async (_event, docPath: string, data: string) => {
    return writeContextData(docPath, data)
  })

  // Page status
  ipcMain.handle('pageStatus:read', async (_event, docPath: string) => {
    return readPageStatusData(docPath)
  })

  ipcMain.handle('pageStatus:write', async (_event, docPath: string, data: string) => {
    return writePageStatusData(docPath, data)
  })

  // PTY IPC
  ipcMain.handle('pty:create', async (event, id: string, cwd: string, cols: number, rows: number) => {
    try {
      createPtySession(id, event.sender.id, cwd, cols, rows)
    } catch (err: any) {
      console.error('[PTY] Failed to create session:', err.message)
      throw err
    }
  })

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    try { writeToPty(id, data) } catch { /* ignore */ }
  })

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    try { resizePty(id, cols, rows) } catch { /* ignore */ }
  })

  ipcMain.handle('pty:destroy', async (_event, id: string) => {
    try { destroyPty(id) } catch { /* ignore */ }
  })

  // External terminal
  ipcMain.handle('terminal:sendExternal', async (_event, termApp: string, text: string, cwd?: string) => {
    return sendToExternalTerminal(termApp as 'terminal' | 'iterm2' | 'ghostty', text, cwd)
  })

  // Git operations
  ipcMain.handle('git:createWorktree', async (_event, projectDir: string, branchName: string) => {
    return createWorktree(projectDir, branchName)
  })
}
