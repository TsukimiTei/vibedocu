export type ThemeId = 'dark' | 'warm-light' | 'sage' | 'ocean' | 'rose' | 'lavender'

export interface Settings {
  apiKey: string
  model: string
  theme: ThemeId
  recentFiles: string[]
}

export interface ModelOption {
  id: string
  name: string
  provider: string
}
