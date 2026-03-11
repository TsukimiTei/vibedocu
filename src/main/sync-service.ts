import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  copyFile,
  rename as fsRename
} from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname, basename } from 'path'

export interface SyncResult {
  success: boolean
  error?: string
  conflict?: boolean
}

export async function checkSyncConflict(filePath: string, vaultPath: string): Promise<boolean> {
  const fileName = basename(filePath)
  const destPath = join(vaultPath, fileName)
  return existsSync(destPath)
}

export function syncFileExists(vaultPath: string, fileName: string): boolean {
  return existsSync(join(vaultPath, fileName))
}

export async function renameSyncedFile(
  vaultPath: string,
  oldFileName: string,
  newFileName: string
): Promise<SyncResult> {
  try {
    const oldPath = join(vaultPath, oldFileName)
    const newPath = join(vaultPath, newFileName)
    if (!existsSync(oldPath)) {
      return { success: false, error: 'Vault 中不存在旧文件' }
    }
    if (existsSync(newPath)) {
      return { success: false, error: `Vault 中已存在 ${newFileName}` }
    }
    await fsRename(oldPath, newPath)
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function syncToVault(
  filePath: string,
  vaultPath: string,
  overwrite: boolean = false
): Promise<SyncResult> {
  try {
    // Validate vault path exists
    if (!vaultPath || !existsSync(vaultPath)) {
      return { success: false, error: 'Vault 路径不存在，请在设置中重新配置' }
    }

    // Validate source file exists
    if (!filePath || !existsSync(filePath)) {
      return { success: false, error: '源文件不存在' }
    }

    const fileName = basename(filePath)
    const destMdPath = join(vaultPath, fileName)

    // Check conflict
    if (!overwrite && existsSync(destMdPath)) {
      return { success: false, conflict: true }
    }

    // Read source md
    const content = await fsReadFile(filePath, 'utf-8')
    const docDir = dirname(filePath)

    // Collect image references and their replacements
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
    const replacements: Array<{ original: string; replacement: string }> = []
    let match: RegExpExecArray | null

    while ((match = imageRegex.exec(content)) !== null) {
      const imgPath = match[2]
      // Only handle relative paths (skip http/https/absolute)
      if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('/')) {
        continue
      }
      const srcImgPath = join(docDir, imgPath)
      if (existsSync(srcImgPath)) {
        const imgFileName = basename(imgPath)
        const destImgPath = join(vaultPath, imgFileName)
        await copyFile(srcImgPath, destImgPath)
        if (imgPath !== imgFileName) {
          replacements.push({ original: imgPath, replacement: imgFileName })
        }
      }
    }

    // Apply image path replacements
    let syncedContent = content
    for (const { original, replacement } of replacements) {
      syncedContent = syncedContent.split(original).join(replacement)
    }

    // Write synced md to vault
    await fsWriteFile(destMdPath, syncedContent, 'utf-8')

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync-service] syncToVault error:', message)
    return { success: false, error: `同步失败: ${message}` }
  }
}
