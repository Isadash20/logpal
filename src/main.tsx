import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

async function boot() {
  /* `?seed=demo` on a dev server fills the diary for screenshots. Dead code
     in production: the condition is a build-time constant there. */
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('seed') === 'demo') {
    const { seedDemo } = await import('./dev/seedDemo')
    seedDemo()
    history.replaceState(null, '', location.pathname)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()
