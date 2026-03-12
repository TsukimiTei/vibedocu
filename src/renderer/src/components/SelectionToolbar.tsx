import { useState, useEffect, useRef, useCallback } from 'react'

interface SelectionToolbarProps {
  /** The container element to watch for text selections */
  containerRef: React.RefObject<HTMLElement | null>
  onAskAgent: (selectedText: string) => void
  onCustomAsk: (selectedText: string, question: string) => void
}

export function SelectionToolbar({ containerRef, onAskAgent, onCustomAsk }: SelectionToolbarProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [selectedText, setSelectedText] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [customQuestion, setCustomQuestion] = useState('')
  const toolbarRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hideToolbar = useCallback(() => {
    setVisible(false)
    setShowInput(false)
    setCustomQuestion('')
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        // Delay hide to allow clicking toolbar buttons
        setTimeout(() => {
          const sel = window.getSelection()
          if (!sel || sel.isCollapsed) hideToolbar()
        }, 200)
        return
      }

      // Check if selection is within the editor container
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return

      const text = selection.toString().trim()
      if (!text || text.length < 2) {
        hideToolbar()
        return
      }

      setSelectedText(text)

      // Position toolbar above the selection
      const rect = range.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      setPosition({
        top: rect.top - containerRect.top - 44,
        left: rect.left - containerRect.left + rect.width / 2
      })
      setVisible(true)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [containerRef, hideToolbar])

  // Hide on click outside toolbar
  useEffect(() => {
    if (!visible) return
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        // Don't hide immediately — let selectionchange handle it
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [visible])

  // Focus input when expanded
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showInput])

  const handleAskAgent = () => {
    onAskAgent(selectedText)
    hideToolbar()
    window.getSelection()?.removeAllRanges()
  }

  const handleCustomSubmit = () => {
    if (!customQuestion.trim()) return
    onCustomAsk(selectedText, customQuestion.trim())
    hideToolbar()
    window.getSelection()?.removeAllRanges()
  }

  if (!visible) return null

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 flex flex-col items-center"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)'
      }}
    >
      <div className="flex items-center gap-1 bg-bg-secondary border border-border rounded-lg shadow-lg px-1.5 py-1">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAskAgent}
          className="text-[11px] font-mono text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10 px-2.5 py-1.5 rounded transition-colors cursor-pointer whitespace-nowrap"
        >
          Ask Agent
        </button>
        <div className="w-px h-4 bg-border" />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowInput(!showInput)}
          className={`text-[11px] font-mono px-2.5 py-1.5 rounded transition-colors cursor-pointer whitespace-nowrap ${
            showInput
              ? 'text-accent-blue bg-accent-blue/10'
              : 'text-text-secondary hover:text-accent-blue hover:bg-accent-blue/10'
          }`}
        >
          自定义提问
        </button>
      </div>

      {showInput && (
        <div className="mt-1 flex items-center gap-1 bg-bg-secondary border border-border rounded-lg shadow-lg px-2 py-1.5 w-[280px]">
          <input
            ref={inputRef}
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCustomSubmit()
              if (e.key === 'Escape') hideToolbar()
            }}
            placeholder="输入你的问题..."
            className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted font-mono"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customQuestion.trim()}
            className="text-[11px] font-mono text-accent-blue hover:bg-accent-blue/10 px-2 py-1 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↵
          </button>
        </div>
      )}
    </div>
  )
}
