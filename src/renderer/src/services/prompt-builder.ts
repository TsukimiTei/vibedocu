import { SYSTEM_PROMPT, FILE_SELECTION_PROMPT } from '@/lib/constants'

export interface ImageData {
  index: number
  base64: string
  mimeType: string
}

export type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mimeType: string }

export function buildAnalysisPrompt(
  markdown: string,
  basePrdContext?: string | null,
  projectContext?: string | null,
  images?: ImageData[]
): {
  system: string
  userContent: UserContentPart[]
} {
  let systemPrompt = SYSTEM_PROMPT

  if (projectContext) {
    systemPrompt +=
      '\n\n你已经获取了用户项目目录中的 context 信息。请在提问时隐式参考这些项目信息，让问题更贴近用户的实际项目，但不要直接引用文件名或代码片段。'
  }

  if (images && images.length > 0) {
    systemPrompt +=
      '\n\n用户的文档中包含截图/图片。这些图片已按照文档中出现的顺序编号（图 1、图 2、图 3...）。请仔细观察每张图片的内容（UI 截图、流程图、草图等），将图片信息作为重要 context 纳入你的分析和提问中。如果图片展示了 UI 设计或交互流程，请结合图片内容提出更精准的问题。'
  }

  // Build user content parts (multimodal)
  const userContent: UserContentPart[] = []

  let textPrompt = ''

  if (projectContext) {
    textPrompt += `Here is the project context from the project directory:\n\n---\n\n${projectContext}\n\n---\n\n`
  }

  if (basePrdContext) {
    textPrompt += `Here is the base PRD for context:\n\n---\n\n${basePrdContext}\n\n---\n\nNow analyze the following feature/iteration page and provide questions to improve it:\n\n---\n\n${markdown}\n\n---\n\n`
  } else {
    textPrompt += `Please analyze the following markdown document and provide questions to improve it:\n\n---\n\n${markdown}\n\n---\n\n`
  }

  if (images && images.length > 0) {
    textPrompt += `\n\n以下是文档中的 ${images.length} 张图片，按文档中出现的顺序排列：\n`
  }

  userContent.push({ type: 'text', text: textPrompt })

  // Add images in order
  if (images && images.length > 0) {
    for (const img of images) {
      userContent.push({ type: 'text', text: `\n--- 图 ${img.index} ---\n` })
      userContent.push({
        type: 'image',
        image: img.base64,
        mimeType: img.mimeType
      })
    }
    userContent.push({ type: 'text', text: '\n\nReturn ONLY a valid JSON object.' })
  } else {
    // Append to the last text part
    userContent[0] = {
      type: 'text',
      text: userContent[0].text + 'Return ONLY a valid JSON object.'
    }
  }

  return {
    system: systemPrompt,
    userContent
  }
}

export function buildPartialAnalysisPrompt(
  selectedText: string,
  fullPageContent: string,
  customQuestion?: string,
  basePrdContext?: string | null
): {
  system: string
  userContent: UserContentPart[]
} {
  let systemPrompt = SYSTEM_PROMPT

  systemPrompt +=
    '\n\n用户选中了文档中的一段文字，请针对这段选中内容进行分析和提问。'

  let textPrompt = ''

  if (basePrdContext) {
    textPrompt += `Here is the base PRD for context:\n\n---\n\n${basePrdContext}\n\n---\n\n`
  }

  textPrompt += `Full page content for reference:\n\n---\n\n${fullPageContent}\n\n---\n\n`
  textPrompt += `Selected text to analyze:\n\n---\n\n${selectedText}\n\n---\n\n`

  if (customQuestion) {
    textPrompt += `User's specific question about this selection: ${customQuestion}\n\n`
  }

  textPrompt += 'Return ONLY a valid JSON object.'

  const userContent: UserContentPart[] = [{ type: 'text', text: textPrompt }]

  return { system: systemPrompt, userContent }
}

export function buildFileSelectionPrompt(
  markdown: string,
  fileManifest: string[]
): { system: string; user: string } {
  const manifestText = fileManifest.join('\n')

  return {
    system: FILE_SELECTION_PROMPT,
    user: `用户正在编写的需求文档：\n\n---\n\n${markdown}\n\n---\n\n项目文件列表：\n${manifestText}\n\n请选择最相关的文件，返回 JSON。`
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

