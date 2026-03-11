import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalViewProps {
  sessionId: string
  cwd: string
  prompt: string
  pageName: string
  onExit?: (exitCode: number) => void
}

export function TerminalView({ sessionId, cwd, prompt, pageName, onExit }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#60a5fa',
        selectionBackground: '#60a5fa40',
        black: '#1a1a1a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e5e5e5',
        brightBlack: '#525252',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      },
      cursorBlink: true,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    let unsubData: (() => void) | undefined
    let unsubExit: (() => void) | undefined
    let resizeObserver: ResizeObserver | undefined
    let disposed = false

    // Wait for container to have actual dimensions before opening xterm
    requestAnimationFrame(() => {
      if (disposed || !containerRef.current) return

      term.open(containerRef.current)
      fitAddon.fit()

      ;(async () => {
        try {
          await window.api.pty.create(sessionId, cwd, term.cols, term.rows)
        } catch (err: any) {
          term.writeln(`\x1b[31mFailed to create PTY session: ${err.message}\x1b[0m`)
          term.writeln('\x1b[90mTry running: npm run rebuild\x1b[0m')
          return
        }

        if (disposed) return

        // PTY output -> xterm
        unsubData = window.api.pty.onData((id, data) => {
          if (id === sessionId) term.write(data)
        })

        unsubExit = window.api.pty.onExit((id, exitCode) => {
          if (id === sessionId) {
            term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
            onExit?.(exitCode)
          }
        })

        // User input -> PTY
        term.onData((data) => {
          window.api.pty.write(sessionId, data)
        })

        // Resize
        resizeObserver = new ResizeObserver(() => {
          fitAddon.fit()
          window.api.pty.resize(sessionId, term.cols, term.rows)
        })
        resizeObserver.observe(containerRef.current!)

        // Auto-send the claude command with prompt
        setTimeout(() => {
          if (!disposed) {
            const escapedPrompt = prompt.replace(/'/g, "'\\''")
            window.api.pty.write(sessionId, `claude '${escapedPrompt}'\n`)
          }
        }, 500)
      })()
    })

    return () => {
      disposed = true
      unsubData?.()
      unsubExit?.()
      resizeObserver?.disconnect()
      // PTY is NOT destroyed here — it stays alive across page switches.
      // PTY destruction is handled by terminal-store's removeSession/reset.
      term.dispose()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        padding: '8px 0 0 8px'
      }}
    />
  )
}
