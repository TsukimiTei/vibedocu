import { BrowserWindow } from 'electron'

// Lazy-load node-pty to avoid crashing the main process if it fails
let pty: typeof import('node-pty') | null = null
function getPty(): typeof import('node-pty') {
  if (!pty) {
    pty = require('node-pty')
  }
  return pty!
}

interface PtySession {
  id: string
  process: any // pty.IPty
  webContentsId: number
}

const sessions = new Map<string, PtySession>()

export function createPtySession(
  id: string,
  webContentsId: number,
  cwd: string,
  cols: number,
  rows: number
): void {
  const nodePty = getPty()
  const shell = process.env.SHELL || '/bin/zsh'
  const ptyProcess = nodePty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' }
  })

  ptyProcess.onData((data: string) => {
    try {
      const win = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.webContents.id === webContentsId
      )
      if (win) {
        win.webContents.send('pty:data', id, data)
      }
    } catch {
      // Window destroyed during iteration — ignore
    }
  })

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    try {
      const win = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.webContents.id === webContentsId
      )
      if (win) {
        win.webContents.send('pty:exit', id, exitCode)
      }
    } catch {
      // Window destroyed — ignore
    }
    sessions.delete(id)
  })

  sessions.set(id, { id, process: ptyProcess, webContentsId })
}

export function writeToPty(id: string, data: string): void {
  sessions.get(id)?.process.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
  sessions.get(id)?.process.resize(cols, rows)
}

export function destroyPty(id: string): void {
  const session = sessions.get(id)
  if (session) {
    session.process.kill()
    sessions.delete(id)
  }
}

export function destroyAllPtySessions(): void {
  for (const [, session] of sessions) {
    session.process.kill()
  }
  sessions.clear()
}
