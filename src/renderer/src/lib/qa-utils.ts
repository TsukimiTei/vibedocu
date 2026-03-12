/**
 * Utilities for finding and updating Q&A blocks in markdown content.
 *
 * Q&A format:
 *   **Q: question text**
 *
 *   A: answer text
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract just the answer text from a stored answer string.
 * The stored answer is the full formatted Q&A block: "\n\n**Q: ...**\n\nA: answer\n"
 */
export function extractAnswerText(storedAnswer: string): string {
  // Match "A:" that appears after the closing "**" of the question line
  const match = storedAnswer.match(/\*\*\s*\n\s*\nA:\s*(.*)/)
  if (match) return match[1].trim()
  // Fallback: match any standalone "A:" line
  const fallback = storedAnswer.match(/\nA:\s*(.*)/)
  return fallback ? fallback[1].trim() : ''
}

/**
 * Find a Q&A block in markdown by question text.
 * Returns the answer text found in the document, or null if not found.
 */
export function findQAInMarkdown(
  markdown: string,
  questionText: string
): { answer: string } | null {
  const escaped = escapeRegex(questionText)
  const regex = new RegExp(
    `\\*\\*Q:\\s*${escaped}\\*\\*\\s*\\n\\s*\\nA:\\s*([^\\n]*)`,
  )
  const match = regex.exec(markdown)
  if (!match) return null
  return { answer: match[1].trim() }
}

/**
 * Replace the answer in a Q&A block in markdown.
 * Returns the new markdown string with the answer replaced.
 */
export function replaceQAAnswer(
  markdown: string,
  questionText: string,
  newAnswer: string
): string {
  const escaped = escapeRegex(questionText)
  const regex = new RegExp(
    `(\\*\\*Q:\\s*${escaped}\\*\\*\\s*\\n\\s*\\nA:\\s*)([^\\n]*)`,
  )
  return markdown.replace(regex, (_, prefix) => prefix + newAnswer)
}

/**
 * Build a formatted Q&A block for insertion into markdown.
 */
export function buildQABlock(questionText: string, answer: string): string {
  return `\n\n**Q: ${questionText}**\n\nA: ${answer}\n`
}

export type UpdateAnswerResult = 'replaced' | 'conflict' | 'not-found-inserted'

export type UpdateDocumentAnswerFn = (
  questionText: string,
  newAnswer: string,
  storedAnswer: string,
  force?: boolean
) => UpdateAnswerResult
