import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { FileUp, ShieldCheck } from 'lucide-react'
import { useAuth, homePath } from '../hooks/useAuth'
import { fetchBlobUrl, errorMessage } from '../services/api'
import { ErrorState, PageLoader } from './ui'

export function Logo({ to = '/', light = false }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <span className="gradient-bg flex h-8 w-8 items-center justify-center rounded-lg">
        <ShieldCheck className="h-5 w-5 text-white" />
      </span>
      <span className={`text-lg font-bold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
        CertiFix <span className={light ? 'text-violet-200' : 'gradient-text'}>AI</span>
      </span>
    </Link>
  )
}

export function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="flex min-h-screen items-center justify-center"><PageLoader /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />
  return children
}

/** Renders an authenticated PDF/image endpoint inside the page via an object URL. */
export function SecureFileViewer({ url, mimeType = 'application/pdf', title = 'Document', className = 'h-[70vh]' }) {
  const [src, setSrc] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let objectUrl
    let cancelled = false
    setSrc(null)
    setError(null)
    fetchBlobUrl(url)
      .then((u) => { objectUrl = u; if (!cancelled) setSrc(u) })
      .catch((e) => !cancelled && setError(errorMessage(e, 'Could not load the file.')))
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url, attempt])

  if (error) return <ErrorState message={error} onRetry={() => setAttempt((a) => a + 1)} />
  if (!src) return <PageLoader label="Loading document…" />
  if (mimeType.startsWith('image/')) {
    return <img src={src} alt={title} className="mx-auto max-h-[70vh] rounded-lg border border-slate-200 object-contain" />
  }
  return <iframe src={src} title={title} className={`w-full rounded-lg border border-slate-200 ${className}`} />
}

export function FileDropzone({ onFile, accept, disabled, hint }) {
  const [drag, setDrag] = useState(false)
  const input = useRef(null)
  const pick = (files) => files?.[0] && onFile(files[0])
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) pick(e.dataTransfer.files) }}
      onClick={() => !disabled && input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'} ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="gradient-bg mb-4 rounded-2xl p-3"><FileUp className="h-7 w-7 text-white" /></div>
      <p className="text-sm font-semibold text-slate-900">Drop your certificate here, or click to browse</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = '' }} />
    </div>
  )
}
