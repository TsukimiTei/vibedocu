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

import { app, BrowserWindow, shell, Menu, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { initAutoUpdater } from './auto-updater'
import { destroyAllPtySessions } from './pty-service'

let isQuitting = false
let pendingQuitCount = 0
const closingWindows = new Set<number>()

function createWindow(): void {
  const win = new BrowserWindow({
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

  win.on('close', (e) => {
    if (closingWindows.has(win.id)) {
      closingWindows.delete(win.id)
      return
    }
    e.preventDefault()
    // Ask renderer to auto-save, then we handle confirmation
    win.webContents.send('window:before-close', isQuitting)
  })

  win.on('ready-to-show', () => {
    win.show()
    if (!is.dev) {
      initAutoUpdater(win)
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow()
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  registerIpcHandlers()
  buildAppMenu()
  createWindow()

  // Renderer signals save is done — show confirm or close directly
  ipcMain.on('window:close-ready', (event, skipConfirm: boolean, saved: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) {
      if (isQuitting) finishQuitWindow()
      return
    }

    if (skipConfirm) {
      closingWindows.add(win.id)
      win.close()
      if (isQuitting) finishQuitWindow()
      return
    }

    const detail = saved
      ? '文档已自动保存。'
      : '文档保存失败，关闭后未保存的更改将丢失。'

    const result = dialog.showMessageBoxSync(win, {
      type: saved ? 'question' : 'warning',
      buttons: ['关闭窗口', '取消'],
      defaultId: saved ? 0 : 1,
      cancelId: 1,
      title: '关闭确认',
      message: '确认要关闭此窗口吗？',
      detail
    })

    if (result === 0) {
      closingWindows.add(win.id)
      win.close()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function finishQuitWindow(): void {
  pendingQuitCount--
  if (pendingQuitCount <= 0) {
    app.quit()
  }
}

app.on('before-quit', (e) => {
  if (isQuitting) return // already handled, let quit proceed
  e.preventDefault()
  isQuitting = true
  destroyAllPtySessions()

  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) {
    app.quit()
    return
  }

  // Wait for each window to save before quitting
  pendingQuitCount = windows.length
  for (const win of windows) {
    win.webContents.send('window:before-close', true)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
