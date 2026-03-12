import { execFile } from 'child_process'
import { promisify } from 'util'
import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'

const execFileAsync = promisify(execFile)

export interface WorktreeResult {
  success: boolean
  worktreePath?: string
  branchName?: string
  error?: string
}

export async function createWorktree(
  projectDir: string,
  branchName: string
): Promise<WorktreeResult> {
  const repoName = basename(projectDir)
  const slug = branchName.replace(/^feature\//, '').replace(/\//g, '-')
  const worktreePath = join(dirname(projectDir), `${repoName}-wt-${slug}`)

  // If worktree path already exists, verify and reuse it
  if (existsSync(worktreePath)) {
    const dotGit = join(worktreePath, '.git')
    if (existsSync(dotGit)) {
      return { success: true, worktreePath, branchName }
    }
    return { success: false, error: `Path ${worktreePath} already exists but is not a git worktree` }
  }

  try {
    // Fetch latest main from origin
    await execFileAsync('git', ['fetch', 'origin', 'main'], { cwd: projectDir })
      .catch(() => {}) // Continue if fetch fails (offline, no remote)

    // Create worktree with new branch based on origin/main
    try {
      await execFileAsync(
        'git',
        ['worktree', 'add', worktreePath, '-b', branchName, 'origin/main'],
        { cwd: projectDir }
      )
    } catch {
      // Branch might already exist — attach it to a new worktree
      await execFileAsync(
        'git',
        ['worktree', 'add', worktreePath, branchName],
        { cwd: projectDir }
      )
    }

    return { success: true, worktreePath, branchName }
  } catch (err: any) {
    return { success: false, error: err.stderr || err.message || String(err) }
  }
}
