import { useSettingsStore } from '@/stores/settings-store'
import { AVAILABLE_MODELS } from '@/lib/constants'

export function ModelSelector() {
  const { model, setModel } = useSettingsStore()

  return (
    <div>
      <label className="block text-xs text-text-muted mb-1.5">Model</label>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-blue/50 appearance-none cursor-pointer"
      >
        {AVAILABLE_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.provider})
          </option>
        ))}
      </select>
    </div>
  )
}
