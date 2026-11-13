import { useId } from 'react'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import { STATUS_STYLES, humanize } from '../utils/format'

const VARIANTS = {
  primary: 'gradient-bg text-white shadow-sm hover:opacity-95 focus-visible:ring-brand-500',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400',
}

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className = '', children, disabled, ...props }) {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}

export function Field({ label, error, hint, children, className = '', htmlFor }) {
  return (
    <div className={className}>
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && !error && <p id={htmlFor && `${htmlFor}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={htmlFor && `${htmlFor}-hint`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function useFieldId(id) {
  const auto = useId()
  return id || auto
}

export function Input({ label, error, hint, className = '', id, ...props }) {
  const fid = useFieldId(id)
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={fid}>
      <input id={fid} className="input" aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${fid}-hint` : undefined} {...props} />
    </Field>
  )
}

export function Textarea({ label, error, hint, className = '', rows = 4, id, ...props }) {
  const fid = useFieldId(id)
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={fid}>
      <textarea id={fid} rows={rows} className="input" aria-invalid={error ? true : undefined} aria-describedby={hint || error ? `${fid}-hint` : undefined} {...props} />
    </Field>
  )
}

export function Select({ label, error, hint, className = '', children, id, ...props }) {
  const fid = useFieldId(id)
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={fid}>
      <select id={fid} className="input" aria-describedby={hint || error ? `${fid}-hint` : undefined} {...props}>{children}</select>
    </Field>
  )
}

export function Card({ className = '', children, ...props }) {
  return <div className={`card ${className}`} {...props}>{children}</div>
}

export function StatusBadge({ status }) {
  if (!status) return null
  const cls = STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 ring-slate-500/20'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{humanize(status)}</span>
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin text-brand-600 ${className}`} />
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="h-7 w-7" />
      {label}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', message, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-brand-50 p-3"><Icon className="h-6 w-6 text-brand-600" /></div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-red-50 p-3"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
      <p className="max-w-md text-sm text-slate-700">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function Alert({ type = 'info', title, children }) {
  const cls = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[type]
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, icon: Icon, tone = 'blue', hint }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600', emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value ?? '—'}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && <div className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div>}
      </div>
    </Card>
  )
}

export function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 sm:col-span-2 break-words">{children ?? '—'}</dd>
    </div>
  )
}
