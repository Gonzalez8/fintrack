import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'

async function bootstrap() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { worker } = await import('./demo/index')
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    })
  }

  const root = document.getElementById('root')!
  const app = (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )

  // Use hydrateRoot if pre-rendered content exists (SSG), otherwise createRoot
  if (root.children.length > 0) {
    ReactDOM.hydrateRoot(root, app)
  } else {
    ReactDOM.createRoot(root).render(app)
  }
}

bootstrap()
