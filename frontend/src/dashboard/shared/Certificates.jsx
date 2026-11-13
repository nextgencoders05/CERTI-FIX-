import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Award, Download, ExternalLink, FilePlus2, Ban } from 'lucide-react'
import DataTable, { SearchInput } from '../../components/DataTable'
import { ConfirmDialog } from '../../components/Modal'
import { SecureFileViewer } from '../../components/common'
import { Button, Card, DetailRow, EmptyState, ErrorState, PageHeader, PageLoader, StatusBadge, Textarea } from '../../components/ui'
import { useApi, useDebounced } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api, { downloadFile, errorMessage } from '../../services/api'
import { formatDate, formatDateTime } from '../../utils/format'

const BASE = { user: '/app/certificates', organization: '/org/certificates', admin: '/admin/certificates' }

export function CertificatesList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const { data, loading, error, reload } = useApi('/certificates', { q: dq || undefined, status: status || undefined, page, page_size: 15 })

  const titles = { user: 'My certificates', organization: 'Issued certificates', admin: 'All certificates' }
  const columns = [
    { key: 'certificate_number', header: 'Certificate ID', render: (r) => <span className="font-mono text-xs font-semibold text-slate-900">{r.certificate_number}</span> },
    { key: 'recipient_name', header: 'Recipient', render: (r) => <div><p className="font-medium text-slate-900">{r.recipient_name}</p><p className="text-xs text-slate-500">{r.recipient_email || ''}</p></div> },
    { key: 'title', header: 'Title', render: (r) => <div><p>{r.title}</p><p className="text-xs text-slate-500">{r.course_or_role || ''}</p></div> },
    ...(user.role !== 'organization' ? [{ key: 'organization_name', header: 'Issuer' }] : []),
    { key: 'issue_date', header: 'Issued', render: (r) => formatDate(r.issue_date), className: 'whitespace-nowrap' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <>
      <PageHeader title={titles[user.role]} subtitle="Search, preview and download certificates."
        actions={user.role === 'organization' && <Button icon={FilePlus2} onClick={() => navigate('/org/certificates/new')}>Issue certificate</Button>} />
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => navigate(`${BASE[user.role]}/${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search ID, name, email, title…" />
            <select className="input sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="superseded">Superseded</option>
              <option value="revoked">Revoked</option>
            </select>
          </>
        }
        empty={<EmptyState icon={Award} title="No certificates found"
          message={user.role === 'user' ? 'Certificates issued to your email address will appear here.' : 'Issued certificates will appear here.'} />}
        pagination={data && { page, pageSize: data.page_size, total: data.total, onPage: setPage }}
      />
    </>
  )
}

export function CertificateDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const { data: cert, loading, error, reload, setData } = useApi(`/certificates/${id}`)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading && !cert) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!cert) return null

  const revoke = async () => {
    setBusy(true)
    try {
      const { data } = await api.post(`/certificates/${cert.id}/revoke`, { reason })
      setData(data)
      setRevokeOpen(false)
      toast.success('Certificate revoked.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    try {
      await downloadFile(`/certificates/${cert.id}/pdf?download=true`, `${cert.certificate_number}.pdf`)
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed.'))
    }
  }

  const canRevoke = user.role === 'organization' && cert.status === 'active' && user.organization?.status === 'verified'
  return (
    <>
      <PageHeader title={cert.title} subtitle={<span className="font-mono">{cert.certificate_number}</span>}
        actions={
          <>
            <Link to={`/verify/${cert.certificate_number}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" />Public verification
            </Link>
            {cert.has_pdf && <Button variant="secondary" icon={Download} onClick={download}>Download PDF</Button>}
            {canRevoke && <Button variant="danger" icon={Ban} onClick={() => setRevokeOpen(true)}>Revoke</Button>}
          </>
        } />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Certificate details</h2>
          <dl className="mt-2 divide-y divide-slate-100">
            <DetailRow label="Status"><StatusBadge status={cert.status} /></DetailRow>
            <DetailRow label="Recipient">{cert.recipient_name}</DetailRow>
            <DetailRow label="Email">{cert.recipient_email}</DetailRow>
            <DetailRow label="Issuer">{cert.organization_name}</DetailRow>
            <DetailRow label="Category">{cert.category_name}</DetailRow>
            <DetailRow label="Course / role">{cert.course_or_role}</DetailRow>
            <DetailRow label="Period">{cert.start_date || cert.end_date ? `${formatDate(cert.start_date)} – ${formatDate(cert.end_date)}` : '—'}</DetailRow>
            <DetailRow label="Issue date">{formatDate(cert.issue_date)}</DetailRow>
            {cert.supersedes_number && <DetailRow label="Supersedes"><span className="font-mono">{cert.supersedes_number}</span></DetailRow>}
            {Object.entries(cert.extra_fields || {}).map(([k, v]) => <DetailRow key={k} label={k}>{v}</DetailRow>)}
            {cert.revoked_at && <DetailRow label={cert.status === 'revoked' ? 'Revoked' : 'Closed'}>{formatDateTime(cert.revoked_at)}</DetailRow>}
            {cert.revocation_reason && <DetailRow label="Reason">{cert.revocation_reason}</DetailRow>}
          </dl>
        </Card>
        <Card className="p-4 lg:col-span-3">
          {cert.has_pdf ? <SecureFileViewer url={`/certificates/${cert.id}/pdf`} title={cert.certificate_number} /> : <EmptyState title="No PDF available" />}
        </Card>
      </div>
      <ConfirmDialog open={revokeOpen} onClose={() => setRevokeOpen(false)} onConfirm={revoke} loading={busy}
        title="Revoke certificate" confirmLabel="Revoke certificate"
        message={`Revoking ${cert.certificate_number} makes it show as invalid on public verification. This cannot be undone.`}>
        <Textarea className="mt-4" label="Reason (shown on verification)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </>
  )
}
