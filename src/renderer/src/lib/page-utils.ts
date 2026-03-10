export interface Page {
  name: string
  content: string
}

/**
 * Page delimiter convention:
 *   \n\n---\n\n# [Page Name]
 *
 * A `---` is only treated as a page break when immediately followed
 * by a `# [...]` heading. Regular `---` horizontal rules are untouched.
 */
const PAGE_BREAK = /\n+---\n+(?=# \[)/

export function parsePages(fullContent: string): Page[] {
  const sections = fullContent.split(PAGE_BREAK)

  if (sections.length === 1) {
    return [{ name: 'Base PRD', content: fullContent }]
  }

  return sections.map((section, i) => {
    if (i === 0) {
      return { name: 'Base PRD', content: section }
    }
    const match = section.match(/^# \[(.+?)\]/)
    const name = match ? match[1] : `Page ${i}`
    return { name, content: section }
  })
}

export function serializePages(pages: Page[]): string {
  return pages.map((page) => page.content).join('\n\n---\n\n')
}

export function getPageContent(fullContent: string, pageIndex: number): string {
  const pages = parsePages(fullContent)
  return pages[pageIndex]?.content || ''
}

export function updatePageContent(
  fullContent: string,
  pageIndex: number,
  newPageContent: string
): string {
  const pages = parsePages(fullContent)
  if (pages[pageIndex]) {
    pages[pageIndex].content = newPageContent
  }
  return serializePages(pages)
}

export function addNewPage(fullContent: string, pageName: string): string {
  const pageContent = `# [${pageName}]\n\n`
  const trimmed = fullContent.trimEnd()
  return trimmed + '\n\n---\n\n' + pageContent
}
