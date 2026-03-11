import { contextBridge, ipcRenderer } from 'electron'

const terminalApi = {
  pty: {
    create: (id: string, cwd: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke('pty:create', id, cwd, cols, rows),
    write: (id: string, data: string): void =>
      ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    destroy: (id: string): Promise<void> =>
      ipcRenderer.invoke('pty:destroy', id),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) =>
        callback(id, data)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) =>
        callback(id, exitCode)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    }
  },
  getInitData: (): Promise<{
    sessionId: string
    cwd: string
    prompt: string
    pageName: string
  }> => ipcRenderer.invoke('terminal:getInitData')
}

contextBridge.exposeInMainWorld('terminalApi', terminalApi)
