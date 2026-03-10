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
      ipcRenderer.invoke('file:saveImage', docPath, imageBuffer, filename)
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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
