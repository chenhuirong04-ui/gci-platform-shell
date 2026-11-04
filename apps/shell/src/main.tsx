import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
// Dark business workspace colour layer (active via <html data-ws-theme="dark">).
import '../../../packages/design-system/src/workspace-dark.css'
import App from './App.tsx'
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx'
import { installApiAuthFetch } from './lib/apiAuthFetch'

installApiAuthFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
)
