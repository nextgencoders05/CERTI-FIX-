import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Award, Ban, CheckCircle2, Eye, FilePlus2, ImageUp, Inbox, LayoutTemplate, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { SecureFileViewer } from '../../components/common'
import { Alert, Button, Card, EmptyState, ErrorState, Input, PageHeader, PageLoader, Select, Spinner, StatCard, StatusBadge, Textarea } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api, { errorMessage, fetchBlobUrl } from '../../services/api'
import { formatDate } from '../../utils/format'

export function OrgDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: stats, loading, error, reload } = useApi('/organizations/me/stats')
  const pending = useApi('/corrections', { status: 'submitted', page_size: 5 })
  const verified = user.organization?.status === 'verified'

  if (error) return <ErrorState message={error} onRetry={reload} />
  return (
    <>
      <PageHeader title={user.organization?.name || 'Organization'} subtitle="Issue certificates and review correction requests."
        actions={verified && <Button icon={FilePlus2} onClick={() => navigate('/org/certificates/new')}>Issue certificate</Button>} />
      {loading && !stats ? <PageLoader /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pending corrections" value={stats?.corrections_pending} icon={Inbox} tone="amber" />
          <StatCard label="Certificates issued" value={stats?.certificates_issued} icon={Award} tone="blue" hint={`${stats?.certificates_active ?? 0} active`} />
          <StatCard label="Corrections approved" value={stats?.corrections_approved} icon={CheckCircle2} tone="emerald" />
          <StatCard label="Active templates" value={stats?.templates} icon={LayoutTemplate} tone="violet" />
        </div>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">New correction requests</h2>
            <Link to="/org/corrections" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>
          </div>
          {pending.loading ? <div className="flex justify-center py-10"><Spinner /></div> : !pending.data?.items.length ? (
            <EmptyState icon={Inbox} title="No new requests" message="New correction requests will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.data.items.map((c) => (
                <li key={c.id}>
                  <Link to={`/org/corrections/${c.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50">
                    <div><p className="text-sm font-medium text-slate-900">{c.requester_name}</p><p className="font-mono text-xs text-slate-500">{c.reference} · {formatDate(c.created_at)}</p></div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-slate-900">Getting started</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="flex gap-2"><StatusBadge status={user.organization?.status} /> <span>Organization verification</span></li>
            <li>1. <Link to="/org/profile" className="text-brand-600 hover:underline">Upload your logo</Link> and complete your profile.</li>
            <li>2. <Link to="/org/templates/new" className="text-brand-600 hover:underline">Design a certificate template</Link>.</li>
            <li>3. <Link to="/org/certificates/new" className="text-brand-600 hover:underline">Issue your first certificate</Link>.</li>
          </ol>
        </Card>
      </div>
    </>
  )
}

function PreviewModal({ template, onClose }) {
  return (
    <Modal open={Boolean(template)} onClose={onClose} title={`Preview: ${template?.name || ''}`} size="lg">
      {template && <SecureFileViewer url={`/templates/${template.id}/preview`} className="h-[65vh]" />}
      <p className="mt-3 text-xs text-slate-500">Previews use sample data and are watermarked. They are not valid certificates.</p>
    </Modal>
  )
}

export function Templates() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data, loading, error, reload } = useApi('/templates')
  const { data: categories } = useApi('/categories')
  const [preview, setPreview] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)
  const catName = (id) => categories?.find((c) => c.id === id)?.name

  const remove = async () => {
    setBusy(true)
    try {
      await api.delete(`/templates/${toDelete.id}`)
      toast.success('Template deactivated.')
      setToDelete(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Certificate templates" subtitle="Design the layout and wording of your certificates."
        actions={<Button icon={Plus} onClick={() => navigate('/org/templates/new')}>New template</Button>} />
      {loading && !data ? <PageLoader /> : error ? <ErrorState message={error} onRetry={reload} /> : !data.length ? (
        <Card><EmptyState icon={LayoutTemplate} title="No templates yet" message="Create a template to start issuing certificates."
          action={<Button icon={Plus} onClick={() => navigate('/org/templates/new')}>Create template</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <Card key={t.id} className="flex flex-col overflow-hidden">
              <div className="flex h-32 items-center justify-center border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${t.layout.primary_color}15, ${t.layout.accent_color}25)` }}>
                <div className="rounded-md border-2 bg-white px-6 py-3 text-center shadow-sm" style={{ borderColor: t.layout.primary_color }}>
                  <p className="text-[10px] font-bold uppercase" style={{ color: t.layout.primary_color }}>{t.title_text}</p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: t.layout.accent_color }}>Recipient Name</p>
                </div>
              </div>
              <div className="flex-1 p-5">
                <p className="font-semibold text-slate-900">{t.name}</p>
                <p className="mt-1 text-xs text-slate-500">{catName(t.category_id) || 'No category'} · {t.layout.orientation}</p>
                <p className="mt-3 line-clamp-2 text-sm text-slate-600">{t.body_text}</p>
              </div>
              <div className="flex gap-1 border-t border-slate-100 p-3">
                <Button variant="ghost" size="sm" icon={Eye} onClick={() => setPreview(t)}>Preview</Button>
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => navigate(`/org/templates/${t.id}`)}>Edit</Button>
                <Button variant="ghost" size="sm" icon={Trash2} className="ml-auto text-red-600 hover:bg-red-50" onClick={() => setToDelete(t)}>Remove</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <PreviewModal template={preview} onClose={() => setPreview(null)} />
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={remove} loading={busy} title="Remove template" confirmLabel="Remove"
        message={`Deactivate "${toDelete?.name}"? Certificates already issued with it stay valid.`} />
    </>
  )
}

