import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Award, BadgeCheck, Building2, ClipboardList, FileCheck2, FilePlus2, FileText, FolderKanban, Inbox, LayoutDashboard,
  LayoutTemplate, LogOut, Mail, Menu, ScrollText, ShieldCheck, Tags, Upload, User, Users, X,
} from 'lucide-react'
import { Logo } from '../components/common'
import NotificationBell from '../components/NotificationBell'
import { useAuth } from '../hooks/useAuth'

const NAV = {
  user: [
    { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/app/upload', label: 'Upload certificate', icon: Upload },
    { to: '/app/documents', label: 'My uploads', icon: FileText },
    { to: '/app/corrections', label: 'Correction tracking', icon: ClipboardList },
    { to: '/app/certificates', label: 'My certificates', icon: Award },
    { to: '/verify', label: 'Verify certificate', icon: BadgeCheck },
    { to: '/app/profile', label: 'Profile', icon: User },
  ],
  organization: [
    { to: '/org/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/org/corrections', label: 'Correction requests', icon: Inbox },
    { to: '/org/certificates/new', label: 'Issue certificate', icon: FilePlus2 },
    { to: '/org/certificates', label: 'Issued certificates', icon: FileCheck2, end: true },
    { to: '/org/templates', label: 'Templates', icon: LayoutTemplate },
    { to: '/org/profile', label: 'Organization profile', icon: Building2 },
    { to: '/org/account', label: 'My account', icon: User },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/organizations', label: 'Organizations', icon: Building2 },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/corrections', label: 'Correction requests', icon: FolderKanban },
    { to: '/admin/certificates', label: 'Certificates', icon: Award },
    { to: '/admin/categories', label: 'Categories', icon: Tags },
    { to: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
    { to: '/admin/messages', label: 'Contact messages', icon: Mail },
    { to: '/admin/account', label: 'My account', icon: User },
  ],
}

const ROLE_LABEL = { user: 'Personal account', organization: 'Organization', admin: 'Super admin' }

function Sidebar({ role, onNavigate }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV[role].map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-gradient-to-r from-blue-50 to-violet-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  const signOut = () => {
    logout()
    navigate('/login')
  }

  const orgStatus = user.organization?.status
  const initials = user.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  const sidebarFooter = (
    <div className="border-t border-slate-100 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="gradient-bg flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{user.full_name}</p>
          <p className="truncate text-xs text-slate-500">{user.organization?.name || ROLE_LABEL[user.role]}</p>
        </div>
        <button onClick={signOut} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Sign out" title="Sign out">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50/60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-100 px-5"><Logo to="/" /></div>
        <Sidebar role={user.role} />
        {sidebarFooter}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
              <Logo to="/" />
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <Sidebar role={user.role} onNavigate={() => setMobileOpen(false)} />
            {sidebarFooter}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <span className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
              <ShieldCheck className="h-4 w-4 text-violet-600" />{ROLE_LABEL[user.role]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/verify" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:block">Verify</Link>
            <NotificationBell />
          </div>
        </header>
        {user.role === 'organization' && orgStatus && orgStatus !== 'verified' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:px-6">
            Your organization is <strong>{orgStatus}</strong>. Issuing certificates, managing templates and reviewing corrections
            unlock once a platform administrator verifies your organization.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><Outlet /></main>
      </div>
    </div>
  )
}
