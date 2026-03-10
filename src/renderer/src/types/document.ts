export interface DocumentState {
  filePath: string | null
  content: string
  isDirty: boolean
  lastSaved: number | null
}
