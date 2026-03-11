import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

type TerminalApp = 'terminal' | 'iterm2' | 'ghostty'

/** Escape a string for embedding inside a shell single-quoted argument */
const shellEscape = (s: string): string => s.replace(/'/g, "'\\''")

/** Escape a string for embedding inside an AppleScript double-quoted string */
const asEscape = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export async function sendToExternalTerminal(
  app: TerminalApp,
  prompt: string,
  cwd?: string
): Promise<void> {
  // Layer 1: Build shell command with proper single-quote escaping
  const claudeCmd = `claude '${shellEscape(prompt)}'`
  const cdCmd = cwd ? `cd '${shellEscape(cwd)}'` : ''
  const fullCmd = cdCmd ? `${cdCmd} && ${claudeCmd}` : claudeCmd

  // Layer 2: Escape the shell command for AppleScript double-quoted strings
  const asFullCmd = asEscape(fullCmd)
  const asCdCmd = cdCmd ? asEscape(cdCmd) : ''
  const asClaudeCmd = asEscape(claudeCmd)

  let script: string
  switch (app) {
    case 'terminal':
      script = `tell application "Terminal"
        activate
        do script "${asFullCmd}"
      end tell`
      break
    case 'iterm2':
      script = cdCmd
        ? `tell application "iTerm"
          activate
          tell current session of current window
            write text "${asCdCmd}"
            write text "${asClaudeCmd}"
          end tell
        end tell`
        : `tell application "iTerm"
          activate
          tell current session of current window
            write text "${asClaudeCmd}"
          end tell
        end tell`
      break
    case 'ghostty':
      script = cdCmd
        ? `tell application "Ghostty"
          activate
        end tell
        delay 0.5
        tell application "System Events"
          tell process "Ghostty"
            keystroke "${asCdCmd}" & return
            keystroke "${asClaudeCmd}"
            key code 36
          end tell
        end tell`
        : `tell application "Ghostty"
          activate
        end tell
        delay 0.5
        tell application "System Events"
          tell process "Ghostty"
            keystroke "${asClaudeCmd}"
            key code 36
          end tell
        end tell`
      break
  }

  // Layer 3: Escape the AppleScript for shell single-quoted osascript argument
  const escaped = script.replace(/'/g, "'\\''")
  await execAsync(`osascript -e '${escaped}'`)
}
