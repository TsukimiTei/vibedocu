const api = window.api

export async function openFile(): Promise<string | null> {
  return api.dialog.openFile()
}

export async function chooseDirectory(): Promise<string | null> {
  return api.dialog.chooseDirectory()
}

export async function readFile(filePath: string): Promise<string> {
  return api.file.read(filePath)
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  return api.file.write(filePath, content)
}

export async function saveImage(
  docPath: string,
  imageBuffer: ArrayBuffer,
  filename: string
): Promise<string> {
  return api.file.saveImage(docPath, imageBuffer, filename)
}

export async function copyToClipboard(text: string): Promise<void> {
  await api.clipboard.writeText(text)
}

export async function checkSyncConflict(filePath: string, vaultPath: string): Promise<boolean> {
  return api.sync.checkConflict(filePath, vaultPath)
}

export async function syncToVault(
  filePath: string,
  vaultPath: string,
  overwrite: boolean = false
): Promise<{ success: boolean; error?: string; conflict?: boolean }> {
  return api.sync.toVault(filePath, vaultPath, overwrite)
}
