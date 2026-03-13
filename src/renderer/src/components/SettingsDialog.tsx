import { useState, useEffect } from 'react'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { ModelSelector } from './ModelSelector'
import { useSettingsStore } from '@/stores/settings-store'
import { useSmartAgentStore } from '@/stores/smart-agent-store'
import { useDocumentStore } from '@/stores/document-store'
import { chooseDirectory, registerMcpServer, getMcpStatus } from '@/services/file-bridge'
import { relearnStyle } from '@/services/style-service'
import { cn } from '@/lib/utils'
import { toast } from './ui/Toast'
import type { ThemeId } from '@/types/settings'
import type { SmartAgentMode } from '@/types/smart-agent'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const themes: { id: ThemeId; name: string; preview: string }[] = [
  { id: 'dark', name: 'Terminal Dark', preview: '#0a0a0a' },
  { id: 'warm-light', name: 'Warm Light', preview: '#fdf6e3' }
]

const aiModes = [
  { id: 'openrouter' as const, name: 'OpenRouter', desc: 'API Key 调用云端模型' },
  { id: 'mcp' as const, name: 'Claude Code', desc: '通过 MCP 协议，无需 API Key' }
]

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const {
    aiMode, setAiMode,
    apiKey, setApiKey, theme, setTheme,
    obsidianVaultPath, setObsidianVaultPath,
    projectDir, setProjectDir,
    smartAgentMode, setSmartAgentMode,
    styleHistoryDir, setStyleHistoryDir,
    model
  } = useSettingsStore()
  const isLearning = useSmartAgentStore((s) => s.isLearning)
  const [tempKey, setTempKey] = useState(apiKey)
  const [mcpRegistered, setMcpRegistered] = useState(false)
  const [mcpRegistering, setMcpRegistering] = useState(false)

  useEffect(() => {
    if (open && aiMode === 'mcp') {
      getMcpStatus().then((s) => setMcpRegistered(s.registered))
    }
  }, [open, aiMode])

  const handleRegisterMcp = async () => {
    setMcpRegistering(true)
    const result = await registerMcpServer()
    setMcpRegistering(false)
    if (result.success) {
      setMcpRegistered(true)
      toast('已注册到 Claude Code，重启 Claude Code 生效', 'success')
    } else {
      toast(`注册失败: ${result.error}`, 'error')
    }
  }

  const handleSave = () => {
    setApiKey(tempKey.trim())
    onClose()
  }

  const handleChooseVault = async () => {
    const dir = await chooseDirectory()
    if (dir) setObsidianVaultPath(dir)
  }

  const handleChooseProjectDir = async () => {
    const dir = await chooseDirectory()
    if (dir) {
      setProjectDir(dir)
      // Bind to current document if one is open
      const docPath = useDocumentStore.getState().filePath
      if (docPath) {
        useSettingsStore.getState().bindProjectDir(docPath, dir)
      }
    }
  }

  const handleChooseStyleDir = async () => {
    const dir = await chooseDirectory()
    if (dir) setStyleHistoryDir(dir)
  }

  const handleRelearn = async () => {
    if (!styleHistoryDir || !apiKey) return
    useSmartAgentStore.getState().setIsLearning(true)
    try {
      const profile = await relearnStyle(styleHistoryDir, apiKey, model)
      useSmartAgentStore.getState().setStyleProfile(profile)
    } catch (err) {
      console.error('[smart-agent] relearn failed:', err)
    } finally {
      useSmartAgentStore.getState().setIsLearning(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1.5">AI Mode</label>
          <div className="flex gap-2">
            {aiModes.map((m) => (
              <button
                key={m.id}
                onClick={() => setAiMode(m.id)}
                className={`flex-1 px-3 py-2 rounded border text-xs transition-colors cursor-pointer ${
                  aiMode === m.id
                    ? 'border-accent-blue text-text-primary bg-accent-blue/10'
                    : 'border-border text-text-secondary hover:border-border-focus'
                }`}
              >
                <div className="font-medium">{m.name}</div>
                <div className="text-[10px] text-text-muted mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {aiMode === 'openrouter' && (
          <>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">
                OpenRouter API Key
              </label>
              <input
                type="password"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="sk-or-..."
                className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-blue/50 placeholder:text-text-muted font-mono"
              />
              <p className="text-[10px] text-text-muted mt-1">
                Get your key at openrouter.ai/keys
              </p>
            </div>

            <ModelSelector />
          </>
        )}

        {aiMode === 'mcp' && (
          <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/5 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${mcpRegistered ? 'bg-accent-green' : 'bg-accent-orange'}`} />
                <span className="text-xs text-text-secondary">
                  {mcpRegistered ? 'Claude Code 已连接' : 'Claude Code 未连接'}
                </span>
              </div>
              <Button
                size="sm"
                variant={mcpRegistered ? 'ghost' : 'primary'}
                onClick={handleRegisterMcp}
                disabled={mcpRegistering}
              >
                {mcpRegistering ? '注册中...' : mcpRegistered ? '重新注册' : '一键连接'}
              </Button>
            </div>
            <p className="text-[10px] text-text-muted leading-relaxed">
              {mcpRegistered
                ? '点击 Update 即可自动调用 Claude Code 分析文档，结果自动同步回来。'
                : '点击「一键连接」将 VibeDocs MCP Server 注册到 Claude Code。注册后重启 Claude Code 生效。'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs text-text-muted mb-1.5">
            项目目录
          </label>
          <div className="flex gap-2">
            <div className="flex-1 bg-bg-tertiary border border-border rounded px-3 py-2 text-xs text-text-secondary font-mono truncate min-h-[34px] flex items-center">
              {projectDir || '未配置'}
            </div>
            <Button size="sm" variant="ghost" onClick={handleChooseProjectDir}>
              选择
            </Button>
            {projectDir && (
              <Button size="sm" variant="ghost" onClick={() => setProjectDir('')}>
                清除
              </Button>
            )}
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            Agent 读取项目 context 的目录，与文档路径独立
          </p>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">
            Obsidian Vault 路径
          </label>
          <div className="flex gap-2">
            <div className="flex-1 bg-bg-tertiary border border-border rounded px-3 py-2 text-xs text-text-secondary font-mono truncate min-h-[34px] flex items-center">
              {obsidianVaultPath || '未配置'}
            </div>
            <Button size="sm" variant="ghost" onClick={handleChooseVault}>
              选择
            </Button>
            {obsidianVaultPath && (
              <Button size="sm" variant="ghost" onClick={() => setObsidianVaultPath('')}>
                清除
              </Button>
            )}
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            选择 Obsidian Vault 目录，用于同步文档
          </p>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">
            智能代理
          </label>
          <div className="flex gap-2 mb-2">
            {([
              { mode: 'off' as SmartAgentMode, label: '关闭' },
              { mode: 'mark-only' as SmartAgentMode, label: '仅标识' },
              { mode: 'auto-answer' as SmartAgentMode, label: '直接帮我作答' }
            ]).map((item) => (
              <button
                key={item.mode}
                onClick={() => setSmartAgentMode(item.mode)}
                className={cn(
                  'flex-1 px-3 py-2 rounded border text-xs transition-colors cursor-pointer',
                  smartAgentMode === item.mode
                    ? 'border-accent-purple text-text-primary bg-accent-purple/10'
                    : 'border-border text-text-secondary hover:border-border-focus'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {smartAgentMode !== 'off' && (
            <div className="space-y-2 mt-2">
              <div className="flex gap-2">
                <div className="flex-1 bg-bg-tertiary border border-border rounded px-3 py-2 text-xs text-text-secondary font-mono truncate min-h-[34px] flex items-center">
                  {styleHistoryDir || '未配置'}
                </div>
                <Button size="sm" variant="ghost" onClick={handleChooseStyleDir}>
                  选择
                </Button>
                {styleHistoryDir && (
                  <Button size="sm" variant="ghost" onClick={() => setStyleHistoryDir('')}>
                    清除
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-text-muted">
                存储答题风格数据的目录，跨文档共享
              </p>

              {styleHistoryDir && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRelearn}
                  disabled={isLearning || !apiKey}
                  className="w-full"
                >
                  {isLearning ? '学习中...' : '重新学习风格'}
                </Button>
              )}

              <p className="text-[10px] text-accent-orange">
                开启智能代理会增加 Token 消耗（每次分析额外一次 API 调用）
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1.5">Theme</label>
          <div className="flex gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded border text-xs transition-colors cursor-pointer ${
                  theme === t.id
                    ? 'border-accent-blue text-text-primary bg-accent-blue/10'
                    : 'border-border text-text-secondary hover:border-border-focus'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-border shrink-0"
                  style={{ backgroundColor: t.preview }}
                />
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
