import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join, parse } from 'path'

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
