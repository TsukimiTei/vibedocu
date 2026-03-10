import { SYSTEM_PROMPT } from '@/lib/constants'

export function buildAnalysisPrompt(markdown: string): {
  system: string
  user: string
} {
  return {
    system: SYSTEM_PROMPT,
    user: `Please analyze the following markdown document and provide questions to improve it:\n\n---\n\n${markdown}\n\n---\n\nReturn ONLY a valid JSON object.`
  }
}

export function buildCopyMessage(filePath: string, markdown: string): string {
  return `I have a requirements document at: ${filePath}

Here is the current content:

\`\`\`markdown
${markdown}
\`\`\`

Please help me implement this project based on the requirements above.`
}
