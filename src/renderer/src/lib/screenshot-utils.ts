import { useScreenshotStore } from '@/stores/screenshot-store'
import { getPageContent } from '@/lib/page-utils'
import { parseImageRefs } from '@/services/screenshot-service'

export interface ScreenshotCopyContext {
  screenshotsDir: string
  manifestPath: string
  referencedImages: Record<string, string>
}

/**
 * Build screenshot context for Copy Message based on a page's content.
 * Returns null if no screenshots or no #references found.
 */
export function buildScreenshotCtxForPage(
  filePath: string,
  content: string,
  pageIndex: number
): ScreenshotCopyContext | null {
  const manifest = useScreenshotStore.getState().manifest
  if (manifest.screenshots.length === 0) return null

  const pageText = getPageContent(content, pageIndex)
  const refs = parseImageRefs(pageText)
  if (refs.length === 0) return null

  const docName = filePath.split('/').pop()?.replace(/\.md$/, '') || ''
  const referencedImages: Record<string, string> = {}

  for (const ref of refs) {
    const screenshot = ref.id != null
      ? manifest.screenshots.find((s) => s.id === ref.id)
      : manifest.screenshots.find((s) =>
          s.displayName.toLowerCase().includes((ref.name || '').toLowerCase())
        )
    if (screenshot) referencedImages[ref.raw] = screenshot.filename
  }

  if (Object.keys(referencedImages).length === 0) return null

  return {
    screenshotsDir: `./${docName}/screenshots/`,
    manifestPath: `./${docName}/screenshots/manifest.json`,
    referencedImages
  }
}
