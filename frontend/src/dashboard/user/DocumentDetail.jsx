import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, RefreshCw, Send } from 'lucide-react'
import { SecureFileViewer } from '../../components/common'
import { Alert, Button, Card, ErrorState, Input, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useToast } from '../../hooks/useToast'
import api, { errorMessage } from '../../services/api'
import { CORRECTABLE_FIELDS, FIELD_LABELS, formatBytes, formatDateTime } from '../../utils/format'

const OCR_DISPLAY = ['recipient_name', 'title', 'course_or_role', 'organization_name', 'certificate_number', 'start_date', 'end_date', 'issue_date', 'detected_category']
const DATE_FIELDS = new Set(['start_date', 'end_date', 'issue_date'])

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-slate-300'
  return (
    <div className="flex items-center gap-2" title={`Heuristic confidence ${pct}%`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-[11px] tabular-nums text-slate-400">{pct}%</span>
    </div>
  )
}

function CorrectionForm({ doc }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: orgs } = useApi('/organizations')
  const { data: categories } = useApi('/categories')
  const f = doc.ocr_fields || {}
  const ocr = (k) => f[k]?.value || ''

  const [certNo, setCertNo] = useState(ocr('certificate_number'))
  const [orgId, setOrgId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [original, setOriginal] = useState(() => Object.fromEntries(CORRECTABLE_FIELDS.map((k) => [k, ocr(k)])))
  const [requested, setRequested] = useState(() => Object.fromEntries(CORRECTABLE_FIELDS.map((k) => [k, ''])))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orgs || orgId) return
    const guess = ocr('organization_name').toLowerCase()
    const match = guess && orgs.find((o) => guess.includes(o.name.toLowerCase()) || o.name.toLowerCase().includes(guess))
    if (match) setOrgId(String(match.id))
  }, [orgs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!categories || categoryId) return
    const match = categories.find((c) => c.name === ocr('detected_category'))
    if (match) setCategoryId(String(match.id))
  }, [categories]) // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => Object.fromEntries(
    Object.entries(requested).filter(([k, v]) => v.trim() && v.trim() !== (original[k] || '').trim()).map(([k, v]) => [k, v.trim()]),
  ), [requested, original])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!Object.keys(changes).length) return setError('Enter at least one corrected value that differs from the current value.')
    if (!certNo.trim() && !orgId) return setError('Select the issuing organization, or enter the certificate ID if it was issued on CertiFix AI.')
    setBusy(true)
    try {
      const originalFields = Object.fromEntries(Object.entries(original).filter(([k, v]) => v && (!DATE_FIELDS.has(k) || /^\d{4}-\d{2}-\d{2}$/.test(v))))
      const { data } = await api.post('/corrections', {
        document_id: doc.id,
        organization_id: orgId ? Number(orgId) : null,
        original_certificate_number: certNo.trim() || null,
        category_id: categoryId ? Number(categoryId) : null,
        original_fields: originalFields,
        requested_fields: changes,
        reason,
      })
      toast.success(`Request ${data.reference} submitted to ${data.organization_name}.`)
      navigate(`/app/corrections/${data.id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-slate-900">Request a correction</h2>
      <p className="mt-1 text-sm text-slate-500">Review the values read from your certificate, then enter the corrected values only for fields that are wrong.</p>
      <form onSubmit={submit} className="mt-6 space-y-6">
        {error && <Alert type="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Certificate ID (if on CertiFix AI)" className="font-mono" value={certNo} onChange={(e) => setCertNo(e.target.value)} hint="If it matches, the issuer is selected automatically." />
          <Select label="Issuing organization" value={orgId} onChange={(e) => setOrgId(e.target.value)} hint="Only verified issuers are listed.">
            <option value="">Select organization…</option>
            {(orgs || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select category…</option>
            {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-5 gap-4 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>Field</span><span className="col-span-2">Current value on certificate</span><span className="col-span-2">Corrected value</span>
          </div>
          {CORRECTABLE_FIELDS.map((k) => (
            <div key={k} className={`grid gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-5 sm:items-center sm:gap-4 ${changes[k] ? 'bg-violet-50/50' : ''}`}>
              <span className="text-sm font-medium text-slate-700">{FIELD_LABELS[k]}</span>
              <input className="input sm:col-span-2" value={original[k]} placeholder={DATE_FIELDS.has(k) ? 'YYYY-MM-DD' : ''} aria-label={`Current ${FIELD_LABELS[k]}`}
                onChange={(e) => setOriginal({ ...original, [k]: e.target.value })} />
              <input className="input sm:col-span-2" type={DATE_FIELDS.has(k) ? 'date' : 'text'} value={requested[k]} placeholder="Leave empty if correct" aria-label={`Corrected ${FIELD_LABELS[k]}`}
                onChange={(e) => setRequested({ ...requested, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <Textarea label="Reason for the correction" rows={4} required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)}
          hint="Explain what is wrong and how the organization can confirm it (e.g. 'Name misspelled; matches my passport')." />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{Object.keys(changes).length} field(s) will be submitted for correction.</p>
          <Button type="submit" icon={Send} loading={busy}>Submit correction request</Button>
        </div>
      </form>
    </Card>
  )
}

export default function DocumentDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { data: doc, loading, error, reload, setData } = useApi(`/documents/${id}`)
  const [showText, setShowText] = useState(false)
  const [busy, setBusy] = useState(false)

  if (loading && !doc) return <PageLoader label="Loading OCR results…" />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!doc) return null

  const reprocess = async () => {
    setBusy(true)
    try {
      const { data } = await api.post(`/documents/${doc.id}/reprocess`)
      setData(data)
      toast.info(data.ocr_status === 'completed' ? 'Text extracted again.' : 'Text extraction still failed.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const fields = doc.ocr_fields || {}
  return (
    <>
      <PageHeader title="OCR results" subtitle={`${doc.original_filename} · ${formatBytes(doc.size_bytes)} · uploaded ${formatDateTime(doc.created_at)}`}
        actions={<Button variant="secondary" icon={RefreshCw} loading={busy} onClick={reprocess}>Re-run OCR</Button>} />
      <div className="mb-6"><Alert type="warning">Extracted values are automatic suggestions. They may contain errors and are <strong>not proof of authenticity</strong>. Please review them carefully.</Alert></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Extracted fields</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <StatusBadge status={doc.ocr_status} />
              {doc.ocr_method && <span>{doc.ocr_method === 'pdf_text' ? 'PDF text layer' : 'Tesseract OCR'}</span>}
              {doc.ocr_confidence != null && <span>· {Math.round(doc.ocr_confidence)}% word confidence</span>}
            </div>
          </div>
          {doc.ocr_status === 'failed' && <div className="mt-4"><Alert type="error" title="Text extraction failed">{doc.ocr_error} You can still fill in the correction form manually.</Alert></div>}
          {doc.ocr_status === 'completed' && (
            <dl className="mt-4 divide-y divide-slate-100">
              {OCR_DISPLAY.map((k) => (
                <div key={k} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-sm text-slate-500">{FIELD_LABELS[k]}</dt>
                  <dd className="flex items-center gap-3 text-right">
                    <span className={`text-sm ${fields[k]?.value ? 'font-medium text-slate-900' : 'text-slate-400'}`}>{fields[k]?.value || 'Not detected'}</span>
                    {fields[k]?.value && <ConfidenceBar value={fields[k].confidence} />}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {doc.ocr_text && (
            <div className="mt-4">
              <button onClick={() => setShowText(!showText)} className="flex items-center gap-1 text-sm font-medium text-brand-600">
                <ChevronDown className={`h-4 w-4 transition ${showText ? 'rotate-180' : ''}`} /> {showText ? 'Hide' : 'Show'} full extracted text
              </button>
              {showText && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{doc.ocr_text}</pre>}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <SecureFileViewer url={`/documents/${doc.id}/file`} mimeType={doc.mime_type} title={doc.original_filename} className="h-[60vh]" />
        </Card>
      </div>
      <div className="mt-6"><CorrectionForm doc={doc} /></div>
    </>
  )
}
