import { contextBridge, ipcRenderer } from 'electron'

const api = {
  dialog: {
    openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
    chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseDirectory')
  },
  file: {
    read: (filePath: string): Promise<string> => ipcRenderer.invoke('file:read', filePath),
    write: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke('file:write', filePath, content),
    saveImage: (docPath: string, imageBuffer: ArrayBuffer, filename: string): Promise<string> =>
      ipcRenderer.invoke('file:saveImage', docPath, imageBuffer, filename),
    readImage: (imagePath: string): Promise<{ base64: string; mimeType: string } | null> =>
      ipcRenderer.invoke('file:readImage', imagePath)
  },
  clipboard: {
    writeText: (text: string): Promise<boolean> => ipcRenderer.invoke('clipboard:writeText', text)
  },
  settings: {
    read: (): Promise<string | null> => ipcRenderer.invoke('settings:read'),
    write: (data: string): Promise<void> => ipcRenderer.invoke('settings:write', data)
  },
  agent: {
    read: (docPath: string): Promise<string | null> =>
      ipcRenderer.invoke('agent:read', docPath),
    write: (docPath: string, data: string): Promise<void> =>
      ipcRenderer.invoke('agent:write', docPath, data)
  },
  sync: {
    checkConflict: (filePath: string, vaultPath: string): Promise<boolean> =>
      ipcRenderer.invoke('sync:checkConflict', filePath, vaultPath),
    toVault: (
      filePath: string,
      vaultPath: string,
      overwrite: boolean
    ): Promise<{ success: boolean; error?: string; conflict?: boolean }> =>
      ipcRenderer.invoke('sync:toVault', filePath, vaultPath, overwrite)
  },
  context: {
    scan: (
      projectDir: string,
      excludeFile?: string
    ): Promise<{ relativePath: string; absolutePath: string; size: number }[]> =>
      ipcRenderer.invoke('context:scan', projectDir, excludeFile),
    readFiles: (
      absolutePaths: string[]
    ): Promise<{ path: string; content: string }[]> =>
      ipcRenderer.invoke('context:readFiles', absolutePaths),
    readData: (docPath: string): Promise<string | null> =>
      ipcRenderer.invoke('context:readData', docPath),
    writeData: (docPath: string, data: string): Promise<void> =>
      ipcRenderer.invoke('context:writeData', docPath, data)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
