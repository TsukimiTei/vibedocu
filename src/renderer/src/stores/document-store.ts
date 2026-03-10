import { create } from 'zustand'

interface DocumentStore {
  filePath: string | null
  content: string
  isDirty: boolean
  lastSaved: number | null
  createdAt: number | null
  lastEdited: number | null

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
  createdAt: null,
  lastEdited: null,

  setFilePath: (path) => set((state) => ({
    filePath: path,
    createdAt: state.createdAt ?? Date.now()
  })),
  setContent: (content) => set({ content, lastEdited: Date.now() }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false, lastSaved: Date.now() }),
  reset: () => set({
    filePath: null, content: '', isDirty: false,
    lastSaved: null, createdAt: null, lastEdited: null
  })
}))
