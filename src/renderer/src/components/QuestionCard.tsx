import { useState, useRef, useCallback } from 'react'
import type { Question, QuestionOption } from '@/types/agent'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'
import { explainOptions, type ExplainOptionsResult } from '@/services/openrouter-service'
import { useSettingsStore } from '@/stores/settings-store'

interface QuestionCardProps {
  question: Question
  onInsert: (text: string) => void
}

const categoryColors: Record<string, string> = {
  'Problem Statement': 'text-accent-red',
  'Target Users': 'text-accent-orange',
  'User Stories': 'text-accent-purple',
  'Functional Requirements': 'text-accent-blue',
  'Non-Functional Requirements': 'text-accent-green',
  'Technical Constraints': 'text-accent-orange',
  'Edge Cases': 'text-accent-red',
  'Success Metrics': 'text-accent-green'
}

const SELECT_ALL_PATTERNS = /以上都要|以上全部|全部都要|都要|all of the above/i

// Session-level cache for explain results (keyed by question id)
const explainCache = new Map<string, ExplainOptionsResult>()

function getOptionText(opt: QuestionOption | string): string {
  return typeof opt === 'string' ? opt : opt.text
}

function isSelectAll(opt: QuestionOption | string): boolean {
  if (typeof opt === 'string') return SELECT_ALL_PATTERNS.test(opt)
  return opt.type === 'select-all' || SELECT_ALL_PATTERNS.test(opt.text)
}

function buildSelectAllAnswer(options: (QuestionOption | string)[], selectedText: string): string {
  const otherTexts = options
    .filter((o) => !isSelectAll(o))
    .map(getOptionText)
  return `${selectedText}（包括：${otherTexts.join('、')}）`
}

