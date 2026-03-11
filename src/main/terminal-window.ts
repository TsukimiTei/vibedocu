import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export interface TerminalInitData {
  sessionId: string
  cwd: string
  prompt: string
  pageName: string
}

const pendingInitData = new Map<number, TerminalInitData>()

export function createTerminalWindow(initData: TerminalInitData): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    show: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 13 },
    title: `Terminal — ${initData.pageName}`,
    webPreferences: {
      preload: join(__dirname, '../preload/terminal-preload.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  const webContentsId = win.webContents.id
  pendingInitData.set(webContentsId, initData)

  win.on('closed', () => {
    pendingInitData.delete(webContentsId)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Terminal] Renderer crashed:', details.reason)
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Terminal] Failed to load:', errorCode, errorDescription)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/terminal.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/terminal.html'))
  }

  return win
}

export function getTerminalInitData(webContentsId: number): TerminalInitData | undefined {
  const data = pendingInitData.get(webContentsId)
  if (data) {
    pendingInitData.delete(webContentsId)
  }
  return data
}
