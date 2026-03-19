import { create } from 'zustand'
import type { Screenshot, ScreenshotManifest, ReorderHistoryEntry } from '@/types/screenshot'
import { createEmptyManifest } from '@/types/screenshot'
import {
  readScreenshotManifest,
  writeScreenshotManifest,
  saveScreenshot as saveScreenshotFile,
  deleteScreenshotFile,
  readScreenshotBase64
} from '@/services/file-bridge'

interface ThumbnailCache {
  [filename: string]: string // data URI
}

interface ScreenshotStore {
  manifest: ScreenshotManifest
  thumbnails: ThumbnailCache
  isLoaded: boolean
  /** Batch upload debounce timer ID */
  _uploadTimerId: ReturnType<typeof setTimeout> | null
  /** Pending uploads waiting for batch analysis */
  _pendingAnalysis: number[]

  // Actions
  loadManifest: (docPath: string) => Promise<void>
  saveManifest: (docPath: string) => Promise<void>
  addScreenshot: (docPath: string, buffer: ArrayBuffer, filename: string) => Promise<Screenshot>
  removeScreenshot: (docPath: string, screenshotId: number) => Promise<{ referencedIn: string[] } | null>
  updateScreenshotName: (id: number, newName: string) => void
  updateScreenshotAnalysis: (id: number, analysis: Screenshot['analysis']) => void
  setScreenshotStatus: (id: number, status: Screenshot['status']) => void
  reorderScreenshots: (newOrder: number[]) => ReorderHistoryEntry | null
  applyReorder: (docPath: string) => Promise<void>
  undoReorder: (docPath: string) => Promise<void>
  loadThumbnail: (docPath: string, filename: string) => Promise<string | null>
  loadAllThumbnails: (docPath: string) => Promise<void>
  getNextId: () => number
  getScreenshotByRef: (ref: string) => Screenshot | undefined
  /** Build global index string for AI context (compact, ~2K tokens for 50 images) */
  buildGlobalIndex: () => string
  /** Build detailed analysis for specific screenshot IDs */
  buildDetailedContext: (ids: number[]) => string
  reset: () => void
}

