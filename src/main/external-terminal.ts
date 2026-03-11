import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

type TerminalApp = 'terminal' | 'iterm2' | 'ghostty'

export async function sendToExternalTerminal(
  app: TerminalApp,
  text: string,
  cwd?: string
): Promise<void> {
  const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const cdCmd = cwd ? `cd '${cwd.replace(/'/g, "'\\''")}'` : ''

  let script: string
  switch (app) {
    case 'terminal':
      script = cdCmd
        ? `tell application "Terminal"
          activate
          do script "${cdCmd} && ${escapedText}"
        end tell`
        : `tell application "Terminal"
          activate
          do script "${escapedText}"
        end tell`
      break
    case 'iterm2':
      script = `tell application "iTerm"
        activate
        tell current session of current window
          ${cdCmd ? `write text "${cdCmd}"` : ''}
          write text "${escapedText}"
        end tell
      end tell`
      break
    case 'ghostty':
      script = `tell application "Ghostty"
        activate
      end tell
      delay 0.5
      tell application "System Events"
        tell process "Ghostty"
          ${cdCmd ? `keystroke "${cdCmd}" & return` : ''}
          keystroke "${escapedText}"
          key code 36
        end tell
      end tell`
      break
  }

  const escaped = script.replace(/'/g, "'\\''")
  await execAsync(`osascript -e '${escaped}'`)
}
