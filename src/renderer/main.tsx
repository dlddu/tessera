import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/tessera.css'
import './styles/shell.css'

// macOS draws native traffic lights into the inset title bar; flag the document
// so the design-system title bar reserves space for them (see `.is-mac` in CSS).
document.documentElement.classList.toggle('is-mac', window.tessera.meta.platform === 'darwin')

const container = document.getElementById('root')
if (!container) {
  throw new Error('root element (#root) not found')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
