import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import './index.css'

const APP_ROUTES = new Set([
  'verify',
  'privacy',
  'terms',
  'contact',
  'login',
  'register',
  'dashboard',
  'app',
  'org',
  'admin',
])

function getRouterBasename() {
  const envBase = import.meta.env.BASE_URL || '/'
  if (envBase !== '/' && envBase !== './') {
    return envBase.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) {
    const firstSegment = window.location.pathname.split('/').filter(Boolean)[0]
    if (firstSegment && !APP_ROUTES.has(firstSegment)) {
      return `/${firstSegment}`
    }
  }
  return '/'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={getRouterBasename()}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
