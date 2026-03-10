import { create } from 'zustand'

interface DocumentStore {
  filePath: string | null
  content: string
  isDirty: boolean
  lastSaved: number | null
  createdAt: number | null
  lastEdited: number | null
  currentPageIndex: number

  setFilePath: (path: string | null) => void
  setContent: (content: string) => void
  markDirty: () => void
  markSaved: () => void
  setCurrentPageIndex: (index: number) => void
  reset: () => void
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  filePath: null,
  content: '',
  isDirty: false,
  lastSaved: null,
  createdAt: null,
  lastEdited: null,
  currentPageIndex: 0,

  setFilePath: (path) => set((state) => ({
    filePath: path,
    createdAt: state.createdAt ?? Date.now()
  })),
  setContent: (content) => set({ content, lastEdited: Date.now() }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () => set({ isDirty: false, lastSaved: Date.now() }),
  setCurrentPageIndex: (index) => set({ currentPageIndex: index }),
  reset: () => set({
    filePath: null, content: '', isDirty: false,
    lastSaved: null, createdAt: null, lastEdited: null,
    currentPageIndex: 0
  })
}))
