import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award, BadgeCheck, Building2, CheckCircle2, Clock, Eraser, FolderKanban, Mail, Plus, ScrollText, Search, Tags, Users,
} from 'lucide-react'
import DataTable, { SearchInput } from '../../components/DataTable'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { Alert, Button, Card, DetailRow, EmptyState, ErrorState, Input, PageHeader, PageLoader, Select, StatCard, StatusBadge, Textarea } from '../../components/ui'
import { useApi, useDebounced } from '../../hooks/useApi'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api, { errorMessage } from '../../services/api'
import { formatDate, formatDateTime, humanize } from '../../utils/format'

export function AdminDashboard() {
  const toast = useToast()
  const { data: s, loading, error, reload } = useApi('/admin/stats')
  const logs = useApi('/admin/audit-logs', { page_size: 8 })
  const [busy, setBusy] = useState(false)

  const runRetention = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/admin/retention/run')
      toast.success(`Retention run: ${data.deleted} deleted, ${data.files_removed} files removed, ${data.kept_open_requests} kept.`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading && !s) return <PageLoader />
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Monitor activity across CertiFix AI."
        actions={<Button variant="secondary" icon={Eraser} loading={busy} onClick={runRetention}>Run retention policy</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={s.users} icon={Users} tone="blue" hint={`${s.organization_accounts} organization accounts`} />
        <StatCard label="Organizations" value={s.organizations} icon={Building2} tone="violet" hint={`${s.organizations_verified} verified`} />
        <StatCard label="Pending verification" value={s.organizations_pending} icon={Clock} tone="amber" />
        <StatCard label="Certificates" value={s.certificates} icon={Award} tone="emerald" hint={`${s.certificates_active} active`} />
        <StatCard label="Open corrections" value={s.corrections_open} icon={FolderKanban} tone="amber" />
        <StatCard label="Approved corrections" value={s.corrections_approved} icon={CheckCircle2} tone="emerald" hint={`${s.corrections_rejected} rejected`} />
        <StatCard label="Verifications (30 days)" value={s.verifications_30d} icon={BadgeCheck} tone="blue" />
        <StatCard label="Open messages" value={s.contact_open} icon={Mail} tone="slate" />
      </div>
      {s.organizations_pending > 0 && (
        <div className="mt-6"><Alert type="warning">{s.organizations_pending} organization(s) are waiting for verification. <Link to="/admin/organizations" className="font-semibold underline">Review now</Link></Alert></div>
      )}
      <Card className="mt-8">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
          <Link to="/admin/audit-logs" className="text-sm font-medium text-brand-600 hover:underline">All audit logs</Link>
        </div>
        <ul className="divide-y divide-slate-100">
          {(logs.data?.items || []).map((l) => (
            <li key={l.id} className="flex flex-col gap-1 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span><span className="font-mono text-xs font-semibold text-violet-700">{l.action}</span> <span className="text-slate-500">by {l.actor_email || 'system'}</span></span>
              <span className="text-xs text-slate-400">{formatDateTime(l.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

export function AdminUsers() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const { data, loading, error, reload } = useApi('/admin/users', { q: dq || undefined, role: role || undefined, page, page_size: 15 })
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      await api.patch(`/admin/users/${target.id}`, { is_active: !target.is_active })
      toast.success(`${target.full_name} ${target.is_active ? 'deactivated' : 'activated'}.`)
      setTarget(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'full_name', header: 'Name', render: (r) => <div><p className="font-medium text-slate-900">{r.full_name}</p><p className="text-xs text-slate-500">{r.email}</p></div> },
    { key: 'role', header: 'Role', render: (r) => <StatusBadge status={r.role} /> },
    { key: 'organization', header: 'Organization', render: (r) => r.organization?.name || '—' },
    { key: 'is_active', header: 'Status', render: (r) => <span className={`text-xs font-medium ${r.is_active ? 'text-emerald-600' : 'text-red-600'}`}>{r.is_active ? 'Active' : 'Deactivated'}</span> },
    { key: 'created_at', header: 'Joined', render: (r) => formatDate(r.created_at) },
    { key: 'actions', header: '', className: 'text-right', render: (r) => r.id !== me.id && (
      <Button size="sm" variant={r.is_active ? 'secondary' : 'success'} onClick={() => setTarget(r)}>{r.is_active ? 'Deactivate' : 'Activate'}</Button>
    ) },
  ]
  return (
    <>
      <PageHeader title="Users" subtitle="Manage platform accounts." />
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload}
        toolbar={<>
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search name or email…" />
          <select className="input sm:w-44" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} aria-label="Filter by role">
            <option value="">All roles</option><option value="user">User</option><option value="organization">Organization</option><option value="admin">Admin</option>
          </select>
        </>}
        empty={<EmptyState icon={Users} title="No users found" />}
        pagination={data && { page, pageSize: data.page_size, total: data.total, onPage: setPage }} />
      <ConfirmDialog open={Boolean(target)} onClose={() => setTarget(null)} onConfirm={toggle} loading={busy}
        variant={target?.is_active ? 'danger' : 'success'} title={target?.is_active ? 'Deactivate user' : 'Activate user'}
        confirmLabel={target?.is_active ? 'Deactivate' : 'Activate'}
        message={target?.is_active ? `${target?.full_name} will be signed out and unable to log in.` : `${target?.full_name} will be able to log in again.`} />
    </>
  )
}

export function AdminOrganizations() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const { data, loading, error, reload } = useApi('/admin/organizations', { q: dq || undefined, status: status || undefined, page, page_size: 15 })
  const [selected, setSelected] = useState(null)
  const [decision, setDecision] = useState({ status: 'verified', note: '' })
  const [busy, setBusy] = useState(false)

  const open = (org) => {
    setSelected(org)
    setDecision({ status: org.status === 'verified' ? 'suspended' : 'verified', note: '' })
  }

  const save = async () => {
    setBusy(true)
    try {
      await api.post(`/admin/organizations/${selected.id}/status`, { status: decision.status, note: decision.note || null })
      toast.success(`${selected.name} is now ${decision.status}.`)
      setSelected(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Organization', render: (r) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></div> },
    { key: 'registration_number', header: 'Reg. number' },
    { key: 'website', header: 'Website', render: (r) => r.website ? <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline">{r.website}</a> : '—' },
    { key: 'created_at', header: 'Registered', render: (r) => formatDate(r.created_at) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]
  return (
    <>
      <PageHeader title="Organizations" subtitle="Verify issuing organizations before they can issue certificates or review corrections." />
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} onRowClick={open}
        toolbar={<>
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search organizations…" />
          <select className="input sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filter by status">
            <option value="">All statuses</option>
            {['pending', 'verified', 'rejected', 'suspended'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        </>}
        empty={<EmptyState icon={Building2} title="No organizations found" />}
        pagination={data && { page, pageSize: data.page_size, total: data.total, onPage: setPage }} />
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name || ''} size="lg"
        footer={<><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button><Button loading={busy} onClick={save}>Update status</Button></>}>
        {selected && (
          <div className="space-y-4">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Current status"><StatusBadge status={selected.status} /></DetailRow>
              <DetailRow label="Email">{selected.email}</DetailRow>
              <DetailRow label="Phone">{selected.phone}</DetailRow>
              <DetailRow label="Website">{selected.website}</DetailRow>
              <DetailRow label="Registration no.">{selected.registration_number}</DetailRow>
              <DetailRow label="Address">{selected.address}</DetailRow>
              <DetailRow label="Description">{selected.description}</DetailRow>
              {selected.status_note && <DetailRow label="Last note">{selected.status_note}</DetailRow>}
            </dl>
            <Alert type="info">Confirm the organization&apos;s identity (registration records, official domain, contact) before verifying.</Alert>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="New status" value={decision.status} onChange={(e) => setDecision({ ...decision, status: e.target.value })}>
                {['verified', 'pending', 'rejected', 'suspended'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
              </Select>
              <Textarea label={['rejected', 'suspended'].includes(decision.status) ? 'Note (required)' : 'Note (optional)'} rows={2}
                value={decision.note} onChange={(e) => setDecision({ ...decision, note: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export function AdminCategories() {
  const toast = useToast()
  const { data, loading, error, reload } = useApi('/categories', { include_inactive: true })
  const [form, setForm] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      if (form.id) await api.patch(`/categories/${form.id}`, { name: form.name, description: form.description || null })
      else await api.post('/categories', { name: form.name, description: form.description || null })
      toast.success('Category saved.')
      setForm(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (c) => {
    try {
      await api.patch(`/categories/${c.id}`, { is_active: !c.is_active })
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.delete(`/categories/${toDelete.id}`)
      toast.success('Category deleted.')
      setToDelete(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Name', render: (r) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.description}</p></div> },
    { key: 'is_system', header: 'Type', render: (r) => <span className="text-xs text-slate-500">{r.is_system ? 'Built-in' : 'Custom'}</span> },
    { key: 'is_active', header: 'Status', render: (r) => <span className={`text-xs font-medium ${r.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    { key: 'actions', header: '', className: 'text-right whitespace-nowrap', render: (r) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setForm({ id: r.id, name: r.name, description: r.description || '' })}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.is_active ? 'Deactivate' : 'Activate'}</Button>
        {!r.is_system && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setToDelete(r)}>Delete</Button>}
      </div>
    ) },
  ]
  return (
    <>
      <PageHeader title="Certificate categories" subtitle="Built-in categories can be deactivated; custom categories can also be deleted if unused."
        actions={<Button icon={Plus} onClick={() => setForm({ name: '', description: '' })}>Add category</Button>} />
      <DataTable columns={columns} rows={data} loading={loading} error={error} onRetry={reload} empty={<EmptyState icon={Tags} title="No categories" />} />
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Edit category' : 'Add category'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy} onClick={save} disabled={!form?.name?.trim()}>Save</Button></>}>
        {form && (
          <div className="space-y-4">
            <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        )}
      </Modal>
      <ConfirmDialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={remove} loading={busy} title="Delete category" confirmLabel="Delete"
        message={`Delete "${toDelete?.name}"? This cannot be undone.`} />
    </>
  )
}

export function AuditLogs() {
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [page, setPage] = useState(1)
  const da = useDebounced(action)
  const { data, loading, error, reload } = useApi('/admin/audit-logs', { action: da || undefined, entity_type: entity || undefined, page, page_size: 25 })
  const columns = [
    { key: 'created_at', header: 'Time', render: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</span> },
    { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs font-semibold text-violet-700">{r.action}</span> },
    { key: 'actor_email', header: 'Actor', render: (r) => r.actor_email || <span className="text-slate-400">anonymous</span> },
    { key: 'entity', header: 'Entity', render: (r) => r.entity_type ? `${r.entity_type} #${r.entity_id ?? ''}` : '—' },
    { key: 'details', header: 'Details', render: (r) => <code className="block max-w-xs truncate text-xs text-slate-500" title={JSON.stringify(r.details)}>{Object.keys(r.details).length ? JSON.stringify(r.details) : ''}</code> },
    { key: 'ip_address', header: 'IP', render: (r) => <span className="text-xs text-slate-500">{r.ip_address || '—'}</span> },
  ]
  return (
    <>
      <PageHeader title="Audit logs" subtitle="An append-only record of significant actions on the platform." />
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload}
        toolbar={<>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} placeholder="Filter action (e.g. correction)" />
          </div>
          <select className="input sm:w-48" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1) }} aria-label="Filter by entity">
            <option value="">All entities</option>
            {['user', 'organization', 'certificate', 'correction_request', 'document', 'template', 'category', 'contact_message', 'system'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        </>}
        empty={<EmptyState icon={ScrollText} title="No log entries" />}
        pagination={data && { page, pageSize: data.page_size, total: data.total, onPage: setPage }} />
    </>
  )
}

export function ContactMessages() {
  const toast = useToast()
  const [resolved, setResolved] = useState('false')
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useApi('/admin/contact-messages', { resolved: resolved || undefined, page, page_size: 15 })
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)

  const resolve = async () => {
    setBusy(true)
    try {
      await api.post(`/admin/contact-messages/${selected.id}/resolve`)
      toast.success('Marked as resolved.')
      setSelected(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    { key: 'name', header: 'From', render: (r) => <div><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></div> },
    { key: 'subject', header: 'Subject' },
    { key: 'created_at', header: 'Received', render: (r) => formatDateTime(r.created_at) },
    { key: 'is_resolved', header: 'Status', render: (r) => <span className={`text-xs font-medium ${r.is_resolved ? 'text-emerald-600' : 'text-amber-600'}`}>{r.is_resolved ? 'Resolved' : 'Open'}</span> },
  ]
  return (
    <>
      <PageHeader title="Contact messages" subtitle="Messages submitted via the contact page." />
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} onRowClick={setSelected}
        toolbar={<select className="input sm:w-44" value={resolved} onChange={(e) => { setResolved(e.target.value); setPage(1) }} aria-label="Filter">
          <option value="false">Open</option><option value="true">Resolved</option><option value="">All</option>
        </select>}
        empty={<EmptyState icon={Mail} title="No messages" />}
        pagination={data && { page, pageSize: data.page_size, total: data.total, onPage: setPage }} />
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.subject || ''}
        footer={<>
          {selected && <a href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`} className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Reply by email</a>}
          {selected && !selected.is_resolved && <Button loading={busy} onClick={resolve}>Mark resolved</Button>}
        </>}>
        {selected && (
          <>
            <p className="text-sm text-slate-500">{selected.name} &lt;{selected.email}&gt; · {formatDateTime(selected.created_at)}</p>
            <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{selected.message}</p>
          </>
        )}
      </Modal>
    </>
  )
}
