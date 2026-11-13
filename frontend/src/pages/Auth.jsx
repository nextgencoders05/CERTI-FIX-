import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, User } from 'lucide-react'
import { Logo } from '../components/common'
import { Alert, Button, Input, Textarea } from '../components/ui'
import { useAuth, homePath } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { errorMessage } from '../services/api'

function AuthShell({ title, subtitle, children, wide }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-violet-50 px-4 py-12">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function Login() {
  const { user, login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  if (user) return <Navigate to={homePath(user.role)} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const u = await login(form.email, form.password)
      navigate(location.state?.from || homePath(u.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your CertiFix AI account">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        No account? <Link to="/register" className="font-medium text-brand-600 hover:underline">Create one</Link>
      </p>
    </AuthShell>
  )
}

const EMPTY_ORG = { organization_name: '', organization_email: '', website: '', phone: '', address: '', registration_number: '', description: '' }

export function Register() {
  const { user, register, registerOrganization } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const type = params.get('type') === 'organization' ? 'organization' : 'user'
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '', ...EMPTY_ORG })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  if (user) return <Navigate to={homePath(user.role)} replace />
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      const base = { full_name: form.full_name, email: form.email, password: form.password }
      let u
      if (type === 'organization') {
        const extra = Object.fromEntries(Object.keys(EMPTY_ORG).map((k) => [k, form[k] || null]))
        u = await registerOrganization({ ...base, ...extra })
        toast.success('Organization registered. An administrator will verify it shortly.')
      } else {
        u = await register(base)
        toast.success('Welcome to CertiFix AI!')
      }
      navigate(homePath(u.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const tab = (value, label, Icon) => (
    <button type="button" onClick={() => setParams(value === 'organization' ? { type: value } : {})}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${type === value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
      <Icon className="h-4 w-4" />{label}
    </button>
  )

  return (
    <AuthShell wide={type === 'organization'} title="Create your account"
      subtitle={type === 'organization' ? 'Register your issuing organization. It must be verified before issuing certificates.' : 'Request corrections and keep your certificates in one place.'}>
      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        {tab('user', 'Personal', User)}
        {tab('organization', 'Organization', Building2)}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}
        {type === 'organization' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Organization name" required value={form.organization_name} onChange={set('organization_name')} />
            <Input label="Organization email" type="email" required value={form.organization_email} onChange={set('organization_email')} />
            <Input label="Website" placeholder="https://" value={form.website} onChange={set('website')} />
            <Input label="Phone" value={form.phone} onChange={set('phone')} />
            <Input label="Registration number" value={form.registration_number} onChange={set('registration_number')} />
            <Input className="sm:col-span-2" label="Address" value={form.address} onChange={set('address')} />
            <Textarea className="sm:col-span-2" label="About the organization" rows={2} value={form.description} onChange={set('description')} />
            <p className="border-t border-slate-100 pt-4 text-sm font-semibold text-slate-900 sm:col-span-2">Your administrator account</p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input className="sm:col-span-2" label="Full name" required autoComplete="name" value={form.full_name} onChange={set('full_name')} />
          <Input className="sm:col-span-2" label="Email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
          <Input label="Password" type="password" required autoComplete="new-password" hint="8+ characters with a letter and a number" value={form.password} onChange={set('password')} />
          <Input label="Confirm password" type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </div>
        <p className="text-xs text-slate-500">
          By creating an account you agree to our <Link to="/terms" className="text-brand-600 hover:underline">Terms</Link> and <Link to="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.
        </p>
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already registered? <Link to="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
