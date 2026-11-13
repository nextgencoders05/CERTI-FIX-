import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from '../components/common'
import { useAuth, homePath } from '../hooks/useAuth'

const LINKS = [
  { to: '/verify', label: 'Verify a certificate' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/contact', label: 'Contact' },
]

export default function PublicLayout() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className="text-sm font-medium text-slate-600 hover:text-slate-900">{l.label}</NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <Link to={homePath(user.role)} className="gradient-bg rounded-lg px-4 py-2 text-sm font-medium text-white">Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900">Sign in</Link>
                <Link to="/register" className="gradient-bg rounded-lg px-4 py-2 text-sm font-medium text-white">Get started</Link>
              </>
            )}
          </div>
          <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="border-t border-slate-100 px-4 py-3 md:hidden">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block py-2 text-sm font-medium text-slate-700">{l.label}</Link>
            ))}
            {user ? (
              <Link to={homePath(user.role)} onClick={() => setOpen(false)} className="block py-2 text-sm font-semibold text-brand-600">Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className="block py-2 text-sm font-medium text-slate-700">Sign in</Link>
                <Link to="/register" onClick={() => setOpen(false)} className="block py-2 text-sm font-semibold text-brand-600">Get started</Link>
              </>
            )}
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-slate-500">
              Certificate issuance, correction and verification for organizations and the people they certify.
              Only verified issuing organizations can approve corrections and issue certificates.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Platform</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><Link to="/verify" className="hover:text-slate-900">Verify certificate</Link></li>
              <li><Link to="/register" className="hover:text-slate-900">Create account</Link></li>
              <li><Link to="/register?type=organization" className="hover:text-slate-900">For organizations</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><Link to="/privacy" className="hover:text-slate-900">Privacy policy</Link></li>
              <li><Link to="/terms" className="hover:text-slate-900">Terms &amp; conditions</Link></li>
              <li><Link to="/contact" className="hover:text-slate-900">Contact</Link></li>
            </ul>
          </div>
        </div>
        <p className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">© {new Date().getFullYear()} CertiFix AI</p>
      </footer>
    </div>
  )
}
