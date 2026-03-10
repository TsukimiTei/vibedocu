import { useState } from 'react'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'

interface OnboardingDialogProps {
  open: boolean
  onClose: () => void
}

const steps = [
  {
    title: '欢迎使用 VibeDocs',
    content: (
      <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
        <p className="text-base text-text-primary font-medium">
          写需求文档，不再是你一个人的事。
        </p>
        <p>
          在 vibe coding 时代，我们用 AI 写代码。但 AI 写出好代码的前提是——你得给它一份足够详细的需求文档。
        </p>
        <p>
          问题是，大多数人写需求时会遗漏关键细节：边界情况、技术约束、成功指标……这些缺失会直接导致 AI 生成的代码质量下降。
        </p>
        <p className="text-text-primary font-medium">
          VibeDocs 通过 AI Agent 不断向你提问，帮你把需求文档打磨到"可以直接交给 coding agent"的程度。
        </p>
      </div>
    )
  },
  {
    title: '核心工作流',
    content: (
      <div className="space-y-4 text-sm text-text-secondary leading-relaxed">
        <div className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-xs font-bold">1</span>
          <div>
            <p className="text-text-primary font-medium">写下你的想法</p>
            <p>在右侧编辑器中用一句话描述你想做的产品，不用担心写得不完善。</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-xs font-bold">2</span>
          <div>
            <p className="text-text-primary font-medium">点击 Update</p>
            <p>AI 会从 8 个维度分析你的文档，生成针对性的问题。</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-xs font-bold">3</span>
          <div>
            <p className="text-text-primary font-medium">回答问题</p>
            <p>选择选项、输入自定义答案、或直接添加到文档后在编辑器里展开回答。</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center text-xs font-bold">4</span>
          <div>
            <p className="text-text-primary font-medium">重复直到完成度足够高</p>
            <p>左侧进度条会实时显示文档完成度，目标是让每个维度都得到充分覆盖。</p>
          </div>
        </div>
      </div>
    )
  },
  {
    title: '最后一步',
    content: (
      <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
        <p>
          当完成度足够高时，点击工具栏的 <span className="text-text-primary font-medium">Copy Message</span>，会生成一段完整的 prompt，包含文件路径和文档全文。
        </p>
        <p>
          将它粘贴给任何 coding agent（Claude Code、Cursor、Copilot…），就能获得高质量的代码实现。
        </p>
        <div className="mt-4 p-3 rounded-lg border border-border bg-bg-tertiary">
          <p className="text-xs text-text-muted mb-2">快捷键</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <span className="text-text-muted">Cmd+S</span><span className="text-text-primary">保存文档</span>
            <span className="text-text-muted">Cmd+O</span><span className="text-text-primary">打开文件</span>
            <span className="text-text-muted">Cmd+N</span><span className="text-text-primary">新建文档</span>
          </div>
        </div>
        <p className="text-text-primary font-medium mt-4">
          现在，开始写下你的第一个想法吧。
        </p>
      </div>
    )
  }
]

export function OnboardingDialog({ open, onClose }: OnboardingDialogProps) {
  const [step, setStep] = useState(0)
  const isLast = step === steps.length - 1

  const handleNext = () => {
    if (isLast) {
      setStep(0)
      onClose()
    } else {
      setStep(step + 1)
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  return (
    <Dialog
      open={open}
      onClose={() => { setStep(0); onClose() }}
      title={steps[step].title}
      className="!max-w-lg"
    >
      <div className="min-h-[260px]">
        {steps[step].content}
      </div>

      <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-accent-blue' : 'bg-border'
              }`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={handleBack}>上一步</Button>
          )}
          {step === 0 && (
            <Button variant="ghost" onClick={() => { setStep(0); onClose() }}>跳过</Button>
          )}
          <Button variant="primary" onClick={handleNext}>
            {isLast ? '开始使用' : '下一步'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
