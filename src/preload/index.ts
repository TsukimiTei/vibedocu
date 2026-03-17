import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const api = {
  dialog: {
    openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),
    chooseDirectory: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:chooseDirectory', defaultPath)
  },
  file: {
    read: (filePath: string): Promise<string> => ipcRenderer.invoke('file:read', filePath),
    write: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke('file:write', filePath, content),
    saveImage: (docPath: string, imageBuffer: ArrayBuffer, filename: string): Promise<string> =>
      ipcRenderer.invoke('file:saveImage', docPath, imageBuffer, filename),
    readImage: (imagePath: string): Promise<{ base64: string; mimeType: string } | null> =>
      ipcRenderer.invoke('file:readImage', imagePath),
    rename: (oldPath: string, newName: string): Promise<{ newPath: string; content: string }> =>
      ipcRenderer.invoke('file:rename', oldPath, newName)
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
      ipcRenderer.invoke('agent:write', docPath, data),
    watch: (docPath: string): Promise<void> =>
      ipcRenderer.invoke('agent:watch', docPath),
    unwatch: (): Promise<void> =>
      ipcRenderer.invoke('agent:unwatch'),
    onChanged: (callback: (data: string) => void) => {
      const handler = (_event: IpcRendererEvent, data: string) => callback(data)
      ipcRenderer.on('agent:changed', handler)
      return () => ipcRenderer.removeListener('agent:changed', handler)
    }
  },
  sync: {
    checkConflict: (filePath: string, vaultPath: string): Promise<boolean> =>
      ipcRenderer.invoke('sync:checkConflict', filePath, vaultPath),
    toVault: (
      filePath: string,
      vaultPath: string,
      overwrite: boolean
    ): Promise<{ success: boolean; error?: string; conflict?: boolean }> =>
      ipcRenderer.invoke('sync:toVault', filePath, vaultPath, overwrite),
    exists: (vaultPath: string, fileName: string): Promise<boolean> =>
      ipcRenderer.invoke('sync:exists', vaultPath, fileName),
    renameSynced: (
      vaultPath: string,
      oldFileName: string,
      newFileName: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('sync:renameSynced', vaultPath, oldFileName, newFileName)
  },
  style: {
    read: (dirPath: string): Promise<string | null> =>
      ipcRenderer.invoke('style:read', dirPath),
    write: (dirPath: string, data: string): Promise<void> =>
      ipcRenderer.invoke('style:write', dirPath, data)
  },
  pageStatus: {
    read: (docPath: string): Promise<string | null> =>
      ipcRenderer.invoke('pageStatus:read', docPath),
    write: (docPath: string, data: string): Promise<void> =>
      ipcRenderer.invoke('pageStatus:write', docPath, data)
  },
  terminal: {
    sendExternal: (app: string, text: string, cwd?: string): Promise<void> =>
      ipcRenderer.invoke('terminal:sendExternal', app, text, cwd)
  },
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
      const handler = (_event: IpcRendererEvent, id: string, data: string) => callback(id, data)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: IpcRendererEvent, id: string, exitCode: number) => callback(id, exitCode)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    }
  },
  git: {
    createWorktree: (
      projectDir: string,
      branchName: string
    ): Promise<{ success: boolean; worktreePath?: string; branchName?: string; error?: string }> =>
      ipcRenderer.invoke('git:createWorktree', projectDir, branchName)
  },
  mcp: {
    register: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('mcp:register'),
    status: (): Promise<{ registered: boolean; mcpServerPath: string }> =>
      ipcRenderer.invoke('mcp:status'),
    warmup: (docPath?: string): Promise<void> =>
      ipcRenderer.invoke('mcp:warmup', docPath),
    analyze: (prompt: string, docPath: string, options?: { maxTurns?: number }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('mcp:analyze', prompt, docPath, options),
    abort: (): void =>
      ipcRenderer.send('mcp:abort'),
    ask: (prompt: string): Promise<{ success: boolean; text?: string; error?: string }> =>
      ipcRenderer.invoke('mcp:ask', prompt),
    onProgress: (callback: (chunk: string) => void) => {
      const handler = (_event: IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on('mcp:progress', handler)
      return () => ipcRenderer.removeListener('mcp:progress', handler)
    }
  },
  window: {
    onBeforeClose: (callback: (isQuitting: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, isQuitting: boolean) => callback(isQuitting)
      ipcRenderer.on('window:before-close', handler)
      return () => { ipcRenderer.removeListener('window:before-close', handler) }
    },
    closeReady: (skipConfirm: boolean, saved: boolean) => ipcRenderer.send('window:close-ready', skipConfirm, saved)
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

const updater = {
  check: (): Promise<string | null> => ipcRenderer.invoke('updater:check'),
  download: (): Promise<boolean> => ipcRenderer.invoke('updater:download'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onStatus: (callback: (status: string, data?: any) => void) => {
    const handler = (_event: IpcRendererEvent, status: string, data?: any) => callback(status, data)
    ipcRenderer.on('updater:status', handler)
    return () => { ipcRenderer.removeListener('updater:status', handler) }
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('updater', updater)

export type ElectronAPI = typeof api
