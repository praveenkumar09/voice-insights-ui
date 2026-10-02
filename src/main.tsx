import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './capture.css'
import './insights.css'
import './workspace.css'
import './future.css'
import './lifemap.css'
import './modes.css'
import './advicepack.css'
import './exec.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
