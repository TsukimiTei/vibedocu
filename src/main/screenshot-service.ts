import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  mkdir,
  unlink,
  readdir
} from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join, parse, extname } from 'path'

/** Get the screenshots directory path for a document */
export function getScreenshotsDir(docPath: string): string {
  const docName = parse(docPath).name
  const docDir = dirname(docPath)
  return join(docDir, docName, 'screenshots')
}

/** Get manifest.json path */
function getManifestPath(docPath: string): string {
  return join(getScreenshotsDir(docPath), 'manifest.json')
}

/** Ensure screenshots directory exists */
async function ensureScreenshotsDir(docPath: string): Promise<string> {
  const dir = getScreenshotsDir(docPath)
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  return dir
}

/** Read manifest.json, returns null if not found */
export async function readManifest(docPath: string): Promise<string | null> {
  const manifestPath = getManifestPath(docPath)
  if (!existsSync(manifestPath)) return null
  try {
    return await fsReadFile(manifestPath, 'utf-8')
  } catch {
    return null
  }
}

/** Write manifest.json */
export async function writeManifest(docPath: string, data: string): Promise<void> {
  const dir = await ensureScreenshotsDir(docPath)
  await fsWriteFile(join(dir, 'manifest.json'), data, 'utf-8')
}

/** Save a screenshot image to the screenshots directory */
export async function saveScreenshot(
  docPath: string,
  imageBuffer: Buffer,
  filename: string
): Promise<{ savedPath: string; relativePath: string }> {
  const dir = await ensureScreenshotsDir(docPath)
  const docName = parse(docPath).name

  // Deduplicate filename if it already exists
  let finalName = filename
  let counter = 1
  while (existsSync(join(dir, finalName))) {
    const ext = extname(filename)
    const base = filename.slice(0, -ext.length)
    finalName = `${base}-${counter}${ext}`
    counter++
  }

  const savedPath = join(dir, finalName)
  await fsWriteFile(savedPath, imageBuffer)

  const relativePath = `./${docName}/screenshots/${finalName}`
  return { savedPath, relativePath }
}

/** Delete a screenshot file */
export async function deleteScreenshot(
  docPath: string,
  filename: string
): Promise<void> {
  const dir = getScreenshotsDir(docPath)
  const filePath = join(dir, filename)
  if (existsSync(filePath)) {
    await unlink(filePath)
  }
}

/** List all image files in the screenshots directory */
export async function listScreenshots(
  docPath: string
): Promise<string[]> {
  const dir = getScreenshotsDir(docPath)
  if (!existsSync(dir)) return []
  try {
    const files = await readdir(dir)
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
    return files.filter((f) => imageExts.includes(extname(f).toLowerCase()))
  } catch {
    return []
  }
}

/** Read a screenshot as base64 for rendering in the UI */
export async function readScreenshotBase64(
  docPath: string,
  filename: string
): Promise<{ base64: string; mimeType: string } | null> {
  const dir = getScreenshotsDir(docPath)
  const filePath = join(dir, filename)
  if (!existsSync(filePath)) return null

  const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  }

  try {
    const buffer = await fsReadFile(filePath)
    const ext = extname(filename).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'image/png'
    return { base64: buffer.toString('base64'), mimeType }
  } catch {
    return null
  }
}
