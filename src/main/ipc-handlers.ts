import { ipcMain, app } from 'electron'
import { readFile, writeFile, saveImage } from './file-service'
import { openFileDialog, chooseDirectoryDialog } from './dialog-service'
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

  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    clipboard.writeText(text)
    return true
  })
}
