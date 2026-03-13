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

export async function readImageFile(
  imagePath: string
): Promise<{ base64: string; mimeType: string } | null> {
  return api.file.readImage(imagePath)
}

export async function renameDocument(
  oldPath: string,
  newName: string
): Promise<{ newPath: string; content: string }> {
  return api.file.rename(oldPath, newName)
}

export async function syncFileExists(vaultPath: string, fileName: string): Promise<boolean> {
  return api.sync.exists(vaultPath, fileName)
}

export async function renameSyncedFile(
  vaultPath: string,
  oldFileName: string,
  newFileName: string
): Promise<{ success: boolean; error?: string }> {
  return api.sync.renameSynced(vaultPath, oldFileName, newFileName)
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

export async function readStyleProfile(dirPath: string): Promise<string | null> {
  if (!api.style) return null
  return api.style.read(dirPath)
}

export async function writeStyleProfile(dirPath: string, data: string): Promise<void> {
  if (!api.style) return
  return api.style.write(dirPath, data)
}

export async function scanProjectFiles(
  projectDir: string,
  excludeFile?: string
): Promise<{ relativePath: string; absolutePath: string; size: number }[]> {
  if (!api.context) return []
  return api.context.scan(projectDir, excludeFile)
}

export async function readContextFiles(
  absolutePaths: string[]
): Promise<{ path: string; content: string }[]> {
  if (!api.context) return []
  return api.context.readFiles(absolutePaths)
}

export async function readContextData(docPath: string): Promise<string | null> {
  if (!api.context) return null
  return api.context.readData(docPath)
}

export async function writeContextData(docPath: string, data: string): Promise<void> {
  if (!api.context) return
  return api.context.writeData(docPath, data)
}