export const useScreenshotStore = create<ScreenshotStore>((set, get) => ({
  manifest: createEmptyManifest(),
  thumbnails: {},
  isLoaded: false,
  _uploadTimerId: null,
  _pendingAnalysis: [],

  loadManifest: async (docPath) => {
    try {
      const raw = await readScreenshotManifest(docPath)
      if (raw) {
        const parsed = JSON.parse(raw) as ScreenshotManifest
        set({ manifest: parsed, isLoaded: true })
      } else {
        set({ manifest: createEmptyManifest(), isLoaded: true })
      }
    } catch {
      set({ manifest: createEmptyManifest(), isLoaded: true })
    }
  },

  saveManifest: async (docPath) => {
    const { manifest } = get()
    await writeScreenshotManifest(docPath, JSON.stringify(manifest, null, 2))
  },

  addScreenshot: async (docPath, buffer, filename) => {
    const { manifest } = get()
    const result = await saveScreenshotFile(docPath, buffer, filename)

    // Extract actual saved filename from path
    const savedFilename = result.relativePath.split('/').pop() || filename

    // Read image dimensions for aspect ratio display
    let width: number | undefined
    let height: number | undefined
    try {
      const blob = new Blob([buffer])
      const bitmap = await createImageBitmap(blob)
      width = bitmap.width
      height = bitmap.height
      bitmap.close()
    } catch { /* dimension capture is best-effort */ }

    const nextId = get().getNextId()
    const screenshot: Screenshot = {
      id: nextId,
      filename: savedFilename,
      displayName: '',
      status: 'pending',
      analysis: null,
      addedAt: Date.now(),
      analyzedAt: null,
      width,
      height
    }

    const updated: ScreenshotManifest = {
      ...manifest,
      screenshots: [...manifest.screenshots, screenshot]
    }
    set({ manifest: updated })

    // Save manifest
    await writeScreenshotManifest(docPath, JSON.stringify(updated, null, 2))

    // Load thumbnail
    get().loadThumbnail(docPath, savedFilename)

    return screenshot
  },

  removeScreenshot: async (docPath, screenshotId) => {
    const { manifest } = get()
    const screenshot = manifest.screenshots.find((s) => s.id === screenshotId)
    if (!screenshot) return null

    // Delete file
    await deleteScreenshotFile(docPath, screenshot.filename)

    // Remove from manifest
    const updated: ScreenshotManifest = {
      ...manifest,
      screenshots: manifest.screenshots.filter((s) => s.id !== screenshotId)
    }
    set({ manifest: updated })
    await writeScreenshotManifest(docPath, JSON.stringify(updated, null, 2))

    // Clean up thumbnail cache
    set((state) => {
      const { [screenshot.filename]: _, ...rest } = state.thumbnails
      return { thumbnails: rest }
    })

    return { referencedIn: [] }
  },

  updateScreenshotName: (id, newName) => {
    set((state) => ({
      manifest: {
        ...state.manifest,
        screenshots: state.manifest.screenshots.map((s) =>
          s.id === id ? { ...s, displayName: newName } : s
        )
      }
    }))
  },

  updateScreenshotAnalysis: (id, analysis) => {
    set((state) => ({
      manifest: {
        ...state.manifest,
        screenshots: state.manifest.screenshots.map((s) =>
          s.id === id
            ? { ...s, analysis, status: 'completed' as const, analyzedAt: Date.now(), displayName: s.displayName || analysis?.name || '' }
            : s
        )
      }
    }))
  },

  setScreenshotStatus: (id, status) => {
    set((state) => ({
      manifest: {
        ...state.manifest,
        screenshots: state.manifest.screenshots.map((s) =>
          s.id === id ? { ...s, status } : s
        )
      }
    }))
  },

  reorderScreenshots: (newOrder) => {
    const { manifest } = get()
    const oldScreenshots = manifest.screenshots

    // Build mapping: old id -> new id (new id = position + 1)
    const mapping: Record<number, number> = {}
    const reordered: Screenshot[] = []
    for (let i = 0; i < newOrder.length; i++) {
      const oldId = newOrder[i]
      const screenshot = oldScreenshots.find((s) => s.id === oldId)
      if (screenshot) {
        const newId = i + 1
        mapping[oldId] = newId
        reordered.push({ ...screenshot, id: newId })
      }
    }

    const historyEntry: ReorderHistoryEntry = {
      timestamp: Date.now(),
      mapping
    }

    set({
      manifest: {
        ...manifest,
        screenshots: reordered,
        lastReorder: historyEntry
      }
    })

    return historyEntry
  },

  applyReorder: async (docPath) => {
    await get().saveManifest(docPath)
  },

  undoReorder: async (docPath) => {
    // Reload from disk (the pre-reorder state)
    await get().loadManifest(docPath)
  },

  loadThumbnail: async (docPath, filename) => {
    const cached = get().thumbnails[filename]
    if (cached) return cached

    const result = await readScreenshotBase64(docPath, filename)
    if (!result) return null

    const dataUri = `data:${result.mimeType};base64,${result.base64}`
    set((state) => ({
      thumbnails: { ...state.thumbnails, [filename]: dataUri }
    }))
    return dataUri
  },

  loadAllThumbnails: async (docPath) => {
    const { manifest } = get()
    for (const screenshot of manifest.screenshots) {
      await get().loadThumbnail(docPath, screenshot.filename)
    }
  },

  getNextId: () => {
    const { manifest } = get()
    if (manifest.screenshots.length === 0) return 1
    return Math.max(...manifest.screenshots.map((s) => s.id)) + 1
  },

  getScreenshotByRef: (ref) => {
    const { manifest } = get()
    // Try numeric ref: #1, #2, ...
    const numMatch = ref.match(/^#(\d+)$/)
    if (numMatch) {
      const id = parseInt(numMatch[1], 10)
      return manifest.screenshots.find((s) => s.id === id)
    }
    // Try name ref: #setting, #homepage, ...
    const nameRef = ref.replace(/^#/, '').toLowerCase()
    return manifest.screenshots.find((s) =>
      s.displayName.toLowerCase().includes(nameRef) ||
      s.analysis?.name.toLowerCase().includes(nameRef)
    )
  },

  buildGlobalIndex: () => {
    const { manifest } = get()
    if (manifest.screenshots.length === 0) return ''

    let index = '# Screenshot Index\n\n'
    for (const s of manifest.screenshots) {
      const name = s.displayName || s.analysis?.name || s.filename
      const summary = s.analysis?.summary || '(未分析)'
      index += `- #${s.id} ${name}: ${summary}\n`
    }
    return index
  },

  buildDetailedContext: (ids) => {
    const { manifest } = get()
    let context = ''
    for (const id of ids) {
      const s = manifest.screenshots.find((sc) => sc.id === id)
      if (!s || !s.analysis) continue
      context += `\n## #${s.id} ${s.displayName || s.analysis.name}\n`
      context += `Features: ${s.analysis.features.join(', ')}\n`
      context += `UI Elements: ${s.analysis.uiElements.join(', ')}\n`
      if (Object.keys(s.analysis.navigation).length > 0) {
        context += `Navigation: ${JSON.stringify(s.analysis.navigation)}\n`
      }
    }
    return context
  },

  reset: () => {
    const { _uploadTimerId } = get()
    if (_uploadTimerId) clearTimeout(_uploadTimerId)
    set({
      manifest: createEmptyManifest(),
      thumbnails: {},
      isLoaded: false,
      _uploadTimerId: null,
      _pendingAnalysis: []
    })
  }
}))