export function QuestionCard({ question, onInsert }: QuestionCardProps) {
  const [customInput, setCustomInput] = useState('')
  const [explainResult, setExplainResult] = useState<ExplainOptionsResult | null>(
    () => explainCache.get(question.id) ?? null
  )
  const [explaining, setExplaining] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [showExplain, setShowExplain] = useState(false)
  const abortRef = useRef(false)

  const insertQA = (answer: string) => {
    const text = `\n\n**Q: ${question.text}**\n\nA: ${answer}\n`
    onInsert(text)
  }

  const handleOptionClick = (option: QuestionOption | string) => {
    const optText = getOptionText(option)
    if (isSelectAll(option) && question.options) {
      insertQA(buildSelectAllAnswer(question.options, optText))
    } else {
      insertQA(optText)
    }
  }

  const handleInsertQuestion = () => {
    const text = `\n\n**Q: ${question.text}**\n\nA: `
    onInsert(text)
  }

  const handleCustomSubmit = () => {
    const trimmed = customInput.trim()
    if (!trimmed) return
    if (SELECT_ALL_PATTERNS.test(trimmed) && question.options) {
      insertQA(buildSelectAllAnswer(question.options, trimmed))
    } else {
      insertQA(trimmed)
    }
    setCustomInput('')
  }

  const handleExplain = useCallback(async () => {
    if (!question.options) return

    // Use cache if available
    const cached = explainCache.get(question.id)
    if (cached) {
      setExplainResult(cached)
      setVisibleCount(cached.explanations.length)
      setShowExplain(true)
      return
    }

    setExplaining(true)
    setShowExplain(true)
    setVisibleCount(0)
    abortRef.current = false

    const { apiKey, model } = useSettingsStore.getState()
    const optionTexts = question.options
      .filter((o) => !isSelectAll(o))
      .map(getOptionText)

    try {
      const result = await explainOptions(question.text, optionTexts, model, apiKey)
      if (abortRef.current) return

      explainCache.set(question.id, result)
      setExplainResult(result)

      // Reveal explanations one by one with animation
      for (let i = 1; i <= result.explanations.length; i++) {
        if (abortRef.current) return
        await new Promise((r) => setTimeout(r, 150))
        setVisibleCount(i)
      }
    } catch (err) {
      console.error('[explain-options] error:', err)
    } finally {
      setExplaining(false)
    }
  }, [question.id, question.text, question.options])

  if (question.answered) {
    return (
      <Card className="transition-all duration-200 opacity-60 border-accent-green/20">
        <div className="flex items-start gap-2 mb-2">
          <span className="text-xs font-semibold text-accent-green font-mono">&#10003; 已添加</span>
          <span
            className={cn(
              'text-xs font-semibold uppercase tracking-wider',
              categoryColors[question.category] || 'text-text-muted'
            )}
          >
            {question.category}
          </span>
        </div>
        <h3 className="text-sm text-text-muted leading-snug line-through decoration-text-muted/30">{question.text}</h3>
      </Card>
    )
  }

  const isMultipleChoice = question.type === 'multiple-choice' && question.options

  return (
    <Card className="transition-all duration-200">
      <div className="flex items-start gap-2 mb-2">
        <span
          className={cn(
            'text-xs font-semibold uppercase tracking-wider',
            categoryColors[question.category] || 'text-text-muted'
          )}
        >
          {question.category}
        </span>
        {isMultipleChoice && (
          <span className="text-xs text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">
            Choice
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold text-text-primary leading-snug mb-3">{question.text}</h3>

      <div className="flex gap-2 mb-4">
        {isMultipleChoice && (
          <button
            onClick={handleExplain}
            disabled={explaining}
            className={cn(
              'flex-1 px-3 py-1.5 rounded border border-dashed text-sm transition-colors cursor-pointer font-mono',
              explaining
                ? 'border-accent-blue/30 text-accent-blue/60 cursor-wait'
                : 'border-text-muted text-text-muted hover:border-accent-blue hover:text-accent-blue'
            )}
          >
            {explaining ? '> 分析中...' : '> 解释选项'}
          </button>
        )}
        <button
          onClick={handleInsertQuestion}
          className={cn(
            'px-3 py-1.5 rounded border border-dashed border-text-muted text-sm text-text-muted hover:border-accent-green hover:text-accent-green transition-colors cursor-pointer font-mono',
            isMultipleChoice ? 'flex-1' : 'w-full'
          )}
        >
          &gt; 添加到文档 _
        </button>
      </div>

      {isMultipleChoice && (
        <div className="space-y-2 mb-4">
          {question.options!.map((option, i) => {
            const optText = getOptionText(option)
            const selectAll = isSelectAll(option)
            // Find matching explanation (skip select-all options)
            const explanation = showExplain && explainResult && !selectAll
              ? explainResult.explanations.find((e) => e.optionText === optText)
              : null
            const explanationIndex = explanation
              ? explainResult!.explanations.indexOf(explanation)
              : -1
            const isVisible = explanationIndex >= 0 && explanationIndex < visibleCount

            return (
              <div key={i}>
                <button
                  onClick={() => handleOptionClick(option)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded border text-sm transition-colors cursor-pointer',
                    selectAll
                      ? 'border-accent-blue/30 text-accent-blue hover:bg-accent-blue/10 hover:border-accent-blue/50'
                      : 'border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-accent-blue/30'
                  )}
                >
                  {optText}
                </button>
                {isVisible && explanation && (
                  <div className="ml-3 mt-1 mb-1 pl-3 border-l-2 border-accent-blue/20 animate-fadeIn">
                    <p className="text-xs text-text-muted leading-relaxed">{explanation.explanation}</p>
                  </div>
                )}
              </div>
            )
          })}

          {/* Summary */}
          {showExplain && explainResult && visibleCount >= explainResult.explanations.length && (
            <div className="mt-3 px-3 py-2 rounded bg-bg-tertiary border border-border/50 animate-fadeIn">
              <p className="text-xs text-text-secondary leading-relaxed">{explainResult.summary}</p>
            </div>
          )}

          {/* Collapse button */}
          {showExplain && (explainResult || explaining) && (
            <button
              onClick={() => {
                setShowExplain(false)
                abortRef.current = true
                setExplaining(false)
              }}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer font-mono"
            >
              收起解释
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCustomSubmit()
          }}
          placeholder="输入你的答案..."
          className="flex-1 px-3 py-2 rounded border border-border bg-bg-tertiary text-sm text-text-primary outline-none focus:border-accent-blue/50 placeholder:text-text-muted"
        />
        {customInput.trim() && (
          <Button size="md" variant="primary" onClick={handleCustomSubmit}>
            确认
          </Button>
        )}
      </div>
    </Card>
  )
}
