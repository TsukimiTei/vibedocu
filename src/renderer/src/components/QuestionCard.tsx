import { useState } from 'react'
import type { Question } from '@/types/agent'
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

export function QuestionCard({ question, onInsert }: QuestionCardProps) {
  const [customInput, setCustomInput] = useState('')

  const insertQA = (answer: string) => {
    const text = `\n\n**Q: ${question.text}**\n\nA: ${answer}\n`
    onInsert(text)
  }

  const handleInsertQuestion = () => {
    const text = `\n\n**Q: ${question.text}**\n\nA: `
    onInsert(text)
  }

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return
    insertQA(customInput.trim())
    setCustomInput('')
  }

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        question.answered && 'opacity-50'
      )}
    >
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
          {question.options.map((option, i) => (
            <button
              key={i}
              onClick={() => insertQA(option)}
              className="w-full text-left px-3 py-2 rounded border border-border text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-accent-blue/30 transition-colors cursor-pointer"
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCustomSubmit()
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
