import { readFile, writeFile, readAgentData } from '../../main/file-service'
import { parsePages, updatePageContent, addNewPage } from '../../renderer/src/lib/page-utils'
import type { AgentSession } from '../../renderer/src/types/agent'
import { resolve, extname } from 'path'

/** Validate that a path is absolute and points to a .md file. Throws on violation. */
function validateDocPath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') throw new Error('file_path is required')
  const resolved = resolve(filePath)
  if (extname(resolved).toLowerCase() !== '.md') {
    throw new Error('file_path must be a .md file')
  }
  return resolved
}

export async function openDocument(filePath: string) {
  const safePath = validateDocPath(filePath)
  const content = await readFile(safePath)
  const pages = parsePages(content)

  let sessions: AgentSession[] | null = null
  const agentRaw = await readAgentData(safePath)
  if (agentRaw) {
    try {
      sessions = JSON.parse(agentRaw)
    } catch {
      sessions = null
    }
  }

  return {
    content,
    pages: pages.map((p, i) => ({ index: i, name: p.name, content: p.content })),
    sessions
  }
}

export async function writeDocument(
  filePath: string,
  content: string,
  pageIndex?: number
) {
  const safePath = validateDocPath(filePath)
  if (pageIndex !== undefined) {
    const current = await readFile(safePath)
    const updated = updatePageContent(current, pageIndex, content)
    await writeFile(safePath, updated)
    return { success: true, message: `Page ${pageIndex} updated` }
  }
  await writeFile(safePath, content)
  return { success: true, message: 'Document written' }
}

export async function addPage(filePath: string, pageName: string) {
  const safePath = validateDocPath(filePath)
  const current = await readFile(safePath)
  const updated = addNewPage(current, pageName)
  await writeFile(safePath, updated)
  const pages = parsePages(updated)
  return {
    success: true,
    pageIndex: pages.length - 1,
    totalPages: pages.length
  }
}
