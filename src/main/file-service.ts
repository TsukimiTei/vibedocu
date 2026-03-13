import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir, rename as fsRename, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join, parse, extname } from 'path'

export async function readFile(filePath: string): Promise<string> {
  return fsReadFile(filePath, 'utf-8')
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await fsWriteFile(filePath, content, 'utf-8')
}

export async function saveImage(
  docPath: string,
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  const docName = parse(docPath).name
  const docDir = dirname(docPath)
  const assetsDir = join(docDir, `${docName}`, 'assets')

  if (!existsSync(assetsDir)) {
    await mkdir(assetsDir, { recursive: true })
  }

  const imagePath = join(assetsDir, filename)
  await fsWriteFile(imagePath, imageBuffer)

  return `./${docName}/assets/${filename}`
}

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp'
}

export async function readImageAsBase64(
  imagePath: string
): Promise<{ base64: string; mimeType: string } | null> {
  if (!existsSync(imagePath)) return null
  try {
    const buffer = await fsReadFile(imagePath)
    const ext = extname(imagePath).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'image/png'
    return { base64: buffer.toString('base64'), mimeType }
  } catch {
    return null
  }
}

/** Rename a document and its associated data directory */
export async function renameDocument(
  oldPath: string,
  newName: string // base name without .md extension
): Promise<{ newPath: string; content: string }> {
  const dir = dirname(oldPath)
  const oldName = parse(oldPath).name
  const newPath = join(dir, `${newName}.md`)

  if (oldPath === newPath) {
    const content = await fsReadFile(oldPath, 'utf-8')
    return { newPath: oldPath, content }
  }

  if (existsSync(newPath)) {
    throw new Error(`文件 ${newName}.md 已存在`)
  }

  // Read content and update image/asset path references
  let content = await fsReadFile(oldPath, 'utf-8')
  content = content.split(`./${oldName}/`).join(`./${newName}/`)

  // Rename data directory if it exists
  const oldDataDir = join(dir, oldName)
  const newDataDir = join(dir, newName)
  if (existsSync(oldDataDir)) {
    await fsRename(oldDataDir, newDataDir)
  }

  // Write new file then delete old
  await fsWriteFile(newPath, content, 'utf-8')
  await unlink(oldPath)

  return { newPath, content }
}

/** Get the path for agent session data file associated with a document */
function getAgentDataPath(docPath: string): string {
  const docName = parse(docPath).name
  const docDir = dirname(docPath)
  return join(docDir, docName, 'agent-sessions.json')
}

export async function readAgentData(docPath: string): Promise<string | null> {
  const dataPath = getAgentDataPath(docPath)
  if (!existsSync(dataPath)) return null
  try {
    return await fsReadFile(dataPath, 'utf-8')
  } catch {
    return null
  }
}

export async function writeAgentData(docPath: string, data: string): Promise<void> {
  const dataPath = getAgentDataPath(docPath)
  const dir = dirname(dataPath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await fsWriteFile(dataPath, data, 'utf-8')
}

/** Get the path for context data file associated with a document */
function getContextDataPath(docPath: string): string {
  const docName = parse(docPath).name
  const docDir = dirname(docPath)
  return join(docDir, docName, 'context-data.json')
}

export async function readContextData(docPath: string): Promise<string | null> {
  const dataPath = getContextDataPath(docPath)
  if (!existsSync(dataPath)) return null
  try {
    return await fsReadFile(dataPath, 'utf-8')
  } catch {
    return null
  }
}

export async function writeContextData(docPath: string, data: string): Promise<void> {
  const dataPath = getContextDataPath(docPath)
  const dir = dirname(dataPath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await fsWriteFile(dataPath, data, 'utf-8')
}

/** Style profile persistence — stored in user-chosen directory */
export async function readStyleProfile(dirPath: string): Promise<string | null> {
  const dataPath = join(dirPath, 'style-profile.json')
  if (!existsSync(dataPath)) return null
  try {
    return await fsReadFile(dataPath, 'utf-8')
  } catch {
    return null
  }
}

export async function writeStyleProfile(dirPath: string, data: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true })
  }
  await fsWriteFile(join(dirPath, 'style-profile.json'), data, 'utf-8')
}

/** Page status persistence */
function getPageStatusPath(docPath: string): string {
  const docName = parse(docPath).name
  const docDir = dirname(docPath)
  return join(docDir, docName, 'page-status.json')
}

export async function readPageStatusData(docPath: string): Promise<string | null> {
  const dataPath = getPageStatusPath(docPath)
  if (!existsSync(dataPath)) return null
  try {
    return await fsReadFile(dataPath, 'utf-8')
  } catch {
    return null
  }
}

export async function writePageStatusData(docPath: string, data: string): Promise<void> {
  const dataPath = getPageStatusPath(docPath)
  const dir = dirname(dataPath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await fsWriteFile(dataPath, data, 'utf-8')
}
