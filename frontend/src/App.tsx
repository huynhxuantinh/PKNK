import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom'

import { EmailVerificationPendingPage, ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from './pages/AuthPages'
import { HomePage } from './pages/HomePage'
import { BranchDetailPage } from './pages/BranchDetailPage'
import { BookingPage } from './pages/BookingPage'
import { PricingPage } from './pages/PricingPage'
import { AboutDentaViePage } from './pages/AboutDentaViePage'
import { PatientProfilePage } from './pages/PatientProfilePage'
import { NotificationsPage, PatientAppointmentsPage, PatientHistoryPage, PatientInvoicesPage } from './pages/PatientRecordsPages'
import { DentistDashboardPage } from './pages/DentistDashboardPage'
import { DentistBranchSelectionPage } from './pages/DentistBranchSelectionPage'
import { DentistExaminationPage } from './pages/DentistExaminationPage'
import { BranchManagementPage } from './pages/BranchManagementPage'
import { BranchStaffSchedulePage } from './pages/BranchStaffSchedulePage'
import { BranchReportsPage } from './pages/BranchReportsPage'
import { BranchInvoicesPage } from './pages/BranchInvoicesPage'
import { BranchConfigurationPage } from './pages/BranchConfigurationPage'
import { PayosResultPage } from './pages/PayosResultPage'
import { AcceptInvitationPage } from './pages/AcceptInvitationPage'
import { OrganizationOverviewPage } from './pages/OrganizationOverviewPage'
import { OrganizationBranchesPage } from './pages/OrganizationBranchesPage'
import { OrganizationStaffPage } from './pages/OrganizationStaffPage'
import { OrganizationServicesPage } from './pages/OrganizationServicesPage'
import { OrganizationAuditPage } from './pages/OrganizationAuditPage'
import { AccountSecurityPage } from './pages/AccountSecurityPage'
import { PrivacyPolicyPage, TermsPage } from './pages/LegalPages'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RequireRole } from './auth/RequireRole'

const router = createBrowserRouter(createRoutesFromElements(
  <Route>
    <Route path="/" element={<HomePage />} />
    <Route path="/chi-nhanh/:branchId" element={<BranchDetailPage />} />
    <Route path="/bang-gia" element={<PricingPage />} />
    <Route path="/ve-dentavie" element={<AboutDentaViePage />} />
    <Route path="/chinh-sach-bao-mat" element={<PrivacyPolicyPage />} />
    <Route path="/dieu-khoan-su-dung" element={<TermsPage />} />
    <Route element={<RequireRole area="AUTHENTICATED" />}>
      <Route path="/doi-mat-khau" element={<AccountSecurityPage />} />
    </Route>
    <Route element={<RequireRole area="PATIENT" />}>
      <Route path="/dat-lich" element={<BookingPage />} />
      <Route path="/ho-so" element={<PatientProfilePage />} />
      <Route path="/lich-hen" element={<PatientAppointmentsPage />} />
      <Route path="/lich-su-kham" element={<PatientHistoryPage />} />
      <Route path="/hoa-don" element={<PatientInvoicesPage />} />
      <Route path="/hoa-don/ket-qua" element={<PayosResultPage />} />
      <Route path="/thong-bao" element={<NotificationsPage />} />
    </Route>
    <Route element={<RequireRole area="DENTIST" />}>
      <Route path="/bac-si" element={<DentistDashboardPage />} />
      <Route path="/bac-si/chon-chi-nhanh" element={<DentistBranchSelectionPage />} />
      <Route path="/bac-si/kham/:publicCode" element={<DentistExaminationPage />} />
    </Route>
    <Route element={<RequireRole area="MANAGEMENT" />}>
      <Route path="/quan-ly-chi-nhanh" element={<BranchManagementPage />} />
      <Route path="/quan-ly-chi-nhanh/ca-lam" element={<BranchStaffSchedulePage />} />
      <Route path="/quan-ly-chi-nhanh/bao-cao" element={<BranchReportsPage />} />
      <Route path="/quan-ly-chi-nhanh/hoa-don" element={<BranchInvoicesPage />} />
      <Route path="/quan-ly-chi-nhanh/cau-hinh" element={<BranchConfigurationPage />} />
    </Route>
    <Route element={<RequireRole area="ORGANIZATION" />}>
      <Route path="/quan-ly-to-chuc" element={<OrganizationOverviewPage />} />
      <Route path="/quan-ly-to-chuc/chi-nhanh" element={<OrganizationBranchesPage />} />
      <Route path="/quan-ly-to-chuc/nhan-su" element={<OrganizationStaffPage />} />
      <Route path="/quan-ly-to-chuc/dich-vu" element={<OrganizationServicesPage />} />
      <Route path="/quan-ly-to-chuc/nhat-ky" element={<OrganizationAuditPage />} />
    </Route>
    <Route path="/dang-nhap" element={<LoginPage />} />
    <Route path="/dang-ky" element={<RegisterPage />} />
    <Route path="/xac-minh-email" element={<EmailVerificationPendingPage />} />
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>,
))

export default function App() {
  return <ErrorBoundary><RouterProvider router={router} /></ErrorBoundary>
}