const DEFAULT_TEMPLATE = {
  name: '', category_id: '', title_text: 'Certificate of Completion',
  body_text: 'has successfully completed {course_or_role} from {start_date} to {end_date}.',
  layout: { orientation: 'landscape', primary_color: '#1E3A8A', accent_color: '#7C3AED', border_style: 'double', font: 'Helvetica', show_logo: true, show_qr: true, signatory_name: '', signatory_title: '' },
}
const PLACEHOLDERS = ['recipient_name', 'course_or_role', 'start_date', 'end_date', 'issue_date', 'organization_name', 'category', 'description', 'certificate_number']

export function TemplateEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const toast = useToast()
  const { data: categories } = useApi('/categories')
  const existing = useApi(isNew ? null : `/templates/${id}`)
  const [form, setForm] = useState(DEFAULT_TEMPLATE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (existing.data) setForm({ ...existing.data, category_id: existing.data.category_id ?? '', layout: { ...DEFAULT_TEMPLATE.layout, ...existing.data.layout } })
  }, [existing.data])

  if (!isNew && existing.loading && !existing.data) return <PageLoader />
  if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setLayout = (k, v) => setForm({ ...form, layout: { ...form.layout, [k]: v } })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      name: form.name, title_text: form.title_text, body_text: form.body_text,
      category_id: form.category_id ? Number(form.category_id) : null,
      layout: { ...form.layout, signatory_name: form.layout.signatory_name || null, signatory_title: form.layout.signatory_title || null },
    }
    try {
      const { data } = isNew ? await api.post('/templates', payload) : await api.put(`/templates/${id}`, payload)
      toast.success('Template saved.')
      if (isNew) navigate(`/org/templates/${data.id}`, { replace: true })
      else existing.setData(data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={isNew ? 'New template' : `Edit template`} subtitle="Use {placeholders} in the body text; they are filled in when a certificate is issued."
        actions={!isNew && <Button variant="secondary" icon={Eye} onClick={() => setPreview(existing.data)}>Preview PDF</Button>} />
      <form onSubmit={save} className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-4 p-6 lg:col-span-2">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Template name" required value={form.name} onChange={set('name')} placeholder="e.g. Summer Internship 2026" />
            <Select label="Category" value={form.category_id} onChange={set('category_id')}>
              <option value="">No category</option>
              {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <Input label="Certificate title" required value={form.title_text} onChange={set('title_text')} />
          <Textarea label="Body text" rows={4} required value={form.body_text} onChange={set('body_text')}
            hint="Printed below 'This is to certify that <recipient name>'." />
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button type="button" key={p} onClick={() => setForm({ ...form, body_text: `${form.body_text} {${p}}` })}
                className="rounded-md bg-violet-50 px-2 py-1 font-mono text-xs text-violet-700 hover:bg-violet-100">{`{${p}}`}</button>
            ))}
          </div>
          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <Input label="Signatory name" value={form.layout.signatory_name || ''} onChange={(e) => setLayout('signatory_name', e.target.value)} />
            <Input label="Signatory title" value={form.layout.signatory_title || ''} onChange={(e) => setLayout('signatory_title', e.target.value)} />
          </div>
        </Card>
        <Card className="space-y-4 p-6">
          <h2 className="text-sm font-semibold text-slate-900">Layout</h2>
          <Select label="Orientation" value={form.layout.orientation} onChange={(e) => setLayout('orientation', e.target.value)}>
            <option value="landscape">Landscape</option><option value="portrait">Portrait</option>
          </Select>
          <Select label="Border" value={form.layout.border_style} onChange={(e) => setLayout('border_style', e.target.value)}>
            {['none', 'simple', 'double', 'ornate'].map((b) => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1)}</option>)}
          </Select>
          <Select label="Font" value={form.layout.font} onChange={(e) => setLayout('font', e.target.value)}>
            <option value="Helvetica">Sans serif (Helvetica)</option><option value="Times-Roman">Serif (Times)</option><option value="Courier">Monospace (Courier)</option>
          </Select>
          <div className="grid grid-cols-2 gap-4">
            {[['primary_color', 'Primary'], ['accent_color', 'Accent']].map(([k, label]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.layout[k]} onChange={(e) => setLayout(k, e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded border border-slate-300" />
                  <span className="font-mono text-xs text-slate-500">{form.layout[k]}</span>
                </div>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.layout.show_logo} onChange={(e) => setLayout('show_logo', e.target.checked)} className="rounded" />Show organization logo</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.layout.show_qr} onChange={(e) => setLayout('show_qr', e.target.checked)} className="rounded" />Show QR verification code</label>
          <div className="flex gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => navigate('/org/templates')}>Back</Button>
            <Button type="submit" loading={busy} className="flex-1">Save template</Button>
          </div>
        </Card>
      </form>
      <PreviewModal template={preview} onClose={() => setPreview(null)} />
    </>
  )
}

