import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, FileUp, Search, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { Alert, Button, Card, DetailRow, StatusBadge } from '../components/ui'
import api, { errorMessage } from '../services/api'
import { formatDate, formatDateTime } from '../utils/format'

const RESULT_UI = {
  valid: { icon: ShieldCheck, cls: 'from-emerald-500 to-teal-500', title: 'Valid certificate' },
  revoked: { icon: ShieldX, cls: 'from-red-500 to-rose-500', title: 'Certificate revoked' },
  superseded: { icon: ShieldAlert, cls: 'from-amber-500 to-orange-500', title: 'Certificate superseded' },
  not_found: { icon: ShieldX, cls: 'from-slate-500 to-slate-600', title: 'No matching certificate' },
}

function Result({ data, onOpen }) {
  const ui = RESULT_UI[data.result] || RESULT_UI.not_found
  return (
    <Card className="mt-8 overflow-hidden">
      <div className={`flex items-center gap-4 bg-gradient-to-r ${ui.cls} px-6 py-5 text-white`}>
        <ui.icon className="h-10 w-10" />
        <div>
          <p className="text-lg font-bold">{ui.title}</p>
          <p className="text-sm text-white/90">{data.message}</p>
        </div>
      </div>
      {data.certificate_number && (
        <dl className="divide-y divide-slate-100 px-6 py-2">
          <DetailRow label="Certificate ID"><span className="font-mono">{data.certificate_number}</span></DetailRow>
          <DetailRow label="Status"><StatusBadge status={data.status} /></DetailRow>
          <DetailRow label="Recipient">{data.recipient_name}</DetailRow>
          <DetailRow label="Title">{data.title}</DetailRow>
          {data.course_or_role && <DetailRow label="Course / role">{data.course_or_role}</DetailRow>}
          <DetailRow label="Issued by">
            {data.organization_name} {data.organization_verified && <span className="ml-1 inline-flex items-center gap-1 text-xs text-emerald-600"><BadgeCheck className="h-3.5 w-3.5" />Verified issuer</span>}
          </DetailRow>
          {data.category && <DetailRow label="Category">{data.category}</DetailRow>}
          <DetailRow label="Issue date">{formatDate(data.issue_date)}</DetailRow>
          {data.is_corrected_reissue && <DetailRow label="Corrected re-issue">Yes{data.supersedes && <> — replaces <button className="font-mono text-brand-600 hover:underline" onClick={() => onOpen(data.supersedes)}>{data.supersedes}</button></>}</DetailRow>}
          {data.superseded_by && <DetailRow label="Replaced by"><button className="font-mono text-brand-600 hover:underline" onClick={() => onOpen(data.superseded_by)}>{data.superseded_by}</button></DetailRow>}
          {data.revoked_at && data.result === 'revoked' && <DetailRow label="Revoked on">{formatDateTime(data.revoked_at)}</DetailRow>}
          {data.revocation_reason && <DetailRow label="Reason">{data.revocation_reason}</DetailRow>}
        </dl>
      )}
    </Card>
  )
}

export default function Verify() {
  const { number } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(number || '')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const lookup = async (value) => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const { data } = await api.get(`/verify/${encodeURIComponent(value.trim())}`)
      setResult(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (number) {
      setQuery(number)
      lookup(number)
    }
  }, [number])

  const submit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    navigate(`/verify/${encodeURIComponent(query.trim().toUpperCase())}`)
  }

  const verifyFile = async (file) => {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/verify/file', fd)
      setResult(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <div className="gradient-bg mx-auto mb-4 inline-flex rounded-2xl p-3"><BadgeCheck className="h-7 w-7 text-white" /></div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Verify a certificate</h1>
        <p className="mt-2 text-slate-600">Enter the certificate ID printed on the certificate (e.g. CFX-2026-AB12CD34), or scan its QR code.</p>
      </div>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input py-3 pl-9 font-mono uppercase" placeholder="CFX-2026-XXXXXXXX" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Certificate ID" />
        </div>
        <Button type="submit" size="lg" loading={busy}>Verify</Button>
      </form>
      <div className="mt-4 text-center text-sm text-slate-500">
        or{' '}
        <label className="inline-flex cursor-pointer items-center gap-1 font-medium text-brand-600 hover:underline">
          <FileUp className="h-4 w-4" /> upload the certificate PDF
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { verifyFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {' '}to check it hasn&apos;t been altered
      </div>
      {error && <div className="mt-8"><Alert type="error">{error}</Alert></div>}
      {result && <Result data={result} onOpen={(n) => navigate(`/verify/${n}`)} />}
      <p className="mt-10 text-center text-xs text-slate-400">
        Verification checks CertiFix AI&apos;s records only. Certificates issued outside the platform cannot be verified here.
      </p>
    </div>
  )
}
