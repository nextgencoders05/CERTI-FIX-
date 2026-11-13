export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const STATUS_STYLES = {
  // certificates
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  revoked: 'bg-red-50 text-red-700 ring-red-600/20',
  superseded: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  // corrections
  submitted: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  under_review: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  rejected: 'bg-red-50 text-red-700 ring-red-600/20',
  cancelled: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  // organizations
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  verified: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  suspended: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  // OCR / verification
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  failed: 'bg-red-50 text-red-700 ring-red-600/20',
  valid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  not_found: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  // roles
  user: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  organization: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  admin: 'bg-violet-50 text-violet-700 ring-violet-600/20',
}

export function humanize(s) {
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export const FIELD_LABELS = {
  recipient_name: 'Recipient name',
  title: 'Certificate title',
  course_or_role: 'Course / role',
  description: 'Description',
  start_date: 'Start date',
  end_date: 'End date',
  issue_date: 'Issue date',
  certificate_number: 'Certificate number',
  organization_name: 'Issuing organization',
  detected_category: 'Detected category',
}

export const CORRECTABLE_FIELDS = ['recipient_name', 'title', 'course_or_role', 'start_date', 'end_date', 'issue_date', 'description']
