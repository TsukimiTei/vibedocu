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
import { AVAILABLE_MODELS } from '@/lib/constants'
import type { ThemeId } from '@/types/settings'
import type { SmartAgentMode } from '@/types/smart-agent'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const themes: { id: ThemeId; name: string; preview: string }[] = [
  { id: 'dark', name: 'Terminal Dark', preview: '#0a0a0a' },
  { id: 'warm-light', name: 'Warm Light', preview: '#fdf6e3' },
  { id: 'sage', name: 'Sage', preview: '#f4f7f4' },
  { id: 'ocean', name: 'Ocean Mist', preview: '#f2f6fa' },
  { id: 'rose', name: 'Dusty Rose', preview: '#faf4f6' },
  { id: 'lavender', name: 'Lavender', preview: '#f6f4fa' }
]

const aiModes = [
  { id: 'openrouter' as const, name: 'OpenRouter', desc: 'API Key 调用云端模型' },
  { id: 'mcp' as const, name: 'Claude Code', desc: '通过 MCP 协议，无需 API Key' }
]

type SettingsTab = 'ai' | 'workspace' | 'agent' | 'appearance'

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'ai', label: 'AI 配置' },
  { id: 'workspace', label: '工作空间' },
  { id: 'agent', label: '智能代理' },
  { id: 'appearance', label: '外观' }
]

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const {
    aiMode, setAiMode,
    apiKey, setApiKey, theme, setTheme,
    obsidianVaultPath, setObsidianVaultPath,
    projectDir, setProjectDir,
    smartAgentMode, setSmartAgentMode,
    styleHistoryDir, setStyleHistoryDir,
    screenshotModel, setScreenshotModel,
    model
  } = useSettingsStore()
  const isLearning = useSmartAgentStore((s) => s.isLearning)
  const [tempKey, setTempKey] = useState(apiKey)
  const [mcpRegistered, setMcpRegistered] = useState(false)
  const [mcpRegistering, setMcpRegistering] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai')

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
    const dir = await chooseDirectory(obsidianVaultPath || undefined)
    if (dir) setObsidianVaultPath(dir)
  }

  const handleChooseProjectDir = async () => {
    const dir = await chooseDirectory(projectDir || undefined)
    if (dir) {
      setProjectDir(dir)
      const docPath = useDocumentStore.getState().filePath
      if (docPath) {
        useSettingsStore.getState().bindProjectDir(docPath, dir)
      }
    }
  }

  const handleChooseStyleDir = async () => {
    const dir = await chooseDirectory(styleHistoryDir || undefined)
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

  const renderDirField = (
    value: string,
    onChoose: () => void,
    onClear: () => void,
    hint: string
  ) => (
    <>
      <div className="bg-bg-tertiary border border-border rounded px-3 py-2.5 text-sm text-text-secondary font-mono break-all min-h-[38px]">
        {value || <span className="text-text-muted">未配置</span>}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-text-muted">{hint}</p>
        <div className="flex gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" onClick={onChoose}>
            选择
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={onClear} className="hover:!text-accent-red">
              清除
            </Button>
          )}
        </div>
      </div>
    </>
  )

  return (
    <Dialog open={open} onClose={onClose} title="设置" className="!max-w-2xl">
      <div className="flex min-h-[420px]">
        {/* Left sidebar tabs */}
        <nav className="w-[130px] shrink-0 border-r border-border pr-4 mr-6 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded text-sm transition-colors cursor-pointer',
                activeTab === tab.id
                  ? 'bg-accent-blue/10 text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right content area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1">
            {/* ===== AI 配置 ===== */}
            {activeTab === 'ai' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm text-text-muted mb-2">模式</label>
                  <div className="flex gap-2">
                    {aiModes.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setAiMode(m.id)}
                        className={cn(
                          'flex-1 px-4 py-3 rounded border text-sm transition-colors cursor-pointer',
                          aiMode === m.id
                            ? 'border-accent-blue text-text-primary bg-accent-blue/10'
                            : 'border-border text-text-secondary hover:border-border-focus'
                        )}
                      >
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-text-muted mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {aiMode === 'openrouter' && (
                  <>
                    <div>
                      <label className="block text-sm text-text-muted mb-2">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={tempKey}
                        onChange={(e) => setTempKey(e.target.value)}
                        placeholder="sk-or-..."
                        className="w-full bg-bg-tertiary border border-border rounded px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue/50 placeholder:text-text-muted font-mono"
                      />
                      <p className="text-xs text-text-muted mt-1.5">
                        Get your key at openrouter.ai/keys
                      </p>
                    </div>
                    <ModelSelector />
                    <div>
                      <label className="block text-sm text-text-muted mb-2">
                        截图分析模型 <span className="text-text-muted/50">(可选)</span>
                      </label>
                      <select
                        value={screenshotModel}
                        onChange={(e) => setScreenshotModel(e.target.value)}
                        className="w-full bg-bg-tertiary border border-border rounded px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue/50 font-mono"
                      >
                        <option value="">与主模型相同</option>
                        {AVAILABLE_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                        ))}
                      </select>
                      <p className="text-xs text-text-muted mt-1.5">
                        用于分析上传截图的多模态模型，留空则使用主模型
                      </p>
                    </div>
                  </>
                )}

                {aiMode === 'mcp' && (
                  <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/5 px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${mcpRegistered ? 'bg-accent-green' : 'bg-accent-orange'}`} />
                        <span className="text-sm text-text-secondary">
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
                    <p className="text-xs text-text-muted leading-relaxed">
                      {mcpRegistered
                        ? '点击 Update 即可自动调用 Claude Code 分析文档，结果自动同步回来。'
                        : '点击「一键连接」将 VibeDocs MCP Server 注册到 Claude Code。注册后重启 Claude Code 生效。'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ===== 工作空间 ===== */}
            {activeTab === 'workspace' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-text-muted mb-2">项目目录</label>
                  {renderDirField(
                    projectDir,
                    handleChooseProjectDir,
                    () => setProjectDir(''),
                    'Agent 读取项目 context 的目录，与文档路径独立'
                  )}
                </div>

                <div>
                  <label className="block text-sm text-text-muted mb-2">Obsidian Vault</label>
                  {renderDirField(
                    obsidianVaultPath,
                    handleChooseVault,
                    () => setObsidianVaultPath(''),
                    '用于同步文档到 Obsidian'
                  )}
                </div>
              </div>
            )}

            {/* ===== 智能代理 ===== */}
            {activeTab === 'agent' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm text-text-muted mb-2">代理模式</label>
                  <div className="flex gap-2">
                    {([
                      { mode: 'off' as SmartAgentMode, label: '关闭' },
                      { mode: 'mark-only' as SmartAgentMode, label: '仅标识' },
                      { mode: 'auto-answer' as SmartAgentMode, label: '直接帮我作答' }
                    ]).map((item) => (
                      <button
                        key={item.mode}
                        onClick={() => setSmartAgentMode(item.mode)}
                        className={cn(
                          'flex-1 px-4 py-3 rounded border text-sm transition-colors cursor-pointer',
                          smartAgentMode === item.mode
                            ? 'border-accent-purple text-text-primary bg-accent-purple/10'
                            : 'border-border text-text-secondary hover:border-border-focus'
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {smartAgentMode !== 'off' && (
                  <>
                    <div>
                      <label className="block text-sm text-text-muted mb-2">风格数据目录</label>
                      {renderDirField(
                        styleHistoryDir,
                        handleChooseStyleDir,
                        () => setStyleHistoryDir(''),
                        '存储答题风格数据，跨文档共享'
                      )}
                    </div>

                    {styleHistoryDir && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleRelearn}
                        disabled={isLearning || !apiKey}
                        className="w-full"
                      >
                        {isLearning ? '学习中...' : '重新学习风格'}
                      </Button>
                    )}

                    <p className="text-xs text-accent-orange">
                      开启智能代理会增加 Token 消耗（每次分析额外一次 API 调用）
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ===== 外观 ===== */}
            {activeTab === 'appearance' && (
              <div>
                <label className="block text-sm text-text-muted mb-3">主题</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded border text-sm transition-colors cursor-pointer',
                        theme === t.id
                          ? 'border-accent-blue text-text-primary bg-accent-blue/10'
                          : 'border-border text-text-secondary hover:border-border-focus'
                      )}
                    >
                      <span
                        className="w-6 h-6 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: t.preview }}
                      />
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer — fixed at bottom */}
          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
