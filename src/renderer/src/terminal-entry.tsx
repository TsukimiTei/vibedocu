import React from 'react'
import ReactDOM from 'react-dom/client'
import { TerminalView } from './components/TerminalView'

const style = document.createElement('style')
style.textContent = `
  html, body, #terminal-root {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #0a0a0a;
  }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('terminal-root')!).render(
  <React.StrictMode>
    <TerminalView />
  </React.StrictMode>
)
