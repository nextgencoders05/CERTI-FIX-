import { Link } from 'react-router-dom'
import {
  ArrowRight, BadgeCheck, Building2, FileSearch, FileSignature, History, Lock, QrCode, ScanText, ShieldCheck, Upload,
} from 'lucide-react'

const FEATURES = [
  { icon: ScanText, title: 'AI-powered OCR', text: 'Upload a PDF or photo. We read the text with Tesseract OCR and pre-fill the certificate fields for you to review.' },
  { icon: FileSignature, title: 'Authorized corrections', text: 'Correction requests go to the issuing organization. Only they can approve and issue a corrected certificate.' },
  { icon: QrCode, title: 'QR verification', text: 'Every issued certificate carries a unique ID and QR code that anyone can verify instantly.' },
  { icon: History, title: 'Full history', text: 'Original document, requested changes, approval records and superseded certificates are all kept on record.' },
  { icon: Building2, title: 'Template designer', text: 'Organizations design branded templates with their logo, colors, signatory and layout.' },
  { icon: Lock, title: 'Private by design', text: 'Uploads are stored privately and only served to authorized people. Never via public links.' },
]

const STEPS = [
  { icon: Upload, title: 'Upload', text: 'Upload your certificate as a PDF or image.' },
  { icon: FileSearch, title: 'Review OCR', text: 'Check the fields the AI extracted and mark what is wrong.' },
  { icon: Building2, title: 'Issuer reviews', text: 'The issuing organization verifies your request against its records.' },
  { icon: BadgeCheck, title: 'Get corrected certificate', text: 'An authorized, newly numbered certificate is issued; the old one is marked superseded.' },
]

export default function Landing() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-200/50 to-violet-200/50 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/70 px-3 py-1 text-xs font-medium text-violet-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Trusted certificate corrections, authorized by issuers
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            Fix certificate errors the <span className="gradient-text">right way</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            CertiFix AI reads your certificate with OCR, routes correction requests to the issuing organization,
            and delivers an officially re-issued, verifiable certificate.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register" className="gradient-bg inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20">
              Request a correction <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/verify" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <BadgeCheck className="h-4 w-4" /> Verify a certificate
            </Link>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Issuing a certificate? <Link to="/register?type=organization" className="font-medium text-brand-600 hover:underline">Register your organization</Link>
          </p>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-100 bg-slate-50/70 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">How corrections work</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            We never edit your document. Corrections are approved and re-issued only by the organization that issued the certificate.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card relative p-6">
                <span className="absolute right-5 top-5 text-4xl font-black text-slate-100">{i + 1}</span>
                <div className="gradient-bg mb-4 inline-flex rounded-xl p-2.5"><s.icon className="h-5 w-5 text-white" /></div>
                <h3 className="font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">Everything issuers and recipients need</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 p-6 transition hover:border-violet-200 hover:shadow-md">
                <f.icon className="h-6 w-6 text-violet-600" />
                <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="gradient-bg mx-auto max-w-5xl rounded-3xl px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-bold">Have a certificate to check?</h2>
          <p className="mx-auto mt-3 max-w-xl text-blue-100">Enter its certificate ID or scan its QR code to see whether it is valid, revoked or superseded.</p>
          <Link to="/verify" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700">
            Verify now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  )
}
