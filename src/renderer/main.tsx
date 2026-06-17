import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/tessera.css'
import './styles/shell.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('root element (#root) not found')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
