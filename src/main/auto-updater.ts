import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let mainWindow: BrowserWindow | null = null

function send(channel: string, ...args: unknown[]) {
  mainWindow?.webContents.send(channel, ...args)
}

export function initAutoUpdater(win: BrowserWindow): void {
  mainWindow = win

  autoUpdater.on('checking-for-update', () => {
    send('updater:status', 'checking')
  })

  autoUpdater.on('update-available', (info) => {
    send('updater:status', 'available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:status', 'not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    send('updater:status', 'downloading', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    send('updater:status', 'downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('[auto-updater] error:', err.message)
    send('updater:status', 'error', { message: err.message })
  })

  // IPC handlers
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.updateInfo?.version ?? null
    } catch (err) {
      console.error('[auto-updater] check error:', err)
      return null
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Check for updates 5s after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)
}
