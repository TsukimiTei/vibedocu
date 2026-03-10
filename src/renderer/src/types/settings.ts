export type ThemeId = 'dark' | 'warm-light'

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
