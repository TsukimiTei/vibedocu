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
  pageContent: string,
  basePrdContent?: string | null
): string {
  if (basePrdContent) {
    return `I have a requirements document at: ${filePath}

Here is the base PRD:

\`\`\`markdown
${basePrdContent}
\`\`\`

Here is the specific feature/iteration to implement:

\`\`\`markdown
${pageContent}
\`\`\`

Please help me implement this feature based on the base PRD context and the specific requirements above.`
  }

  return `I have a requirements document at: ${filePath}

Here is the current content:

\`\`\`markdown
${pageContent}
\`\`\`

Please help me implement this project based on the requirements above.`
}
