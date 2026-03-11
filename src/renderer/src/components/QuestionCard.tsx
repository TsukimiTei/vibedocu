import { useState } from 'react'
import type { Question, QuestionOption } from '@/types/agent'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

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
        {question.type === 'multiple-choice' && (
          <span className="text-xs text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">
            Choice
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold text-text-primary leading-snug mb-3">{question.text}</h3>

      <button
        onClick={handleInsertQuestion}
        className="w-full mb-4 px-3 py-1.5 rounded border border-dashed border-text-muted text-sm text-text-muted hover:border-accent-green hover:text-accent-green transition-colors cursor-pointer font-mono"
      >
        &gt; 添加到文档 _
      </button>

      {question.type === 'multiple-choice' && question.options && (
        <div className="space-y-2 mb-4">
          {question.options.map((option, i) => {
            const optText = getOptionText(option)
            const selectAll = isSelectAll(option)
            return (
              <button
                key={i}
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
            )
          })}
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