export function IssueCertificate() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: templates, loading } = useApi('/templates')
  const { data: categories } = useApi('/categories')
  const [form, setForm] = useState({ template_id: '', recipient_name: '', recipient_email: '', title: '', course_or_role: '', description: '', category_id: '', start_date: '', end_date: '', issue_date: new Date().toISOString().slice(0, 10) })
  const [extra, setExtra] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  if (loading && !templates) return <PageLoader />
  if (templates && !templates.length) {
    return (
      <>
        <PageHeader title="Issue certificate" />
        <Card><EmptyState icon={LayoutTemplate} title="Create a template first" message="Certificates are generated from your templates."
          action={<Button icon={Plus} onClick={() => navigate('/org/templates/new')}>Create template</Button>} /></Card>
      </>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const clean = (v) => (v === '' ? null : v)
    try {
      const { data } = await api.post('/certificates', {
        template_id: Number(form.template_id), recipient_name: form.recipient_name, recipient_email: clean(form.recipient_email),
        title: clean(form.title), course_or_role: clean(form.course_or_role), description: clean(form.description),
        category_id: form.category_id ? Number(form.category_id) : null, start_date: clean(form.start_date), end_date: clean(form.end_date),
        issue_date: clean(form.issue_date), extra_fields: Object.fromEntries(extra.filter((x) => x.key.trim()).map((x) => [x.key.trim(), x.value])),
      })
      toast.success(`Certificate ${data.certificate_number} issued.`)
      navigate(`/org/certificates/${data.id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const tpl = templates?.find((t) => String(t.id) === String(form.template_id))
  return (
    <>
      <PageHeader title="Issue certificate" subtitle="A unique certificate ID and QR verification code are assigned automatically." />
      <form onSubmit={submit}>
        <Card className="space-y-6 p-6">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Template" required value={form.template_id} onChange={set('template_id')}>
              <option value="">Select template…</option>
              {(templates || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select label="Category" value={form.category_id} onChange={set('category_id')} hint={tpl ? 'Defaults to the template category' : ''}>
              <option value="">Template default</option>
              {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Recipient name" required value={form.recipient_name} onChange={set('recipient_name')} />
            <Input label="Recipient email" type="email" value={form.recipient_email} onChange={set('recipient_email')} hint="If they have an account, it appears in their dashboard." />
            <Input label="Title" value={form.title} onChange={set('title')} placeholder={tpl?.title_text || 'Template title'} />
            <Input label="Course / role" value={form.course_or_role} onChange={set('course_or_role')} />
            <Input label="Start date" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="End date" type="date" value={form.end_date} onChange={set('end_date')} />
            <Input label="Issue date" type="date" value={form.issue_date} onChange={set('issue_date')} />
            <Textarea className="sm:col-span-2" label="Description (optional)" rows={2} value={form.description} onChange={set('description')} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Additional fields</p>
              <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={() => setExtra([...extra, { key: '', value: '' }])}>Add field</Button>
            </div>
            {extra.map((x, i) => (
              <div key={i} className="mt-2 flex gap-2">
                <input className="input" placeholder="Field (e.g. grade)" value={x.key} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, key: e.target.value } : y)))} />
                <input className="input" placeholder="Value" value={x.value} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
                <button type="button" onClick={() => setExtra(extra.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:text-red-600" aria-label="Remove field"><XCircle className="h-5 w-5" /></button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => navigate('/org/certificates')}>Cancel</Button>
            <Button type="submit" icon={Award} loading={busy}>Generate &amp; issue</Button>
          </div>
        </Card>
      </form>
    </>
  )
}

export function OrgProfile() {
  const { refresh } = useAuth()
  const toast = useToast()
  const { data: org, loading, error, reload, setData } = useApi('/organizations/me')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)

  useEffect(() => {
    if (!org) return
    setForm({ name: org.name, email: org.email, website: org.website || '', phone: org.phone || '', address: org.address || '', registration_number: org.registration_number || '', description: org.description || '' })
    let url
    if (org.has_logo) fetchBlobUrl(`/organizations/${org.id}/logo?v=${Date.now()}`).then((u) => { url = u; setLogoUrl(u) }).catch(() => {})
    return () => url && URL.revokeObjectURL(url)
  }, [org])

  if (loading && !org) return <PageLoader />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!form) return null
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy('save')
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' && !['name', 'email'].includes(k) ? null : v]))
      const { data } = await api.put('/organizations/me', payload)
      setData(data)
      refresh()
      toast.success('Organization updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const uploadLogo = async (file) => {
    if (!file) return
    setBusy('logo')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/organizations/me/logo', fd)
      setData(data)
      toast.success('Logo updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title="Organization profile" subtitle="This information appears on certificates and verification pages." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
            {logoUrl ? <img src={logoUrl} alt="Organization logo" className="max-h-24 max-w-[80%] object-contain" /> : <p className="text-sm text-slate-400">No logo</p>}
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {busy === 'logo' ? <Spinner className="h-4 w-4" /> : <ImageUp className="h-4 w-4" />} Upload logo
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <p className="mt-2 text-center text-xs text-slate-500">PNG or JPG, up to 2 MB</p>
          <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Status</span><StatusBadge status={org.status} /></div>
            {org.verified_at && <div className="flex justify-between"><span className="text-slate-500">Verified</span><span>{formatDate(org.verified_at)}</span></div>}
            {org.status_note && <Alert type={org.status === 'verified' ? 'info' : 'warning'}>{org.status_note}</Alert>}
          </div>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Organization name" required value={form.name} onChange={set('name')} />
            <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
            <Input label="Website" value={form.website} onChange={set('website')} />
            <Input label="Phone" value={form.phone} onChange={set('phone')} />
            <Input label="Registration number" value={form.registration_number} onChange={set('registration_number')} />
            <Input className="sm:col-span-2" label="Address" value={form.address} onChange={set('address')} />
            <Textarea className="sm:col-span-2" label="Description" rows={3} value={form.description} onChange={set('description')} />
            <div className="sm:col-span-2"><Button type="submit" loading={busy === 'save'}>Save changes</Button></div>
          </form>
        </Card>
      </div>
    </>
  )
}
