import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ClipboardList, Clock, Eye, FileText, Upload, XCircle } from 'lucide-react'
import DataTable, { SearchInput } from '../../components/DataTable'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { SecureFileViewer } from '../../components/common'
import { Alert, Button, Card, DetailRow, EmptyState, ErrorState, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '../../components/ui'
import { useApi, useDebounced } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api, { errorMessage } from '../../services/api'
import { CORRECTABLE_FIELDS, FIELD_LABELS, formatDate, formatDateTime, humanize } from '../../utils/format'

const BASE = { user: '/app/corrections', organization: '/org/corrections', admin: '/admin/corrections' }
const CERT_BASE = { user: '/app/certificates', organization: '/org/certificates', admin: '/admin/certificates' }

export function CorrectionsList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const { data, loading, error, reload } = useApi('/corrections', { q: dq || undefined, status: status || undefined, page, page_size: 15 })

  const titles = {
    user: ['Correction tracking', 'Follow the progress of your correction requests.'],
    organization: ['Correction requests', 'Review correction requests submitted for your certificates.'],
    admin: ['All correction requests', 'Monitor correction requests across the platform.'],
  }
  const columns = [
    { key: 'reference', header: 'Reference', render: (r) => <span className="font-mono text-xs font-semibold text-slate-900">{r.reference}</span> },
    ...(user.role !== 'user' ? [{ key: 'requester_name', header: 'Requester', render: (r) => <div><p className="font-medium text-slate-900">{r.requester_name}</p><p className="text-xs text-slate-500">{r.requester_email}</p></div> }] : []),
    ...(user.role !== 'organization' ? [{ key: 'organization_name', header: 'Organization' }] : []),
    { key: 'fields', header: 'Fields', render: (r) => <span className="text-xs">{Object.keys(r.requested_fields).map((k) => FIELD_LABELS[k] || k).join(', ')}</span> },
    { key: 'created_at', header: 'Submitted', render: (r) => formatDate(r.created_at), className: 'whitespace-nowrap' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]
  return (
    <>
      <PageHeader title={titles[user.role][0]} subtitle={titles[user.role][1]}
        actions={user.role === 'user' && <Button icon={Upload} onClick={() => navigate('/app/upload')}>New request</Button>} />
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload}
        onRowClick={(r) => navigate(`${BASE[user.role]}/${r.id}`)}
        toolbar={
          <>
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search reference or requester…" />
            <select className="input sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
              <option value="">All statuses</option>
              {['submitted', 'under_review', 'approved', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </select>
          </>
        }
        empty={<EmptyState icon={ClipboardList} title="No correction requests"
          message={user.role === 'user' ? 'Upload a certificate to start a correction request.' : 'Requests will appear here when submitted.'}
          action={user.role === 'user' && <Button icon={Upload} onClick={() => navigate('/app/upload')}>Upload certificate</Button>} />}
        pagination={data && { page, pageSize: data.page_size, total: data.total, onPage: setPage }} />
    </>
  )
}

const TIMELINE_ICON = { under_review: Clock, approved: CheckCircle2, rejected: XCircle }

function ReviewPanel({ cr, onUpdated }) {
  const toast = useToast()
  const { data: templates } = useApi('/templates')
  const [mode, setMode] = useState(null)
  const [comment, setComment] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (decision) => {
    setBusy(true)
    try {
      const { data } = await api.post(`/corrections/${cr.id}/review`, {
        decision, comment: comment || null, template_id: templateId ? Number(templateId) : null,
      })
      onUpdated(data)
      setMode(null)
      setComment('')
      toast.success(decision === 'approved' ? 'Approved — corrected certificate issued.' : `Request marked ${humanize(decision).toLowerCase()}.`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const needsTemplate = !cr.original_certificate_id
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-slate-900">Review decision</h2>
      <p className="mt-1 text-sm text-slate-500">Check the request against your records before approving. Approval issues a new certificate with a new ID{cr.original_certificate_number ? ` and marks ${cr.original_certificate_number} as superseded` : ''}.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {cr.status === 'submitted' && <Button variant="secondary" icon={Eye} loading={busy && !mode} onClick={() => submit('under_review')}>Mark under review</Button>}
        <Button variant="success" icon={CheckCircle2} onClick={() => setMode('approve')}>Approve</Button>
        <Button variant="danger" icon={XCircle} onClick={() => setMode('reject')}>Reject</Button>
      </div>
      <Modal open={mode === 'approve'} onClose={() => setMode(null)} title="Approve and issue corrected certificate"
        footer={<><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button variant="success" loading={busy} onClick={() => submit('approved')}>Approve &amp; issue</Button></>}>
        <div className="space-y-4">
          <Alert type="info">A new official certificate will be generated with the corrected values and sent to {cr.requester_name}.</Alert>
          <Select label={needsTemplate ? 'Certificate template (required)' : 'Certificate template (optional — defaults to the original template)'}
            value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{needsTemplate ? 'Select a template…' : 'Use original template'}</option>
            {(templates || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Textarea label="Comment (optional)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </Modal>
      <ConfirmDialog open={mode === 'reject'} onClose={() => setMode(null)} onConfirm={() => submit('rejected')} loading={busy}
        title="Reject correction request" confirmLabel="Reject request" message="The requester will be notified with your reason.">
        <Textarea className="mt-4" label="Reason (required)" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </ConfirmDialog>
    </Card>
  )
}

export function CorrectionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const { data: cr, loading, error, reload, setData } = useApi(`/corrections/${id}`)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showDoc, setShowDoc] = useState(false)

  if (loading && !cr) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!cr) return null

  const cancel = async () => {
    setBusy(true)
    try {
      const { data } = await api.post(`/corrections/${cr.id}/cancel`)
      setData(data)
      setCancelOpen(false)
      toast.success('Request cancelled.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const open = ['submitted', 'under_review'].includes(cr.status)
  const fields = CORRECTABLE_FIELDS.filter((f) => f in cr.requested_fields || cr.original_fields[f])
  return (
    <>
      <PageHeader title={`Correction request ${cr.reference}`} subtitle={`Submitted ${formatDateTime(cr.created_at)} to ${cr.organization_name}`}
        actions={<>
          <StatusBadge status={cr.status} />
          {user.role === 'user' && open && <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>Cancel request</Button>}
        </>} />

      {cr.status === 'approved' && cr.corrected_certificate_id && (
        <div className="mb-6"><Alert type="success" title="Correction approved">
          Corrected certificate <Link className="font-mono font-semibold underline" to={`${CERT_BASE[user.role]}/${cr.corrected_certificate_id}`}>{cr.corrected_certificate_number}</Link> has been issued by {cr.organization_name}.
        </Alert></div>
      )}
      {cr.status === 'rejected' && <div className="mb-6"><Alert type="error" title="Request rejected">{cr.approvals.at(-1)?.comment || 'The organization rejected this request.'}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4"><h2 className="text-sm font-semibold text-slate-900">Requested changes</h2></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-6 py-2">Field</th><th className="px-6 py-2">Current value</th><th className="px-6 py-2">Requested value</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fields.map((f) => {
                    const changed = f in cr.requested_fields && cr.requested_fields[f]
                    return (
                      <tr key={f} className={changed ? 'bg-violet-50/40' : ''}>
                        <td className="px-6 py-3 font-medium text-slate-700">{FIELD_LABELS[f]}</td>
                        <td className={`px-6 py-3 ${changed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>{cr.original_fields[f] || '—'}</td>
                        <td className="px-6 py-3 font-semibold text-violet-700">{changed ? cr.requested_fields[f] : <span className="font-normal text-slate-400">unchanged</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-6 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{cr.reason}</p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Uploaded document</h2>
              <Button variant="secondary" size="sm" icon={FileText} onClick={() => setShowDoc(!showDoc)}>{showDoc ? 'Hide' : 'View original'}</Button>
            </div>
            <p className="mt-1 text-sm text-slate-500">{cr.document?.original_filename} · uploaded {formatDate(cr.document?.created_at)}. The original document is kept unchanged as part of the record.</p>
            {showDoc && <div className="mt-4"><SecureFileViewer url={`/documents/${cr.document_id}/file`} mimeType={cr.document?.mime_type} /></div>}
          </Card>

          {user.role === 'organization' && open && user.organization?.status === 'verified' && <ReviewPanel cr={cr} onUpdated={setData} />}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-slate-900">Details</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              <DetailRow label="Requester">{cr.requester_name}</DetailRow>
              <DetailRow label="Organization">{cr.organization_name}</DetailRow>
              <DetailRow label="Original ID">{cr.original_certificate_number ? <span className="font-mono text-xs">{cr.original_certificate_number}</span> : 'Not issued on platform'}</DetailRow>
              <DetailRow label="Reviewed">{cr.reviewed_at ? formatDateTime(cr.reviewed_at) : '—'}</DetailRow>
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-slate-900">History</h2>
            <ol className="mt-4 space-y-4">
              <li className="flex gap-3">
                <div className="rounded-full bg-blue-50 p-1.5"><ClipboardList className="h-4 w-4 text-blue-600" /></div>
                <div><p className="text-sm font-medium text-slate-900">Submitted</p><p className="text-xs text-slate-500">{formatDateTime(cr.created_at)} · {cr.requester_name}</p></div>
              </li>
              {cr.approvals.map((a) => {
                const Icon = TIMELINE_ICON[a.decision] || Clock
                return (
                  <li key={a.id} className="flex gap-3">
                    <div className="h-fit rounded-full bg-violet-50 p-1.5"><Icon className="h-4 w-4 text-violet-600" /></div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{humanize(a.decision)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(a.created_at)} · {a.reviewer_name || 'Reviewer'}</p>
                      {a.comment && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{a.comment}</p>}
                    </div>
                  </li>
                )
              })}
              {cr.status === 'cancelled' && <li className="text-sm text-slate-500">Cancelled by requester</li>}
            </ol>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancel} loading={busy}
        title="Cancel correction request" confirmLabel="Cancel request" message="The organization will stop reviewing this request. You can submit a new one later." />
    </>
  )
}
