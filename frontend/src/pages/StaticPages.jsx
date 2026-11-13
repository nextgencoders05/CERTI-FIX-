import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MapPin, MessageSquare } from 'lucide-react'
import { Alert, Button, Card, Input, Textarea } from '../components/ui'
import { useToast } from '../hooks/useToast'
import api, { errorMessage } from '../services/api'

function Prose({ title, updated, children }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
      <div className="prose-page mt-6">{children}</div>
    </div>
  )
}

export function Privacy() {
  return (
    <Prose title="Privacy Policy" updated="November 2026">
      <p>This policy explains what CertiFix AI collects, why, and how long we keep it. Operators deploying this software must adapt it to their jurisdiction and legal entity.</p>
      <h2>Information we collect</h2>
      <ul>
        <li>Account data: name, email, phone (optional) and a salted bcrypt hash of your password.</li>
        <li>Organization data supplied during registration and verification.</li>
        <li>Certificates you upload, the text extracted from them by OCR, and correction requests you submit.</li>
        <li>Certificates issued through the platform and their verification history (with IP addresses stored only as one-way hashes).</li>
        <li>Security audit logs of significant actions (sign-in, uploads, approvals, administrative changes).</li>
      </ul>
      <h2>How uploaded certificates are handled</h2>
      <ul>
        <li>Uploaded files are stored in private storage, never at public URLs, and are only served to you, the organization reviewing your request, and platform administrators.</li>
        <li>OCR output is an aid for filling in forms. It is not treated as proof that a document is authentic.</li>
        <li>We never alter your uploaded document. Corrected certificates are newly issued by the issuing organization.</li>
      </ul>
      <h2>Retention</h2>
      <p>Uploaded documents are scheduled for deletion after the configured retention period (180 days by default). Documents attached to an open correction request are kept until the request is closed; afterwards the file is removed while the correction record is retained for auditability. You may delete uploads that are not attached to a correction request at any time.</p>
      <h2>Sharing</h2>
      <p>We share your correction request and the attached document only with the organization you submit it to. Public verification shows only the certificate details needed to confirm validity.</p>
      <h2>Your rights</h2>
      <p>You may access and update your profile, and request deletion of your account by <Link to="/contact" className="text-brand-600">contacting us</Link>.</p>
    </Prose>
  )
}

export function Terms() {
  return (
    <Prose title="Terms and Conditions" updated="November 2026">
      <p>By using CertiFix AI you agree to these terms.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Upload only certificates issued to you, or that you are authorized to handle.</li>
        <li>Do not submit false information in correction requests or attempt to obtain certificates you are not entitled to.</li>
        <li>Do not attempt to bypass security controls, rate limits or access other users&apos; data.</li>
      </ul>
      <h2>Organizations</h2>
      <ul>
        <li>Organizations must provide accurate details and be verified by a platform administrator before issuing certificates.</li>
        <li>Organizations are responsible for checking correction requests against their own records before approval.</li>
        <li>Certificates issued through the platform represent the organization&apos;s official statement.</li>
      </ul>
      <h2>No unauthorized editing</h2>
      <p>CertiFix AI does not provide tools to edit existing certificates. Only the issuing organization can approve a correction, which results in a new certificate with a new ID; the previous certificate is marked as superseded.</p>
      <h2>OCR accuracy</h2>
      <p>Text extracted by OCR may contain errors and must be reviewed. OCR results are not evidence of authenticity.</p>
      <h2>Suspension</h2>
      <p>We may suspend accounts or organizations that violate these terms.</p>
      <h2>Liability</h2>
      <p>The service is provided &quot;as is&quot;. Operators should define liability terms appropriate to their deployment.</p>
    </Prose>
  )
}

export function Contact() {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/contact', form)
      setSent(true)
      toast.success('Message sent.')
      setForm({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contact us</h1>
        <p className="mt-3 text-slate-600">Questions about a certificate, your organization&apos;s verification, or the platform? Send us a message.</p>
        <div className="mt-8 space-y-5 text-sm">
          <div className="flex gap-3"><MessageSquare className="h-5 w-5 text-violet-600" /><p className="text-slate-600">About a specific correction? Use the request page in your dashboard so the issuer sees it.</p></div>
          <div className="flex gap-3"><Mail className="h-5 w-5 text-violet-600" /><p className="text-slate-600">We usually reply within two business days.</p></div>
          <div className="flex gap-3"><MapPin className="h-5 w-5 text-violet-600" /><p className="text-slate-600">Messages are reviewed by platform administrators.</p></div>
        </div>
      </div>
      <Card className="p-6 sm:p-8 lg:col-span-3">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error && <div className="sm:col-span-2"><Alert type="error">{error}</Alert></div>}
          {sent && <div className="sm:col-span-2"><Alert type="success">Thank you — your message has been received.</Alert></div>}
          <Input label="Name" required value={form.name} onChange={set('name')} />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
          <Input className="sm:col-span-2" label="Subject" required value={form.subject} onChange={set('subject')} />
          <Textarea className="sm:col-span-2" label="Message" rows={6} required minLength={10} value={form.message} onChange={set('message')} />
          <div className="sm:col-span-2"><Button type="submit" loading={busy}>Send message</Button></div>
        </form>
      </Card>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="gradient-text text-6xl font-black">404</p>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link to="/" className="mt-6 text-sm font-medium text-brand-600 hover:underline">Back to home</Link>
    </div>
  )
}
