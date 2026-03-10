import { useState } from 'react'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { ModelSelector } from './ModelSelector'
import { useSettingsStore } from '@/stores/settings-store'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { apiKey, setApiKey } = useSettingsStore()
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
