export interface ScreenshotAnalysis {
  /** AI-generated page/screen name, e.g. "Homepage", "Settings Page" */
  name: string
  /** List of identified features/functions on this screen */
  features: string[]
  /** List of UI elements identified */
  uiElements: string[]
  /** Page navigation relationships, e.g. { "Enter button": "#5" } */
  navigation: Record<string, string>
  /** One-line description for global index */
  summary: string
}

export type ScreenshotStatus = 'pending' | 'analyzing' | 'completed' | 'failed'

export interface Screenshot {
  /** Sequential number, 1-based */
  id: number
  /** Original filename */
  filename: string
  /** AI-generated or user-edited display name */
  displayName: string
  /** Analysis status */
  status: ScreenshotStatus
  /** Structured analysis result (null if not yet analyzed) */
  analysis: ScreenshotAnalysis | null
  /** Timestamp when added */
  addedAt: number
  /** Timestamp when analysis completed */
  analyzedAt: number | null
  /** Width and height for aspect ratio */
  width?: number
  height?: number
}

export interface ReorderHistoryEntry {
  /** Timestamp of the reorder operation */
  timestamp: number
  /** Mapping: old id -> new id */
  mapping: Record<number, number>
}

export interface ScreenshotManifest {
  /** All screenshots in order */
  screenshots: Screenshot[]
  /** Last reorder operation for crash recovery & undo */
  lastReorder: ReorderHistoryEntry | null
  /** Document-level global summary (generated after multiple images analyzed) */
  globalSummary: string | null
}

export function createEmptyManifest(): ScreenshotManifest {
  return {
    screenshots: [],
    lastReorder: null,
    globalSummary: null
  }
}
