import { useState } from 'react'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { ModelSelector } from './ModelSelector'
import { useSettingsStore } from '@/stores/settings-store'
import type { ThemeId } from '@/types/settings'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const themes: { id: ThemeId; name: string; preview: string }[] = [
  { id: 'dark', name: 'Terminal Dark', preview: '#0a0a0a' },
  { id: 'warm-light', name: 'Warm Light', preview: '#fdf6e3' }
]

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { apiKey, setApiKey, theme, setTheme } = useSettingsStore()
  const [tempKey, setTempKey] = useState(apiKey)

  const handleSave = () => {
    setApiKey(tempKey.trim())
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Settings">
      <div className="space-y-4">
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
