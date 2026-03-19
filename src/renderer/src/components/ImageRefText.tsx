import { useState } from 'react'
import { useScreenshotStore } from '@/stores/screenshot-store'
import { ScreenshotPreview } from './ScreenshotPreview'

interface ImageRefTextProps {
  text: string
  className?: string
}

/**
 * Renders text with #N image references highlighted as interactive tags.
 * Hover shows thumbnail tooltip, click opens preview.
 */
export function ImageRefText({ text, className }: ImageRefTextProps) {
  const screenshots = useScreenshotStore((s) => s.manifest.screenshots)
  const thumbnails = useScreenshotStore((s) => s.thumbnails)
  const [previewId, setPreviewId] = useState<number | null>(null)

  if (screenshots.length === 0) {
    return <span className={className}>{text}</span>
  }

  // Split text by #references — only match #\d+ (numeric refs are unambiguous)
  // Name refs (#setting) are handled at analysis time, not in inline rendering
  // to avoid false positives with markdown headings
  const regex = /#(\d+)(?!\d)/g
  const parts: Array<{ type: 'text' | 'ref'; content: string; screenshotId?: number }> = []
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }

    const id = parseInt(match[1], 10)
    const screenshot = screenshots.find((s) => s.id === id)

    if (screenshot) {
      parts.push({ type: 'ref', content: match[0], screenshotId: screenshot.id })
    } else {
      parts.push({ type: 'text', content: match[0] })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) })
  }

  // Find preview screenshot
  const previewScreenshot = previewId != null ? screenshots.find((s) => s.id === previewId) : null
  const previewIndex = previewScreenshot ? screenshots.indexOf(previewScreenshot) : -1

  return (
    <>
      <span className={className}>
        {parts.map((part, i) => {
          if (part.type === 'text') {
            return <span key={i}>{part.content}</span>
          }

          const ss = screenshots.find((s) => s.id === part.screenshotId)
          const thumb = ss ? thumbnails[ss.filename] : undefined
          const name = ss?.displayName || ss?.analysis?.name || ''

          return (
            <span
              key={i}
              className="relative inline-block group/ref"
            >
              <span
                className="text-accent-blue font-mono cursor-pointer hover:underline"
                onClick={() => setPreviewId(part.screenshotId!)}
              >
                {part.content}
              </span>
              {/* Hover tooltip with thumbnail */}
              {thumb && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/ref:block z-50 pointer-events-none">
                  <span className="block w-[120px] rounded-lg overflow-hidden border border-border bg-bg-primary shadow-xl">
                    <img src={thumb} alt={name} className="w-full h-auto" />
                    <span className="block px-1.5 py-1 text-[10px] text-text-secondary font-mono truncate">
                      {part.content} {name}
                    </span>
                  </span>
                </span>
              )}
            </span>
          )
        })}
      </span>

      {/* Preview lightbox */}
      {previewScreenshot && previewIndex >= 0 && (
        <ScreenshotPreview
          screenshot={previewScreenshot}
          thumbnailSrc={thumbnails[previewScreenshot.filename] || ''}
          onClose={() => setPreviewId(null)}
          onPrev={previewIndex > 0 ? () => setPreviewId(screenshots[previewIndex - 1].id) : undefined}
          onNext={previewIndex < screenshots.length - 1 ? () => setPreviewId(screenshots[previewIndex + 1].id) : undefined}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < screenshots.length - 1}
        />
      )}
    </>
  )
}
