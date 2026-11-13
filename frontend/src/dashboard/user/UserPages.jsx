import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Award, CheckCircle2, ClipboardList, Clock, FileText, ScanText, Trash2, Upload } from 'lucide-react'
import DataTable from '../../components/DataTable'
import { ConfirmDialog } from '../../components/Modal'
import { FileDropzone } from '../../components/common'
import { Alert, Button, Card, EmptyState, PageHeader, Spinner, StatCard, StatusBadge } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api, { errorMessage } from '../../services/api'
import { formatBytes, formatDate } from '../../utils/format'

export function UserDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const corrections = useApi('/corrections', { page_size: 100 })
  const certs = useApi('/certificates', { page_size: 5 })
  const items = corrections.data?.items || []
  const count = (...s) => items.filter((c) => s.includes(c.status)).length

  return (
    <>
      <PageHeader title={`Hello, ${user.full_name.split(' ')[0]}`} subtitle="Upload certificates, request corrections and track their progress."
        actions={<Button icon={Upload} onClick={() => navigate('/app/upload')}>Upload certificate</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total requests" value={corrections.data?.total ?? '—'} icon={ClipboardList} tone="blue" />
        <StatCard label="In progress" value={corrections.data ? count('submitted', 'under_review') : '—'} icon={Clock} tone="amber" />
        <StatCard label="Approved" value={corrections.data ? count('approved') : '—'} icon={CheckCircle2} tone="emerald" />
        <StatCard label="My certificates" value={certs.data?.total ?? '—'} icon={Award} tone="violet" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent correction requests</h2>
            <Link to="/app/corrections" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          {corrections.loading ? <div className="flex justify-center py-10"><Spinner /></div> : items.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No requests yet" message="Upload a certificate to get started." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link to={`/app/corrections/${c.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                    <div><p className="font-mono text-xs font-semibold text-slate-900">{c.reference}</p><p className="text-xs text-slate-500">{c.organization_name} · {formatDate(c.created_at)}</p></div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent certificates</h2>
            <Link to="/app/certificates" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          {certs.loading ? <div className="flex justify-center py-10"><Spinner /></div> : !certs.data?.items.length ? (
            <EmptyState icon={Award} title="No certificates yet" message="Certificates issued to your email appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {certs.data.items.map((c) => (
                <li key={c.id}>
                  <Link to={`/app/certificates/${c.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                    <div><p className="text-sm font-medium text-slate-900">{c.title}</p><p className="text-xs text-slate-500">{c.organization_name} · {formatDate(c.issue_date)}</p></div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

export function UploadCertificate() {
  const navigate = useNavigate()
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const pick = (f) => {
    setError(null)
    if (f.size > 10 * 1024 * 1024) return setError('File is larger than 10 MB.')
    setFile(f)
  }

  const upload = async () => {
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/documents', fd)
      toast[data.ocr_status === 'completed' ? 'success' : 'info'](data.ocr_status === 'completed' ? 'Text extracted. Please review the fields.' : 'Uploaded. Automatic text extraction was not possible; you can fill in the fields manually.')
      navigate(`/app/documents/${data.id}`)
    } catch (err) {
      setError(errorMessage(err, 'Upload failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Upload certificate" subtitle="We'll read the text with OCR so you can review it and request a correction." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <FileDropzone onFile={pick} disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff" hint="PDF, PNG, JPG, WEBP or TIFF · up to 10 MB · max 10 pages" />
          {error && <div className="mt-4"><Alert type="error">{error}</Alert></div>}
          {file && (
            <div className="mt-6 flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-violet-600" />
                <div><p className="text-sm font-medium text-slate-900">{file.name}</p><p className="text-xs text-slate-500">{formatBytes(file.size)}</p></div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setFile(null)} disabled={busy}>Remove</Button>
                <Button icon={ScanText} loading={busy} onClick={upload}>{busy ? 'Processing…' : 'Upload & extract text'}</Button>
              </div>
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-slate-900">What happens next</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li><strong className="text-slate-900">1.</strong> Your file is validated and stored privately.</li>
            <li><strong className="text-slate-900">2.</strong> OCR extracts the text and identifies fields like name, course and dates.</li>
            <li><strong className="text-slate-900">3.</strong> You review the fields and describe the correction you need.</li>
            <li><strong className="text-slate-900">4.</strong> The issuing organization reviews and, if approved, issues a corrected certificate.</li>
          </ol>
          <div className="mt-6"><Alert type="warning">OCR results help fill in forms. They are not proof that a certificate is authentic.</Alert></div>
        </Card>
      </div>
    </>
  )
}

export function DocumentsList() {
  const navigate = useNavigate()
  const toast = useToast()
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useApi('/documents', { page, page_size: 15 })
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    setBusy(true)
    try {
      await api.delete(`/documents/${toDelete.id}`)
      toast.success('Upload deleted.')
      setToDelete(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'original_filename', header: 'File', render: (r) => <span className="font-medium text-slate-900">{r.original_filename}</span> },
    { key: 'size_bytes', header: 'Size', render: (r) => formatBytes(r.size_bytes) },
    { key: 'ocr_status', header: 'OCR', render: (r) => <StatusBadge status={r.ocr_status} /> },
    { key: 'created_at', header: 'Uploaded', render: (r) => formatDate(r.created_at) },
    { key: 'actions', header: '', className: 'text-right', render: (r) => (
      <button onClick={(e) => { e.stopPropagation(); setToDelete(r) }} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete upload"><Trash2 className="h-4 w-4" /></button>
    ) },
  ]
  return (
    <>
      <PageHeader title="My uploads" subtitle="Certificates you uploaded. Open one to view OCR results or request a correction."
        actions={<Button icon={Upload} onClick={() => navigate('/app/upload')}>Upload</Button>} />
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload}
        onRowClick={(r) => navigate(`/app/documents/${r.id}`)}
        empty={<EmptyState icon={FileText} title="No uploads yet" action={<Button icon={Upload} onClick={() => navigate('/app/upload')}>Upload certificate</Button>} />}
        pagination={data && { page, pageSize: data.page_size, total: data.total, onPage: setPage }} />
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={remove} loading={busy}
        title="Delete upload" confirmLabel="Delete" message={`Permanently delete "${toDelete?.original_filename}"? Uploads attached to a correction request are kept as part of its record and cannot be deleted.`} />
    </>
  )
}
