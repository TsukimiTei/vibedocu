import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'

interface ReorderChange {
  oldId: number
  newId: number
  name: string
}

interface ReorderPreviewDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  changes: ReorderChange[]
  affectedLocations: Array<{
    page: string
    refs: Array<{ oldId: number; newId: number; line: number; text: string }>
  }>
}

export function ReorderPreviewDialog({
  open,
  onClose,
  onConfirm,
  changes,
  affectedLocations
}: ReorderPreviewDialogProps) {
  const totalAffected = affectedLocations.reduce((sum, loc) => sum + loc.refs.length, 0)

  return (
    <Dialog open={open} onClose={onClose} title="编号变更预览" className="!max-w-lg">
      <div className="space-y-4">
        {/* Mapping table */}
        <div>
          <p className="text-xs text-text-muted mb-2 uppercase tracking-wider">编号映射</p>
          <div className="space-y-1 max-h-[160px] overflow-y-auto">
            {changes.filter((c) => c.oldId !== c.newId).map((c) => (
              <div key={c.oldId} className="flex items-center gap-2 text-xs font-mono px-2 py-1 rounded bg-bg-secondary">
                <span className="text-accent-red">#{c.oldId}</span>
                <span className="text-text-muted">→</span>
                <span className="text-accent-green">#{c.newId}</span>
                <span className="text-text-muted ml-2 truncate">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Affected references */}
        {totalAffected > 0 && (
          <div>
            <p className="text-xs text-text-muted mb-2 uppercase tracking-wider">
              受影响的引用 ({totalAffected} 处)
            </p>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {affectedLocations.map((loc) => (
                <div key={loc.page} className="text-xs">
                  <p className="text-text-secondary font-medium mb-1">{loc.page}</p>
                  {loc.refs.map((ref, i) => (
                    <div key={i} className="flex items-center gap-2 pl-3 py-0.5 font-mono text-text-muted">
                      <span className="text-text-muted/50">L{ref.line}</span>
                      <span className="text-accent-red">#{ref.oldId}</span>
                      <span>→</span>
                      <span className="text-accent-green">#{ref.newId}</span>
                      <span className="truncate text-text-muted/70">{ref.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {totalAffected === 0 && (
          <p className="text-xs text-text-muted">文档中没有需要更新的 # 引用。</p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            确认变更
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
