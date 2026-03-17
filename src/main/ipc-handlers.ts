import { ipcMain, app, BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import {
  readFile,
  writeFile,
  saveImage,
  readImageAsBase64,
  readAgentData,
  writeAgentData,
  readContextData,
  writeContextData,
  renameDocument,
  readPageStatusData,
  writePageStatusData,
  readStyleProfile,
  writeStyleProfile
} from './file-service'
import { openFileDialog, chooseDirectoryDialog } from './dialog-service'
import { checkSyncConflict, syncToVault, syncFileExists, renameSyncedFile } from './sync-service'
import { scanAllFiles, readFiles } from './context-service'
import { createPtySession, writeToPty, resizePty, destroyPty } from './pty-service'
import { sendToExternalTerminal } from './external-terminal'
import { createWorktree } from './git-service'
import { clipboard } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'vibedocu-settings.json')
}

export function registerIpcHandlers(): void {
  ipcMain.handle('settings:read', async () => {
    const p = getSettingsPath()
    if (!existsSync(p)) return null
    try {
      return readFileSync(p, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:write', async (_event, data: string) => {
    writeFileSync(getSettingsPath(), data, 'utf-8')
  })
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

  ipcMain.handle(
    'file:readImage',
    async (_event, imagePath: string) => {
      return readImageAsBase64(imagePath)
    }
  )

  ipcMain.handle('file:rename', async (_event, oldPath: string, newName: string) => {
    return renameDocument(oldPath, newName)
  })

  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    clipboard.writeText(text)
    return true
  })

  ipcMain.handle('agent:read', async (_event, docPath: string) => {
    return readAgentData(docPath)
  })

  ipcMain.handle('agent:write', async (_event, docPath: string, data: string) => {
    return writeAgentData(docPath, data)
  })

  // Agent file watching for MCP mode
  let agentWatcher: FSWatcher | null = null
  let agentDebounceTimer: ReturnType<typeof setTimeout> | null = null

  ipcMain.handle('agent:watch', async (event, docPath: string) => {
    // Clean up previous watcher
    if (agentWatcher) {
      agentWatcher.close()
      agentWatcher = null
    }

    const { parse, dirname, join } = await import('path')
    const { existsSync } = await import('fs')
    const docName = parse(docPath).name
    const dataPath = join(dirname(docPath), docName, 'agent-sessions.json')

    // Ensure the directory exists before watching
    const dataDir = join(dirname(docPath), docName)
    if (!existsSync(dataDir)) {
      const { mkdir } = await import('fs/promises')
      await mkdir(dataDir, { recursive: true })
    }

    // Watch the directory for changes to agent-sessions.json
    agentDebounceTimer = null
    agentWatcher = watch(dataDir, (eventType, filename) => {
      if (filename !== 'agent-sessions.json') return
      if (agentDebounceTimer) clearTimeout(agentDebounceTimer)
      agentDebounceTimer = setTimeout(async () => {
        try {
          if (!existsSync(dataPath)) return
          const { readFile: fsRead } = await import('fs/promises')
          const data = await fsRead(dataPath, 'utf-8')
          const win = BrowserWindow.fromWebContents(event.sender)
          if (win && !win.isDestroyed()) {
            win.webContents.send('agent:changed', data)
          }
        } catch {
          // ignore read errors
        }
      }, 300)
    })
  })

  ipcMain.handle('agent:unwatch', async () => {
    if (agentDebounceTimer) {
      clearTimeout(agentDebounceTimer)
      agentDebounceTimer = null
    }
    if (agentWatcher) {
      agentWatcher.close()
      agentWatcher = null
    }
  })

  ipcMain.handle('sync:checkConflict', async (_event, filePath: string, vaultPath: string) => {
    return checkSyncConflict(filePath, vaultPath)
  })

  ipcMain.handle(
    'sync:toVault',
    async (_event, filePath: string, vaultPath: string, overwrite: boolean) => {
      return syncToVault(filePath, vaultPath, overwrite)
    }
  )

  ipcMain.handle('sync:exists', async (_event, vaultPath: string, fileName: string) => {
    return syncFileExists(vaultPath, fileName)
  })

  ipcMain.handle(
    'sync:renameSynced',
    async (_event, vaultPath: string, oldFileName: string, newFileName: string) => {
      return renameSyncedFile(vaultPath, oldFileName, newFileName)
    }
  )

  ipcMain.handle(
    'context:scan',
    async (_event, projectDir: string, excludeFile?: string) => {
      const files = await scanAllFiles(projectDir, excludeFile)
      return files.map((f) => ({ relativePath: f.relativePath, absolutePath: f.absolutePath, size: f.size }))
    }
  )

  ipcMain.handle(
    'context:readFiles',
    async (_event, absolutePaths: string[]) => {
      return readFiles(absolutePaths)
    }
  )

  ipcMain.handle('context:readData', async (_event, docPath: string) => {
    return readContextData(docPath)
  })

  ipcMain.handle('context:writeData', async (_event, docPath: string, data: string) => {
    return writeContextData(docPath, data)
  })

  // MCP Server registration to Claude Code
  ipcMain.handle('mcp:register', async () => {
    try {
      const { homedir } = await import('os')
      const { join, dirname } = await import('path')
      const { readFileSync, writeFileSync, existsSync } = await import('fs')

      // Determine MCP server path
      const appPath = app.getAppPath()
      let mcpServerPath: string
      if (app.isPackaged) {
        // Production: asar unpacked
        mcpServerPath = join(dirname(appPath), 'app.asar.unpacked', 'out', 'mcp-server', 'index.mjs')
      } else {
        // Dev: project root
        mcpServerPath = join(appPath, 'out', 'mcp-server', 'index.mjs')
      }

      if (!existsSync(mcpServerPath)) {
        return { success: false, error: `MCP Server not found at ${mcpServerPath}` }
      }

      // Read or create ~/.claude.json
      const claudeConfigPath = join(homedir(), '.claude.json')
      let config: Record<string, any> = {}
      if (existsSync(claudeConfigPath)) {
        try {
          config = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'))
        } catch {
          // Corrupted config — preserve original file, don't overwrite
          return { success: false, error: '~/.claude.json 格式损坏，请手动修复后重试' }
        }
      }

      // Add/update vibedocs MCP server
      if (!config.mcpServers) config.mcpServers = {}
      config.mcpServers.vibedocs = {
        command: 'node',
        args: [mcpServerPath]
      }

      // Atomic write: write to temp file then rename
      const tmpPath = claudeConfigPath + '.tmp'
      writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8')
      const { renameSync } = await import('fs')
      renameSync(tmpPath, claudeConfigPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('mcp:status', async () => {
    const { homedir } = await import('os')
    const { join, dirname } = await import('path')
    const { readFileSync, existsSync } = await import('fs')

    const appPath = app.getAppPath()
    let mcpServerPath: string
    if (app.isPackaged) {
      mcpServerPath = join(dirname(appPath), 'app.asar.unpacked', 'out', 'mcp-server', 'index.mjs')
    } else {
      mcpServerPath = join(appPath, 'out', 'mcp-server', 'index.mjs')
    }

    const claudeConfigPath = join(homedir(), '.claude.json')
    let registered = false
    if (existsSync(claudeConfigPath)) {
      try {
        const config = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'))
        registered = !!config.mcpServers?.vibedocs
      } catch { /* ignore */ }
    }

    return { registered, mcpServerPath }
  })

  // MCP: session-aware claude process management
  let claudeProcess: ChildProcess | null = null
  let warmProcess: ChildProcess | null = null
  let warmDocPath: string | null = null
  let cachedClaudePath: string | null = null
  let isWarming = false
  let warmIdleTimer: ReturnType<typeof setTimeout> | null = null
  const WARM_IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes
  const DEFAULT_MAX_TURNS = 3

  const ALLOWED_TOOLS = 'mcp__vibedocs__vibedocs_save_analysis'


  function makeCleanEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env }
    delete env.CLAUDECODE
    for (const key of Object.keys(env)) {
      if (key.startsWith('CLAUDE_CODE') || key.startsWith('CLAUDECODE')) {
        delete env[key]
      }
    }
    return env
  }

  async function findClaudeBinary(): Promise<string | null> {
    if (cachedClaudePath) return cachedClaudePath

    const { existsSync } = await import('fs')
    const { homedir } = await import('os')
    const { join: pathJoin } = await import('path')
    const home = homedir()

    const candidates = [
      pathJoin(home, '.claude', 'local', 'claude'),
      pathJoin(home, '.npm-global', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      pathJoin(home, '.local', 'bin', 'claude')
    ]

    let found = candidates.find((p) => existsSync(p)) || ''

    if (!found) {
      try {
        const { execSync } = await import('child_process')
        const augmentedPath = `/opt/homebrew/bin:/usr/local/bin:${home}/.local/bin:${process.env.PATH || ''}`
        found = execSync('which claude', {
          encoding: 'utf-8',
          env: { ...process.env, PATH: augmentedPath }
        }).trim()
      } catch { /* ignore */ }
    }

    if (found) cachedClaudePath = found
    return found || null
  }

  function buildClaudeArgs(maxTurns?: number): string[] {
    const args = [
      '-p', '--verbose',
      '--output-format', 'stream-json',
      '--allowedTools', ALLOWED_TOOLS
    ]
    if (maxTurns != null) {
      args.push('--max-turns', String(maxTurns))
    }
    return args
  }

  function spawnForDoc(claudePath: string, maxTurns?: number): ChildProcess {
    console.log('[mcp] spawn: maxTurns=%s', maxTurns || 'unlimited')
    return spawn(claudePath, buildClaudeArgs(maxTurns), {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: makeCleanEnv()
    })
  }

  async function warmUp(docPath?: string): Promise<void> {
    if (warmProcess || isWarming) return
    isWarming = true
    try {
      const claudePath = await findClaudeBinary()
      if (!claudePath || warmProcess) return

      const targetDoc = docPath || null
      if (targetDoc) {
        console.log('[mcp:warmup] pre-spawning warm process')
        warmProcess = spawnForDoc(claudePath, DEFAULT_MAX_TURNS)
      } else {
        // Generic warm — no session
        console.log('[mcp:warmup] pre-spawning generic process')
        warmProcess = spawn(claudePath, [
          '-p', '--verbose', '--output-format', 'stream-json',
          '--allowedTools', ALLOWED_TOOLS,
          '--max-turns', String(DEFAULT_MAX_TURNS)
        ], { stdio: ['pipe', 'pipe', 'pipe'], env: makeCleanEnv() })
      }
      warmDocPath = targetDoc
      warmProcess.on('close', () => { warmProcess = null; warmDocPath = null; if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null } })
      warmProcess.on('error', () => { warmProcess = null; warmDocPath = null; if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null } })
      warmProcess.stderr?.on('data', () => {})
      // Kill warm process if idle for too long
      if (warmIdleTimer) clearTimeout(warmIdleTimer)
      warmIdleTimer = setTimeout(() => {
        if (warmProcess) { warmProcess.kill('SIGTERM'); warmProcess = null; warmDocPath = null }
        warmIdleTimer = null
      }, WARM_IDLE_TIMEOUT)
    } finally {
      isWarming = false
    }
  }

  app.on('before-quit', () => {
    if (claudeProcess) { claudeProcess.kill('SIGTERM'); claudeProcess = null }
    if (warmProcess) { warmProcess.kill('SIGTERM'); warmProcess = null }
  })

  ipcMain.handle('mcp:warmup', async (_event, docPath?: string) => {
    await warmUp(docPath)
  })

  ipcMain.handle('mcp:analyze', async (_event, prompt: string, docPath: string, options?: { maxTurns?: number }) => {
    if (claudeProcess) {
      return { success: false, error: 'Analysis already in progress' }
    }

    // Synchronous sentinel to prevent race conditions from rapid calls
    const sentinel = {} as any
    claudeProcess = sentinel

    const win = BrowserWindow.fromWebContents(_event.sender)

    try {
      let proc: ChildProcess

      const effectiveMaxTurns = options?.maxTurns ?? DEFAULT_MAX_TURNS
      if (warmProcess && effectiveMaxTurns <= DEFAULT_MAX_TURNS) {
        console.log('[mcp:analyze] using pre-warmed process (maxTurns=%d)', DEFAULT_MAX_TURNS)
        proc = warmProcess
        warmProcess = null
        warmDocPath = null
      } else {
        if (warmProcess) { warmProcess.kill('SIGTERM'); warmProcess = null; warmDocPath = null }
        const claudePath = await findClaudeBinary()
        if (!claudePath) {
          claudeProcess = null
          return { success: false, error: '找不到 claude 命令，请确认已安装 Claude Code CLI' }
        }
        console.log('[mcp:analyze] cold start (maxTurns=%d)', effectiveMaxTurns)
        proc = spawnForDoc(claudePath, effectiveMaxTurns)
      }

      claudeProcess = proc

      return new Promise((resolve) => {
        proc.stdin?.write(prompt)
        proc.stdin?.end()

        let stderr = ''
        let lineBuf = ''
        let resolved = false
        const toolIdMap: Record<string, string> = {}
        const toolLabels: Record<string, string> = {
          vibedocs_save_analysis: '保存分析结果'
        }

        const send = (data: any) => {
          if (win && !win.isDestroyed()) win.webContents.send('mcp:progress', JSON.stringify(data))
        }

        proc.stdout?.on('data', (d) => {
          lineBuf += d.toString()
          const lines = lineBuf.split('\n')
          lineBuf = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            let evt: any = null
            try { evt = JSON.parse(line) } catch { continue }

            if (evt.type === 'result') {
              console.log('[mcp:result-full]', JSON.stringify({ usage: evt.usage, num_turns: evt.num_turns, duration_ms: evt.duration_ms }))
            }

            if (evt.type === 'system' || evt.type === 'rate_limit_event') continue

            if (evt.type === 'assistant') {
              for (const block of (evt.message?.content || [])) {
                if (block.type === 'tool_use') {
                  const raw = (block.name || '').replace('mcp__vibedocs__', '')
                  const label = toolLabels[raw] || raw
                  if (block.id) toolIdMap[block.id] = label
                  send({ step: 'tool', name: label, status: 'running' })
                } else if (block.type === 'text' && block.text) {
                  send({ step: 'text', text: block.text })
                } else if (block.type === 'thinking') {
                  send({ step: 'thinking' })
                }
              }
            } else if (evt.type === 'user' && evt.message?.content) {
              for (const block of evt.message.content) {
                if (block.type === 'tool_result' && block.tool_use_id) {
                  const label = toolIdMap[block.tool_use_id]
                  if (label) send({ step: 'tool', name: label, status: 'done' })
                }
              }
            } else if (evt.type === 'result') {
              const usage = evt.usage || {}
              send({
                step: 'result',
                text: typeof evt.result === 'string' ? evt.result : '',
                durationMs: evt.duration_ms,
                turns: evt.num_turns,
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0
              })
              // Clear process reference on result (before close event fires)
              claudeProcess = null
              if (!resolved) {
                resolved = true
                readAgentData(docPath).then((agentData) => {
                  if (agentData && win && !win.isDestroyed()) {
                    win.webContents.send('agent:changed', agentData)
                  }
                }).catch(() => {}).finally(() => {
                  resolve({ success: true })
                })
              }
            }
          }
        })
        proc.stderr?.on('data', (d) => {
          if (stderr.length < 10_000) stderr += d.toString()
          console.log('[mcp:analyze] stderr:', d.toString().slice(0, 200))
        })

        proc.on('close', async (code) => {
          console.log('[mcp:analyze] exited with code:', code)
          claudeProcess = null
          // Flush remaining line buffer (e.g. result event without trailing newline)
          if (lineBuf.trim()) {
            try {
              const evt = JSON.parse(lineBuf)
              if (evt.type === 'result') {
                const fUsage = evt.usage || {}
                send({
                  step: 'result',
                  text: typeof evt.result === 'string' ? evt.result : '',
                  durationMs: evt.duration_ms,
                  turns: evt.num_turns,
                  inputTokens: fUsage.input_tokens || 0,
                  outputTokens: fUsage.output_tokens || 0
                })
              }
            } catch { /* not valid JSON, ignore */ }
            lineBuf = ''
          }
          // Push agent data to renderer regardless
          try {
            const agentData = await readAgentData(docPath)
            if (agentData && win && !win.isDestroyed()) {
              win.webContents.send('agent:changed', agentData)
            }
          } catch { /* ignore */ }
          // Resolve only if result event never arrived (e.g. error)
          if (!resolved) {
            resolved = true
            if (code === 0) {
              resolve({ success: true })
            } else {
              resolve({ success: false, error: stderr.slice(0, 500) || `claude exited with code ${code}` })
            }
          }
          warmUp(docPath).catch(() => {})
        })

        proc.on('error', (err) => {
          console.log('[mcp:analyze] spawn error:', err.message)
          claudeProcess = null
          if (!resolved) {
            resolved = true
            resolve({ success: false, error: err.message })
          }
        })
      })
    } catch (err: any) {
      claudeProcess = null
      return { success: false, error: err.message }
    }
  })

  ipcMain.on('mcp:abort', () => {
    if (claudeProcess) {
      claudeProcess.kill('SIGTERM')
      claudeProcess = null
    }
    if (warmProcess) {
      warmProcess.kill('SIGTERM')
      warmProcess = null
    }
  })

  // Lightweight Claude call — no MCP tools, just prompt → text response
  ipcMain.handle('mcp:ask', async (_event, prompt: string) => {
    try {
      const claudePath = await findClaudeBinary()
      if (!claudePath) {
        return { success: false, error: '找不到 claude 命令' }
      }
      const proc = spawn(claudePath, ['-p', '--output-format', 'json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: makeCleanEnv()
      })
      proc.stdin?.write(prompt)
      proc.stdin?.end()

      return new Promise<{ success: boolean; text?: string; error?: string }>((resolve) => {
        let stdout = ''
        let stderr = ''
        let resolved = false
        const done = (result: { success: boolean; text?: string; error?: string }) => {
          if (resolved) return
          resolved = true
          clearTimeout(timeout)
          resolve(result)
        }
        // 60s timeout to prevent hanging
        const timeout = setTimeout(() => {
          proc.kill('SIGTERM')
          done({ success: false, error: '请求超时（60s）' })
        }, 60_000)
        proc.stdout?.on('data', (d) => { stdout += d.toString() })
        proc.stderr?.on('data', (d) => { stderr += d.toString() })
        proc.on('close', (code) => {
          if (code !== 0) {
            done({ success: false, error: stderr.slice(0, 500) || `exited ${code}` })
            return
          }
          try {
            const parsed = JSON.parse(stdout)
            done({ success: true, text: parsed.result || stdout })
          } catch {
            done({ success: true, text: stdout })
          }
        })
        proc.on('error', (err) => {
          done({ success: false, error: err.message })
        })
      })
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Page status
  ipcMain.handle('pageStatus:read', async (_event, docPath: string) => {
    return readPageStatusData(docPath)
  })

  ipcMain.handle('pageStatus:write', async (_event, docPath: string, data: string) => {
    return writePageStatusData(docPath, data)
  })

  // Style profile
  ipcMain.handle('style:read', async (_event, dirPath: string) => {
    return readStyleProfile(dirPath)
  })

  ipcMain.handle('style:write', async (_event, dirPath: string, data: string) => {
    return writeStyleProfile(dirPath, data)
  })

  // PTY IPC
  ipcMain.handle('pty:create', async (event, id: string, cwd: string, cols: number, rows: number) => {
    try {
      createPtySession(id, event.sender.id, cwd, cols, rows)
    } catch (err: any) {
      console.error('[PTY] Failed to create session:', err.message)
      throw err
    }
  })

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    try { writeToPty(id, data) } catch { /* ignore */ }
  })

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    try { resizePty(id, cols, rows) } catch { /* ignore */ }
  })

  ipcMain.handle('pty:destroy', async (_event, id: string) => {
    try { destroyPty(id) } catch { /* ignore */ }
  })

  // External terminal
  ipcMain.handle('terminal:sendExternal', async (_event, termApp: string, text: string, cwd?: string) => {
    return sendToExternalTerminal(termApp as 'terminal' | 'iterm2' | 'ghostty', text, cwd)
  })

  // Git operations
  ipcMain.handle('git:createWorktree', async (_event, projectDir: string, branchName: string) => {
    return createWorktree(projectDir, branchName)
  })
}
