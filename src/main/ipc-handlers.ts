import { ipcMain } from 'electron'
import { readFile, writeFile, saveImage } from './file-service'
import { openFileDialog, chooseDirectoryDialog } from './dialog-service'
import { clipboard } from 'electron'

export function registerIpcHandlers(): void {
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
