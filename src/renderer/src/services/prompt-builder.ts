import { SYSTEM_PROMPT } from '@/lib/constants'

export function buildAnalysisPrompt(markdown: string, basePrdContext?: string | null): {
  system: string
  user: string
} {
  let userPrompt = ''

  if (basePrdContext) {
    userPrompt += `Here is the base PRD for context:\n\n---\n\n${basePrdContext}\n\n---\n\nNow analyze the following feature/iteration page and provide questions to improve it:\n\n---\n\n${markdown}\n\n---\n\nReturn ONLY a valid JSON object.`
  } else {
    userPrompt = `Please analyze the following markdown document and provide questions to improve it:\n\n---\n\n${markdown}\n\n---\n\nReturn ONLY a valid JSON object.`
  }

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt
  }
}

export function buildCopyMessage(
  filePath: string,
  pageName: string,
  pageIndex: number
): string {
  if (pageIndex > 0) {
    return `I have a requirements document at: ${filePath}

Please read this file. The document contains multiple pages separated by \`---\` followed by \`# [Page Name]\` headers.

Use the "Base PRD" section (content before the first \`---\` page break) as background context, then focus on implementing the feature described in the page titled "${pageName}" (the section starting with \`# [${pageName}]\`).

Only implement the requirements from the "${pageName}" page.`
  }

  return `I have a requirements document at: ${filePath}

Please read this file and implement the project based on the "Base PRD" section (the content before the first \`---\` page break). Ignore any subsequent feature pages.`
}
