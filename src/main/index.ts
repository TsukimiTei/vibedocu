// Suppress EPIPE errors from broken pipes (e.g. console output after stderr closes)
process.stdout?.on('error', () => {})
process.stderr?.on('error', () => {})

// Prevent uncaught exceptions from crashing the app
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[Main] Unhandled rejection:', err)
})

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { initAutoUpdater } from './auto-updater'
import { destroyAllPtySessions } from './pty-service'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 13 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (!is.dev) {
      initAutoUpdater(mainWindow)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  destroyAllPtySessions()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
