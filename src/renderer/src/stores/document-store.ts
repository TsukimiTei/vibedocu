import { create } from 'zustand'

interface DocumentStore {
  filePath: string | null
  content: string
  isDirty: boolean
  lastSaved: number | null

  setFilePath: (path: string | null) => void
  setContent: (content: string) => void
  markDirty: () => void
  markSaved: () => void
  reset: () => void
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  filePath: null,
  content: '',
  isDirty: false,
  lastSaved: null,

  setFilePath: (path) => set({ filePath: path }),
  setContent: (content) => set({ content }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false, lastSaved: Date.now() }),
  reset: () => set({ filePath: null, content: '', isDirty: false, lastSaved: null })
}))
