import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/common'
import DashboardLayout from './layouts/DashboardLayout'
import PublicLayout from './layouts/PublicLayout'
import { useAuth, homePath } from './hooks/useAuth'
import Landing from './pages/Landing'
import { Login, Register } from './pages/Auth'
import Verify from './pages/Verify'
import { Contact, NotFound, Privacy, Terms } from './pages/StaticPages'
import Account from './dashboard/shared/Account'
import { CertificateDetail, CertificatesList } from './dashboard/shared/Certificates'
import { CorrectionDetail, CorrectionsList } from './dashboard/shared/Corrections'
import { DocumentsList, UploadCertificate, UserDashboard } from './dashboard/user/UserPages'
import DocumentDetail from './dashboard/user/DocumentDetail'
import { IssueCertificate, OrgDashboard, OrgProfile, TemplateEditor, Templates } from './dashboard/org/OrgPages'
import { AdminCategories, AdminDashboard, AdminOrganizations, AdminUsers, AuditLogs, ContactMessages } from './dashboard/admin/AdminPages'

function DashboardRedirect() {
  const { user } = useAuth()
  return <Navigate to={homePath(user.role)} replace />
}

const area = (roles) => (
  <ProtectedRoute roles={roles}><DashboardLayout /></ProtectedRoute>
)

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/verify/:number" element={<Verify />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/contact" element={<Contact />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />

      <Route path="/app" element={area(['user'])}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<UserDashboard />} />
        <Route path="upload" element={<UploadCertificate />} />
        <Route path="documents" element={<DocumentsList />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route path="corrections" element={<CorrectionsList />} />
        <Route path="corrections/:id" element={<CorrectionDetail />} />
        <Route path="certificates" element={<CertificatesList />} />
        <Route path="certificates/:id" element={<CertificateDetail />} />
        <Route path="profile" element={<Account />} />
      </Route>

      <Route path="/org" element={area(['organization'])}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<OrgDashboard />} />
        <Route path="corrections" element={<CorrectionsList />} />
        <Route path="corrections/:id" element={<CorrectionDetail />} />
        <Route path="certificates" element={<CertificatesList />} />
        <Route path="certificates/new" element={<IssueCertificate />} />
        <Route path="certificates/:id" element={<CertificateDetail />} />
        <Route path="templates" element={<Templates />} />
        <Route path="templates/new" element={<TemplateEditor />} />
        <Route path="templates/:id" element={<TemplateEditor />} />
        <Route path="profile" element={<OrgProfile />} />
        <Route path="account" element={<Account />} />
      </Route>

      <Route path="/admin" element={area(['admin'])}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="organizations" element={<AdminOrganizations />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="corrections" element={<CorrectionsList />} />
        <Route path="corrections/:id" element={<CorrectionDetail />} />
        <Route path="certificates" element={<CertificatesList />} />
        <Route path="certificates/:id" element={<CertificateDetail />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="messages" element={<ContactMessages />} />
        <Route path="account" element={<Account />} />
      </Route>

      <Route element={<PublicLayout />}>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
