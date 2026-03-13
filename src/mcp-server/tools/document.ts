import { readFile, writeFile, readAgentData } from '../../main/file-service'
import { parsePages, updatePageContent, addNewPage } from '../../renderer/src/lib/page-utils'
import type { AgentSession } from '../../renderer/src/types/agent'

export async function openDocument(filePath: string) {
  const content = await readFile(filePath)
  const pages = parsePages(content)

  let sessions: AgentSession[] | null = null
  const agentRaw = await readAgentData(filePath)
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
  if (pageIndex !== undefined) {
    const current = await readFile(filePath)
    const updated = updatePageContent(current, pageIndex, content)
    await writeFile(filePath, updated)
    return { success: true, message: `Page ${pageIndex} updated` }
  }
  await writeFile(filePath, content)
  return { success: true, message: 'Document written' }
}

export async function addPage(filePath: string, pageName: string) {
  const current = await readFile(filePath)
  const updated = addNewPage(current, pageName)
  await writeFile(filePath, updated)
  const pages = parsePages(updated)
  return {
    success: true,
    pageIndex: pages.length - 1,
    totalPages: pages.length
  }
}
