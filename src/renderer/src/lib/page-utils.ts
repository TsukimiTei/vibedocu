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

/**
 * Get page body for the editor — strips the # [PageName] heading for non-base pages.
 * This prevents Milkdown from escaping brackets and breaking the delimiter.
 */
export function getPageBody(fullContent: string, pageIndex: number): string {
  const pages = parsePages(fullContent)
  if (!pages[pageIndex]) return ''
  if (pageIndex === 0) return pages[pageIndex].content
  // Strip the # [name] heading line for non-base pages
  const body = pages[pageIndex].content.replace(/^# \[.+?\]\n*/, '')
  // Return at least a newline so the editor renders a valid empty paragraph
  return body || '\n'
}

/**
 * Update page body from editor output — re-adds the # [PageName] heading for non-base pages.
 */
export function updatePageBody(
  fullContent: string,
  pageIndex: number,
  newBody: string
): string {
  const pages = parsePages(fullContent)
  if (!pages[pageIndex]) return fullContent
  if (pageIndex === 0) {
    pages[pageIndex].content = newBody
  } else {
    // Preserve the # [name] heading that the editor doesn't see
    const headingMatch = pages[pageIndex].content.match(/^# \[.+?\]\n*/)
    const heading = headingMatch ? headingMatch[0] : ''
    pages[pageIndex].content = heading + newBody
  }
  return serializePages(pages)
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
  // Body: empty h1 for title + h2 prompt for one-line description
  const pageContent = `# [${pageName}]\n\n# \n\n## 一句话描述你的功能\n`
  const trimmed = fullContent.trimEnd()
  return trimmed + '\n\n---\n\n' + pageContent
}

/** Version numbering: Base PRD = v1.00, then v1.1, v1.2, ... */
export function getPageVersion(pageIndex: number): string {
  if (pageIndex === 0) return 'v1.00'
  return `v1.${pageIndex}`
}

/** Extract the first # heading from a page's body (after the # [PageName] heading) */
export function getPageTitle(fullContent: string, pageIndex: number): string {
  const body = getPageBody(fullContent, pageIndex)
  const match = body.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

export interface ExtractedImage {
  index: number
  src: string
  isDataUri: boolean
}

/**
 * Extract all image references from markdown content, in document order.
 * Returns both file-path images and inline data URI images.
 */
export function extractImages(markdown: string): ExtractedImage[] {
  const images: ExtractedImage[] = []
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  let idx = 1
  while ((match = regex.exec(markdown)) !== null) {
    const src = match[1]
    images.push({
      index: idx++,
      src,
      isDataUri: src.startsWith('data:')
    })
  }
  return images
}

export function renamePage(fullContent: string, pageIndex: number, newName: string): string {
  const pages = parsePages(fullContent)
  if (pageIndex <= 0 || !pages[pageIndex]) return fullContent
  const oldContent = pages[pageIndex].content
  pages[pageIndex].content = oldContent.replace(/^# \[.+?\]/, `# [${newName}]`)
  pages[pageIndex].name = newName
  return serializePages(pages)
}
