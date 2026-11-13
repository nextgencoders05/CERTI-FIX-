import { useState } from 'react'
import { Button, Card, Input, PageHeader, StatusBadge } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api, { errorMessage } from '../../services/api'
import { formatDate } from '../../utils/format'

export default function Account() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [profile, setProfile] = useState({ full_name: user.full_name, phone: user.phone || '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' })
  const [busy, setBusy] = useState(null)

  const saveProfile = async (e) => {
    e.preventDefault()
    setBusy('profile')
    try {
      const { data } = await api.put('/auth/me', { full_name: profile.full_name, phone: profile.phone || null })
      setUser(data)
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (pw.new_password !== pw.confirm) return toast.error('New passwords do not match.')
    setBusy('pw')
    try {
      await api.post('/auth/change-password', { current_password: pw.current_password, new_password: pw.new_password })
      setPw({ current_password: '', new_password: '', confirm: '' })
      toast.success('Password changed.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Manage your personal details and password." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <div className="gradient-bg flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white">
            {user.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <p className="mt-4 text-lg font-semibold text-slate-900">{user.full_name}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
          <div className="mt-3 flex gap-2"><StatusBadge status={user.role} /></div>
          <p className="mt-4 text-xs text-slate-500">Member since {formatDate(user.created_at)}</p>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-slate-900">Personal information</h2>
            <form onSubmit={saveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input label="Full name" required value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
              <Input label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Input className="sm:col-span-2" label="Email" value={user.email} disabled hint="Contact support to change your email address." />
              <div className="sm:col-span-2"><Button type="submit" loading={busy === 'profile'}>Save changes</Button></div>
            </form>
          </Card>
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
            <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input className="sm:col-span-2" label="Current password" type="password" required autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
              <Input label="New password" type="password" required autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} hint="8+ characters with a letter and a number" />
              <Input label="Confirm new password" type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              <div className="sm:col-span-2"><Button type="submit" loading={busy === 'pw'}>Update password</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  )
}
