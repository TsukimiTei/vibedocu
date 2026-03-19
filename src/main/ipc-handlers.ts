import { ipcMain, app, BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { saveAnalysis } from '../mcp-server/tools/analysis'
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
  writeStyleProfile,
} from './file-service'
import { openFileDialog, chooseDirectoryDialog } from './dialog-service'
import { checkSyncConflict, syncToVault, syncFileExists, renameSyncedFile } from './sync-service'
import { scanAllFiles, readFiles } from './context-service'
import { createPtySession, writeToPty, resizePty, destroyPty } from './pty-service'
import { sendToExternalTerminal } from './external-terminal'
import { createWorktree } from './git-service'
import {
  readManifest,
  writeManifest,
  saveScreenshot,
  deleteScreenshot,
  listScreenshots,
  readScreenshotBase64,
  getScreenshotsDir
} from './screenshot-service'
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
    const p = getSettingsPath()
    // Atomic read-merge-write: prevents multi-window overwrites
    if (existsSync(p)) {
      try {
        const current = JSON.parse(readFileSync(p, 'utf-8'))
        const incoming = JSON.parse(data)
        const curState = current.state || {}
        const newState = incoming.state || {}
        // Deep merge docProjectDirs so per-doc bindings from other windows survive
        const mergedDirs = { ...(curState.docProjectDirs || {}), ...(newState.docProjectDirs || {}) }
        const merged = {
          ...current,
          state: { ...curState, ...newState, docProjectDirs: mergedDirs }
        }
        writeFileSync(p, JSON.stringify(merged), 'utf-8')
        return
      } catch { /* fall through to raw write */ }
    }
    writeFileSync(p, data, 'utf-8')
  })
  ipcMain.handle('dialog:openFile', async () => {
    return openFileDialog()
  })

  ipcMain.handle('dialog:chooseDirectory', async (_event, defaultPath?: string) => {
    return chooseDirectoryDialog(defaultPath)
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
  let cachedClaudePath: string | null = null
  let isWarming = false
  let warmIdleTimer: ReturnType<typeof setTimeout> | null = null
  const WARM_IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes
  const DEFAULT_MAX_TURNS = 1


  function makeCleanEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env }
    delete env.CLAUDECODE
    for (const key of Object.keys(env)) {
      if (key.startsWith('CLAUDE_CODE') || key.startsWith('CLAUDECODE')) {
        delete env[key]
      }
    }
    // Disable OMC hooks to prevent injecting varying context that breaks prompt caching
    env.DISABLE_OMC = '1'
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

  /**
   * Repair common JSON issues from LLM output:
   * - Unescaped double quotes inside string values
   * - Unescaped backslashes
   * - Literal newlines/tabs inside strings
   * - Control characters
   */
  function repairJSON(json: string): string {
    // Phase 1: Remove control characters (except \n \r \t which we handle in phase 2)
    let cleaned = json.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')

    // Phase 2: State-machine repair for unescaped characters inside strings
    const result: string[] = []
    let inString = false
    let escaped = false
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (escaped) { result.push(ch); escaped = false; continue }
      if (ch === '\\' && inString) {
        // Check if this is a valid escape sequence
        const next = cleaned[i + 1]
        if (next && '"\\\/bfnrtu'.includes(next)) {
          result.push(ch)
          escaped = true
        } else {
          // Invalid escape — double the backslash
          result.push('\\\\')
        }
        continue
      }
      if (ch === '"') {
        if (!inString) {
          inString = true
          result.push(ch)
        } else {
          const rest = cleaned.slice(i + 1).trimStart()
          if (!rest || ':,]}'.includes(rest[0])) {
            inString = false
            result.push(ch)
          } else {
            result.push('\\"')
          }
        }
      } else if (inString && (ch === '\n' || ch === '\r')) {
        // Literal newline inside string — escape it
        result.push(ch === '\n' ? '\\n' : '\\r')
      } else if (inString && ch === '\t') {
        result.push('\\t')
      } else {
        result.push(ch)
      }
    }
    return result.join('')
  }

  function extractJSON(text: string): any {
    // Split on ---JSON--- separator first to avoid braces in summary text
    const sepIdx = text.indexOf('---JSON---')
    let jsonPart = sepIdx >= 0 ? text.slice(sepIdx + '---JSON---'.length) : text

    let cleaned = jsonPart.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1)
    }
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
    try {
      return JSON.parse(cleaned)
    } catch {
      // Try repairing unescaped quotes and retry
      return JSON.parse(repairJSON(cleaned))
    }
  }

  const DIMENSIONS = [
    'Problem Statement', 'Target Users', 'User Stories', 'Functional Requirements',
    'Non-Functional Requirements', 'Technical Constraints', 'Edge Cases', 'Success Metrics'
  ]

  function expandCompactJSON(compact: any): { questions: any[]; completeness: any } {
    if (compact.questions) return compact

    const questions = (compact.q || []).map((q: any) => ({
      type: q.t === 'mc' ? 'multiple-choice' : 'open-ended',
      text: q.x,
      category: DIMENSIONS[q.c] || DIMENSIONS[0],
      options: q.o ? q.o.map((text: string) => ({ text })) : undefined
    }))

    const breakdown = DIMENSIONS.map((dim, i) => ({
      dimension: dim,
      score: compact.s?.b?.[i] ?? 0,
      suggestion: compact.s?.g?.[i] ?? ''
    }))

    return {
      questions,
      completeness: { overall: compact.s?.o ?? 0, breakdown }
    }
  }

  async function handleResultAndResolve(
    resultText: string,
    docPath: string,
    pageIndex: number,
    win: BrowserWindow | null,
    stats: { durationMs: number; turns: number; inputTokens: number; outputTokens: number },
    send: (data: any) => void,
    resolve: (value: any) => void
  ) {
    let saved = false
    let parseError: string | undefined
    try {
      const parsed = extractJSON(resultText)
      const expanded = expandCompactJSON(parsed)
      if (expanded.questions && expanded.completeness) {
        await saveAnalysis(docPath, pageIndex, expanded)
        saved = true
        console.log('[mcp] saved analysis directly, questions:', expanded.questions.length)
      } else {
        parseError = 'Missing required fields: questions or completeness'
        console.error('[mcp] parsed JSON missing required fields')
      }
    } catch (err) {
      parseError = err instanceof Error ? err.message : 'JSON parse failed'
      console.error('[mcp] failed to parse/save analysis from result text:', err)
      console.error('[mcp] raw resultText:', resultText.slice(0, 2000))
    }
    // Read updated agent data to include in response
    let agentData: string | null = null
    if (saved) {
      try {
        agentData = await readAgentData(docPath)
      } catch { /* ignore */ }
      // Also push via IPC for file watcher listeners
      if (agentData && win && !win.isDestroyed()) {
        win.webContents.send('agent:changed', agentData)
      }
    }
    // Don't send step:'result' via mcp:progress — let renderer's handleAnalysisResult
    // update questions and isLoading atomically to avoid flash of empty state
    if (saved) {
      resolve({ success: true, stats, agentData })
    } else {
      resolve({ success: false, error: parseError, rawText: resultText, stats })
    }
  }

  const SYSTEM_PROMPT_FOR_CLI = `你是一位资深产品需求分析师。你的任务是阅读用户提供的 markdown 文档，帮助用户不断完善需求，直到文档详细到可以直接交给 Coding Agent 高质量实现。

请用中文提问和分析。

从以下 8 个维度评估文档完成度：
0. 问题陈述 (Problem Statement) - 核心问题是否清晰定义？
1. 目标用户 (Target Users) - 用户画像是否明确？
2. 用户故事 (User Stories) - 有没有具体的使用场景？
3. 功能需求 (Functional Requirements) - 功能和行为是否详细？
4. 非功能需求 (Non-Functional Requirements) - 性能、安全、可访问性？
5. 技术约束 (Technical Constraints) - 技术栈、集成、部署？
6. 边界情况 (Edge Cases) - 异常处理、边界条件？
7. 成功指标 (Success Metrics) - 如何衡量成功？

规则：
- 最多返回 5 个问题
- 问题要具体、可操作
- 尽可能多地生成选择题（mc），只有在完全无法给出合理选项时才使用开放题（oe）
- 判断标准：如果一个问题的答案可以归纳为 2-4 个明确的方向或选项，就必须设为选择题并提供具体选项
- 选择题提供 2-4 个现实、具体的选项
- 当多个选项可以同时选择时，在最后增加一个 "以上都要" 选项
- 各维度评分 0-100
- o 是加权平均
- 优先关注最薄弱的维度
- JSON 字符串值中禁止使用双引号，用单引号或「」代替

输出格式要求：
1. 先用 2-3 句中文总结你对文档的整体判断（这部分会实时展示给用户看）
2. 然后输出分隔符 ---JSON---
3. 最后输出精简 JSON 结果

精简 JSON 格式：
{"q":[{"t":"mc","x":"问题文本","c":0,"o":["选项A","选项B","以上都要"]},{"t":"oe","x":"问题文本","c":3}],"s":{"o":35,"b":[60,20,10,40,0,30,0,10],"g":["建议1","建议2","建议3","建议4","建议5","建议6","建议7","建议8"]}}

字段说明：
- q=问题列表, t=类型(mc选择题/oe开放题), x=问题文本, c=维度索引(0-7), o=选项文本数组
- s=评分, o=总分, b=8维度分数数组(按上述0-7顺序), g=8维度建议数组

示例输出：
文档对核心问题描述清晰，但功能需求缺少具体交互流程，边界情况完全未覆盖。建议优先补充用户故事和异常处理逻辑。
---JSON---
{"q":[{"t":"mc","x":"目标用户主要是哪类人群？","c":1,"o":["独立开发者","企业团队","设计师","以上都要"]}],"s":{"o":35,"b":[60,20,10,40,0,30,0,10],"g":["核心问题描述清晰","需补充用户画像","缺少使用场景","功能列表不完整","未提及性能要求","未明确技术栈","未考虑异常情况","缺少成功指标"]}}`

  interface ClaudeSessionEntry {
    sessionId: string
    contextHash: string
    analysisCount: number
    createdAt: number
    lastUsedAt: number
  }

  // In-memory session cache (no disk persistence — sessions live only while app runs)
  const claudeSessionsMap = new Map<string, ClaudeSessionEntry>()

  function sessionKey(docPath: string, pageIndex: number): string {
    return `${docPath}:${pageIndex}`
  }

  function buildClaudeArgs(maxTurns?: number, resumeSessionId?: string): string[] {
    const args = [
      '-p', '--verbose',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--tools', '',
      '--system-prompt', SYSTEM_PROMPT_FOR_CLI,
      '--strict-mcp-config',
      '--plugin-dir', '/dev/null',
      '--setting-sources', '',
      '--disable-slash-commands'
    ]
    if (resumeSessionId) {
      args.push('--resume', resumeSessionId)
    }
    if (maxTurns != null) {
      args.push('--max-turns', String(maxTurns))
    }
    return args
  }

  function spawnForDoc(claudePath: string, maxTurns?: number, resumeSessionId?: string): ChildProcess {
    console.log('[mcp] spawn: maxTurns=%s, resume=%s', maxTurns || 'unlimited', resumeSessionId || 'none')
    return spawn(claudePath, buildClaudeArgs(maxTurns, resumeSessionId), {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: makeCleanEnv()
    })
  }

  async function warmUp(): Promise<void> {
    if (warmProcess || isWarming) return
    isWarming = true
    try {
      const claudePath = await findClaudeBinary()
      if (!claudePath || warmProcess) return

      console.log('[mcp:warmup] pre-spawning warm process')
      warmProcess = spawnForDoc(claudePath, DEFAULT_MAX_TURNS)
      warmProcess.on('close', () => { warmProcess = null; if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null } })
      warmProcess.on('error', () => { warmProcess = null; if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null } })
      warmProcess.stderr?.on('data', () => {})
      // Kill warm process if idle for too long
      if (warmIdleTimer) clearTimeout(warmIdleTimer)
      warmIdleTimer = setTimeout(() => {
        if (warmProcess) { warmProcess.kill('SIGTERM'); warmProcess = null }
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

  ipcMain.handle('mcp:warmup', async () => {
    await warmUp()
  })

  ipcMain.handle('mcp:analyze', async (_event, prompt: string, docPath: string, options?: { maxTurns?: number; pageIndex?: number; resume?: boolean; contextHash?: string }) => {
    if (claudeProcess) {
      const stale = claudeProcess as any
      if (stale.exitCode !== undefined && (stale.exitCode !== null || stale.killed)) {
        console.warn('[mcp:analyze] clearing stale claudeProcess (exitCode=%s, killed=%s)', stale.exitCode, stale.killed)
        claudeProcess = null
      } else {
        return { success: false, error: 'Analysis already in progress' }
      }
    }

    const sentinel = { __sentinel: true } as any
    claudeProcess = sentinel

    const win = BrowserWindow.fromWebContents(_event.sender)
    const pageIndex = options?.pageIndex ?? 0
    const wantResume = options?.resume === true
    const contextHash = options?.contextHash || ''

    // Resolve session for --resume (in-memory only)
    let resumeSessionId: string | undefined
    if (wantResume) {
      const key = sessionKey(docPath, pageIndex)
      const entry = claudeSessionsMap.get(key)
      if (entry) {
        const hashMatch = !contextHash || entry.contextHash === contextHash
        const countOk = entry.analysisCount < 50
        if (hashMatch && countOk) {
          resumeSessionId = entry.sessionId
          console.log('[mcp:analyze] resuming session %s (count=%d)', resumeSessionId, entry.analysisCount)
        } else {
          console.log('[mcp:analyze] session invalidated (hashMatch=%s, count=%d)', hashMatch, entry.analysisCount)
          claudeSessionsMap.delete(key)
        }
      }
    }

    try {
      let proc: ChildProcess

      const effectiveMaxTurns = options?.maxTurns ?? DEFAULT_MAX_TURNS
      if (resumeSessionId) {
        // Resume path: cold start with --resume (skip warm process)
        if (warmProcess) { warmProcess.kill('SIGTERM'); warmProcess = null }
        if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null }
        const claudePath = await findClaudeBinary()
        if (!claudePath) {
          claudeProcess = null
          return { success: false, error: '找不到 claude 命令，请确认已安装 Claude Code CLI' }
        }
        console.log('[mcp:analyze] resume start (maxTurns=%d, session=%s)', effectiveMaxTurns, resumeSessionId)
        proc = spawnForDoc(claudePath, effectiveMaxTurns, resumeSessionId)
      } else if (warmProcess && effectiveMaxTurns <= DEFAULT_MAX_TURNS) {
        console.log('[mcp:analyze] using pre-warmed process (maxTurns=%d)', DEFAULT_MAX_TURNS)
        proc = warmProcess
        warmProcess = null
        if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null }
      } else {
        if (warmProcess) { warmProcess.kill('SIGTERM'); warmProcess = null }
        if (warmIdleTimer) { clearTimeout(warmIdleTimer); warmIdleTimer = null }
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
        console.log('[mcp:debug] prompt length: %d chars, resume: %s', prompt.length, !!resumeSessionId)
        console.log('[mcp:debug] prompt preview:', prompt.slice(0, 200))

        proc.stdin?.write(prompt)
        proc.stdin?.end()

        let stderr = ''
        let lineBuf = ''
        let resolved = false
        let capturedSessionId: string | undefined
        const send = (data: any) => {
          if (win && !win.isDestroyed()) win.webContents.send('mcp:progress', JSON.stringify(data))
        }

        const handleResult = async (evt: any) => {
          const usage = evt.usage || {}
          const resultStats = {
            durationMs: evt.duration_ms || 0,
            turns: evt.num_turns || 0,
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0
          }
          console.log('[mcp:result] stats:', JSON.stringify(resultStats))
          console.log('[mcp:result] session_id:', evt.session_id || 'none')
          console.log('[mcp:result] full usage:', JSON.stringify(evt.usage))

          if (evt.session_id) {
            capturedSessionId = evt.session_id
          }

          if (claudeProcess === proc) claudeProcess = null
          if (!resolved) {
            resolved = true
            const resultText = typeof evt.result === 'string' ? evt.result : ''

            // Save session in memory for future --resume
            if (capturedSessionId) {
              const key = sessionKey(docPath, pageIndex)
              const existing = claudeSessionsMap.get(key)
              claudeSessionsMap.set(key, {
                sessionId: capturedSessionId,
                contextHash: contextHash,
                analysisCount: (existing?.sessionId === capturedSessionId ? existing.analysisCount : 0) + 1,
                createdAt: existing?.sessionId === capturedSessionId ? existing.createdAt : Date.now(),
                lastUsedAt: Date.now()
              })
              console.log('[mcp:analyze] saved session %s for page %d', capturedSessionId, pageIndex)
            }

            await handleResultAndResolve(resultText, docPath, pageIndex, win, resultStats, send, (val: any) => {
              if (capturedSessionId) val.sessionId = capturedSessionId
              resolve(val)
            })
          }
        }

        proc.stdout?.on('data', (d) => {
          lineBuf += d.toString()
          const lines = lineBuf.split('\n')
          lineBuf = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            let evt: any = null
            try { evt = JSON.parse(line) } catch { continue }

            if (evt.type === 'system') {
              console.log('[mcp:stream] system:', evt.subtype, JSON.stringify(evt).slice(0, 300))
              continue
            }
            if (evt.type === 'rate_limit_event') continue

            if (evt.type === 'stream_event') {
              const inner = evt.event
              if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
                console.log('[mcp:delta] text:', (inner.delta.text || '').slice(0, 30))
                send({ step: 'delta', text: inner.delta.text })
              }
              continue
            }

            if (evt.type === 'assistant') {
              for (const block of (evt.message?.content || [])) {
                if (block.type === 'thinking') {
                  send({ step: 'thinking' })
                } else if (block.type === 'text' && block.text) {
                  send({ step: 'text', text: block.text })
                }
              }
            } else if (evt.type === 'result') {
              handleResult(evt)
            }
          }
        })
        proc.stderr?.on('data', (d) => {
          if (stderr.length < 10_000) stderr += d.toString()
          console.log('[mcp:analyze] stderr:', d.toString().slice(0, 200))
        })

        proc.on('close', async (code) => {
          console.log('[mcp:analyze] exited with code:', code)
          if (claudeProcess === proc) claudeProcess = null
          if (lineBuf.trim() && !resolved) {
            try {
              const evt = JSON.parse(lineBuf)
              if (evt.type === 'result') {
                await handleResult(evt)
                lineBuf = ''
                warmUp().catch(() => {})
                return
              }
            } catch { /* not valid JSON, ignore */ }
            lineBuf = ''
          }
          if (!resolved) {
            resolved = true
            if (resumeSessionId && code !== 0) {
              console.warn('[mcp:analyze] resume failed (code=%d), clearing session', code)
              claudeSessionsMap.delete(sessionKey(docPath, pageIndex))
            }
            if (code === 0) {
              resolve({ success: true })
            } else {
              const errMsg = stderr.slice(0, 500) || `claude exited with code ${code}`
              resolve({ success: false, error: resumeSessionId ? `resume failed: ${errMsg}` : errMsg })
            }
          }
          warmUp().catch(() => {})
        })

        proc.on('error', (err) => {
          console.log('[mcp:analyze] spawn error:', err.message)
          if (claudeProcess === proc) claudeProcess = null
          if (!resolved) {
            resolved = true
            resolve({ success: false, error: err.message })
          }
        })
      }).finally(() => {
        if (claudeProcess === proc) {
          console.warn('[mcp:analyze] safety net: clearing claudeProcess in finally')
          claudeProcess = null
        }
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

  // Lightweight Claude call — no MCP tools, just prompt → text response (streaming)
  ipcMain.handle('mcp:ask', async (_event, prompt: string) => {
    try {
      const claudePath = await findClaudeBinary()
      if (!claudePath) {
        return { success: false, error: '找不到 claude 命令' }
      }
      const win = BrowserWindow.fromWebContents(_event.sender)
      const proc = spawn(claudePath, [
        '-p', '--verbose',
        '--output-format', 'stream-json',
        '--include-partial-messages',
        '--tools', '',
        '--max-turns', '1',
        '--strict-mcp-config',
        '--setting-sources', '',
        '--disable-slash-commands',
        '--plugin-dir', '/dev/null'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: makeCleanEnv()
      })
      proc.stdin?.write(prompt)
      proc.stdin?.end()

      return new Promise<{ success: boolean; text?: string; error?: string }>((resolve) => {
        let resultText = ''
        let lineBuf = ''
        let stderr = ''
        let resolved = false
        const done = (result: { success: boolean; text?: string; error?: string }) => {
          if (resolved) return
          resolved = true
          clearTimeout(timeout)
          resolve(result)
        }
        const sendProgress = (data: any) => {
          if (win && !win.isDestroyed()) win.webContents.send('mcp:progress', JSON.stringify(data))
        }
        // 60s timeout to prevent hanging
        const timeout = setTimeout(() => {
          proc.kill('SIGTERM')
          done({ success: false, error: '请求超时（60s）' })
        }, 60_000)
        proc.stdout?.on('data', (d) => {
          lineBuf += d.toString()
          const lines = lineBuf.split('\n')
          lineBuf = lines.pop() || ''
          for (const line of lines) {
            if (!line.trim()) continue
            let evt: any = null
            try { evt = JSON.parse(line) } catch { continue }

            if (evt.type === 'stream_event') {
              const inner = evt.event
              if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
                sendProgress({ step: 'ask-delta', text: inner.delta.text })
              }
              continue
            }
            if (evt.type === 'result') {
              resultText = typeof evt.result === 'string' ? evt.result : ''
              done({ success: true, text: resultText })
            }
          }
        })
        proc.stderr?.on('data', (d) => { stderr += d.toString() })
        proc.on('close', (code) => {
          if (!resolved) {
            if (code === 0) {
              done({ success: true, text: resultText })
            } else {
              done({ success: false, error: stderr.slice(0, 500) || `exited ${code}` })
            }
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

  // Screenshot management
  ipcMain.handle('screenshot:readManifest', async (_event, docPath: string) => {
    return readManifest(docPath)
  })

  ipcMain.handle('screenshot:writeManifest', async (_event, docPath: string, data: string) => {
    return writeManifest(docPath, data)
  })

  ipcMain.handle(
    'screenshot:save',
    async (_event, docPath: string, imageBuffer: ArrayBuffer, filename: string) => {
      return saveScreenshot(docPath, Buffer.from(imageBuffer), filename)
    }
  )

  ipcMain.handle('screenshot:delete', async (_event, docPath: string, filename: string) => {
    return deleteScreenshot(docPath, filename)
  })

  ipcMain.handle('screenshot:list', async (_event, docPath: string) => {
    return listScreenshots(docPath)
  })

  ipcMain.handle('screenshot:readBase64', async (_event, docPath: string, filename: string) => {
    return readScreenshotBase64(docPath, filename)
  })

  ipcMain.handle('screenshot:getDir', async (_event, docPath: string) => {
    return getScreenshotsDir(docPath)
  })
}
