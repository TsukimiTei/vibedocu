export type PageStatus = 'idle' | 'running' | 'developing' | 'completed' | 'failed'

export interface PageStatusEntry {
  status: PageStatus
  updatedAt: number
}

export type PageStatusMap = Record<string, PageStatusEntry>
