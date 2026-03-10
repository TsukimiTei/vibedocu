export function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
