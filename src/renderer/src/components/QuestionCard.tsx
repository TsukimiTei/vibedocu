import { useState, useRef, useCallback } from 'react'
import type { Question, QuestionOption } from '@/types/agent'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'
import { explainOptions, type ExplainOptionsResult } from '@/services/openrouter-service'
import { useSettingsStore } from '@/stores/settings-store'
import { useAgentStore } from '@/stores/agent-store'
import { extractAnswerText, buildQABlock, type UpdateDocumentAnswerFn } from '@/lib/qa-utils'

interface QuestionCardProps {
  question: Question
  onInsert: (text: string) => void
  onUpdateDocumentAnswer?: UpdateDocumentAnswerFn
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

/** Get a display summary for an answered question */
function getAnswerSummary(question: Question): string {
  if (!question.answer) return ''
  const answerText = extractAnswerText(question.answer)
  if (!answerText) return ''
  if (question.type === 'multiple-choice') {
    return answerText
  }
  // Open-ended: first line, truncated
  const firstLine = answerText.split('\n')[0]
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine
}

export function QuestionCard({ question, onInsert, onUpdateDocumentAnswer }: QuestionCardProps) {
  const [customInput, setCustomInput] = useState('')
  const [explainResult, setExplainResult] = useState<ExplainOptionsResult | null>(
    () => explainCache.get(question.id) ?? null
  )
  const [explaining, setExplaining] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [showExplain, setShowExplain] = useState(false)
  const abortRef = useRef(false)

  // Reopen state
  const [reopened, setReopened] = useState(false)
  const [conflictAnswer, setConflictAnswer] = useState<string | null>(null)
  const [reopenInput, setReopenInput] = useState('')

  const isMultipleChoice = question.type === 'multiple-choice' && question.options

  const insertQA = (answer: string) => {
    onInsert(buildQABlock(question.text, answer))
  }

  /** Resolve an option click into an answer string, then pass to the submit fn */
  const resolveOption = (option: QuestionOption | string, submit: (answer: string) => void) => {
    const optText = getOptionText(option)
    if (isSelectAll(option) && question.options) {
      submit(buildSelectAllAnswer(question.options, optText))
    } else {
      submit(optText)
    }
  }

  /** Resolve custom text input into an answer string, then pass to the submit fn */
  const resolveCustomInput = (input: string, submit: (answer: string) => void) => {
    const trimmed = input.trim()
    if (!trimmed) return
    if (SELECT_ALL_PATTERNS.test(trimmed) && question.options) {
      submit(buildSelectAllAnswer(question.options, trimmed))
    } else {
      submit(trimmed)
    }
  }

  const handleInsertQuestion = () => {
    const text = `\n\n**Q: ${question.text}**\n\nA: `
    onInsert(text)
  }

  const handleCustomSubmit = () => {
    resolveCustomInput(customInput, insertQA)
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

  const collapseExplain = () => {
    setShowExplain(false)
    abortRef.current = true
    setExplaining(false)
  }

  // --- Reopen handlers ---

  const resetReopenState = () => {
    setReopened(false)
    setConflictAnswer(null)
    setReopenInput('')
  }

  const handleToggleReopen = () => {
    if (reopened) {
      resetReopenState()
    } else {
      setReopened(true)
      if (question.type === 'open-ended') {
        setReopenInput(extractAnswerText(question.answer || ''))
      }
    }
  }

  /** Submit a new answer for a reopened question */
  const submitReopenAnswer = (newAnswerText: string) => {
    if (!onUpdateDocumentAnswer) return

    const result = onUpdateDocumentAnswer(
      question.text,
      newAnswerText,
      question.answer || '',
      false
    )

    if (result === 'conflict') {
      setConflictAnswer(newAnswerText)
      return
    }

    useAgentStore.getState().updateAnswer(question.id, buildQABlock(question.text, newAnswerText))
    resetReopenState()
  }

  const handleForceOverwrite = () => {
    if (!conflictAnswer || !onUpdateDocumentAnswer) return

    onUpdateDocumentAnswer(question.text, conflictAnswer, question.answer || '', true)
    useAgentStore.getState().updateAnswer(question.id, buildQABlock(question.text, conflictAnswer))
    resetReopenState()
  }

  // --- Shared options rendering ---

  const renderOptionsList = (
    onOptionClick: (option: QuestionOption | string) => void,
    currentAnswer?: string
  ) => (
    <>
      {/* Explain button */}
      <div className="flex gap-2 mb-3">
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
      </div>

      {/* Options */}
      <div className="space-y-2 mb-3">
        {question.options!.map((option, i) => {
          const optText = getOptionText(option)
          const selectAll = isSelectAll(option)
          const highlighted = currentAnswer !== undefined && optText === currentAnswer
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
                onClick={() => onOptionClick(option)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded border text-sm transition-colors cursor-pointer',
                  highlighted
                    ? 'border-accent-green/50 bg-accent-green/10 text-accent-green'
                    : selectAll
                      ? 'border-accent-blue/30 text-accent-blue hover:bg-accent-blue/10 hover:border-accent-blue/50'
                      : 'border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-accent-blue/30'
                )}
              >
                {highlighted && <span className="mr-1.5">●</span>}
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

        {/* Collapse explain */}
        {showExplain && (explainResult || explaining) && (
          <button
            onClick={collapseExplain}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer font-mono"
          >
            收起解释
          </button>
        )}
      </div>
    </>
  )

  // --- Answered state (collapsed / reopened) ---

  if (question.answered) {
    const answerSummary = getAnswerSummary(question)
    const previousAnswer = extractAnswerText(question.answer || '')

    return (
      <Card className={cn(
        'transition-all duration-200',
        reopened
          ? 'border-accent-blue/30'
          : 'opacity-70 border-accent-green/20 hover:opacity-90 cursor-pointer'
      )}>
        {/* Header — always visible, clickable to toggle */}
        <div
          className={cn('flex items-start gap-2 mb-2', !reopened && 'cursor-pointer')}
          onClick={!reopened ? handleToggleReopen : undefined}
        >
          <span className="text-xs font-semibold text-accent-green font-mono shrink-0">
            &#10003; 已添加
          </span>
          <span
            className={cn(
              'text-xs font-semibold uppercase tracking-wider shrink-0',
              categoryColors[question.category] || 'text-text-muted'
            )}
          >
            {question.category}
          </span>
          <div className="flex-1" />
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleReopen() }}
            className="text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer font-mono shrink-0"
          >
            {reopened ? '收起 ▲' : '展开 ▼'}
          </button>
        </div>

        <h3 className={cn(
          'text-sm leading-snug mb-1',
          reopened ? 'text-text-primary font-semibold' : 'text-text-secondary'
        )}>
          {question.text}
        </h3>

        {/* Answer summary — visible when collapsed */}
        {!reopened && answerSummary && (
          <p className="text-xs text-text-muted mt-1 font-mono truncate">
            A: {answerSummary}
          </p>
        )}

        {/* Conflict dialog */}
        {conflictAnswer && (
          <div className="mt-3 p-3 rounded-lg border border-accent-orange/30 bg-accent-orange/5">
            <p className="text-sm text-accent-orange font-medium mb-2">
              文档中的答案已被手动修改
            </p>
            <p className="text-xs text-text-muted mb-3">
              是否用新答案覆盖文档中的内容？
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" onClick={handleForceOverwrite}>
                覆盖
              </Button>
              <Button size="sm" variant="ghost" onClick={resetReopenState}>
                保留原文
              </Button>
            </div>
          </div>
        )}

        {/* Reopened: show options / input */}
        {reopened && !conflictAnswer && (
          <div className="mt-3 pt-3 border-t border-border/50">
            {isMultipleChoice && renderOptionsList(
              (opt) => resolveOption(opt, submitReopenAnswer),
              previousAnswer
            )}

            {/* Text input for custom / open-ended answer */}
            <div className="flex gap-2">
              <input
                value={reopenInput}
                onChange={(e) => setReopenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    resolveCustomInput(reopenInput, submitReopenAnswer)
                  }
                }}
                placeholder={isMultipleChoice ? '或输入自定义答案...' : '修改你的答案...'}
                className="flex-1 px-3 py-2 rounded border border-border bg-bg-tertiary text-sm text-text-primary outline-none focus:border-accent-blue/50 placeholder:text-text-muted"
              />
              {reopenInput.trim() && (
                <Button size="md" variant="primary" onClick={() => resolveCustomInput(reopenInput, submitReopenAnswer)}>
                  确认
                </Button>
              )}
            </div>

            {/* Cancel button */}
            <button
              onClick={handleToggleReopen}
              className="mt-2 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer font-mono"
            >
              取消
            </button>
          </div>
        )}
      </Card>
    )
  }

  // --- Unanswered state (original behavior) ---

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

      {isMultipleChoice && renderOptionsList((opt) => resolveOption(opt, insertQA))}

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
