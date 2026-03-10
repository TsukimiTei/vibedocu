import { create } from 'zustand'

interface DocumentStore {
  filePath: string | null
  content: string
  isDirty: boolean
  lastSaved: number | null
  createdAt: number | null
  lastEdited: number | null
  activePageIndex: number

  setFilePath: (path: string | null) => void
  setContent: (content: string) => void
  markDirty: () => void
  markSaved: () => void
  setActivePageIndex: (index: number) => void
  reset: () => void
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  filePath: null,
  content: '',
  isDirty: false,
  lastSaved: null,
  createdAt: null,
  lastEdited: null,
  activePageIndex: 0,

  setFilePath: (path) => set((state) => ({
    filePath: path,
    createdAt: state.createdAt ?? Date.now()
  })),
  setContent: (content) => set({ content, lastEdited: Date.now() }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false, lastSaved: Date.now() }),
  setActivePageIndex: (index) => set({ activePageIndex: index }),
  reset: () => set({
    filePath: null, content: '', isDirty: false,
    lastSaved: null, createdAt: null, lastEdited: null,
    activePageIndex: 0
  })
}))
