import { lazy, Suspense } from 'react'
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom'

const HomePage = lazy(() => import('./pages/HomePage').then(({ HomePage: Page }) => ({ default: Page })))
const BranchDetailPage = lazy(() => import('./pages/BranchDetailPage').then(({ BranchDetailPage: Page }) => ({ default: Page })))
const BookingPage = lazy(() => import('./pages/BookingPage').then(({ BookingPage: Page }) => ({ default: Page })))
const PricingPage = lazy(() => import('./pages/PricingPage').then(({ PricingPage: Page }) => ({ default: Page })))
const AboutDentaViePage = lazy(() => import('./pages/AboutDentaViePage').then(({ AboutDentaViePage: Page }) => ({ default: Page })))
const PatientProfilePage = lazy(() => import('./pages/PatientProfilePage').then(({ PatientProfilePage: Page }) => ({ default: Page })))
const NotificationsPage = lazy(() => import('./pages/PatientRecordsPages').then(({ NotificationsPage: Page }) => ({ default: Page })))
const PatientAppointmentsPage = lazy(() => import('./pages/PatientRecordsPages').then(({ PatientAppointmentsPage: Page }) => ({ default: Page })))
const PatientHistoryPage = lazy(() => import('./pages/PatientRecordsPages').then(({ PatientHistoryPage: Page }) => ({ default: Page })))
const PatientInvoicesPage = lazy(() => import('./pages/PatientRecordsPages').then(({ PatientInvoicesPage: Page }) => ({ default: Page })))
const DentistDashboardPage = lazy(() => import('./pages/DentistDashboardPage').then(({ DentistDashboardPage: Page }) => ({ default: Page })))
const DentistBranchSelectionPage = lazy(() => import('./pages/DentistBranchSelectionPage').then(({ DentistBranchSelectionPage: Page }) => ({ default: Page })))
const DentistExaminationPage = lazy(() => import('./pages/DentistExaminationPage').then(({ DentistExaminationPage: Page }) => ({ default: Page })))
const BranchManagementPage = lazy(() => import('./pages/BranchManagementPage').then(({ BranchManagementPage: Page }) => ({ default: Page })))
const BranchDashboardPage = lazy(() => import('./pages/BranchDashboardPage').then(({ BranchDashboardPage: Page }) => ({ default: Page })))
const BranchStaffSchedulePage = lazy(() => import('./pages/BranchStaffSchedulePage').then(({ BranchStaffSchedulePage: Page }) => ({ default: Page })))
const BranchReportsPage = lazy(() => import('./pages/BranchReportsPage').then(({ BranchReportsPage: Page }) => ({ default: Page })))
const BranchInvoicesPage = lazy(() => import('./pages/BranchInvoicesPage').then(({ BranchInvoicesPage: Page }) => ({ default: Page })))
const BranchConfigurationPage = lazy(() => import('./pages/BranchConfigurationPage').then(({ BranchConfigurationPage: Page }) => ({ default: Page })))
const PayosResultPage = lazy(() => import('./pages/PayosResultPage').then(({ PayosResultPage: Page }) => ({ default: Page })))
const AcceptInvitationPage = lazy(() => import('./pages/AcceptInvitationPage').then(({ AcceptInvitationPage: Page }) => ({ default: Page })))
const OrganizationOverviewPage = lazy(() => import('./pages/OrganizationOverviewPage').then(({ OrganizationOverviewPage: Page }) => ({ default: Page })))
const OrganizationAppointmentsPage = lazy(() => import('./pages/OrganizationAppointmentsPage').then(({ OrganizationAppointmentsPage: Page }) => ({ default: Page })))
const OrganizationStaffSchedulePage = lazy(() => import('./pages/OrganizationStaffSchedulePage').then(({ OrganizationStaffSchedulePage: Page }) => ({ default: Page })))
const OrganizationFinancePage = lazy(() => import('./pages/OrganizationFinancePage').then(({ OrganizationFinancePage: Page }) => ({ default: Page })))
const OrganizationOperationsReportPage = lazy(() => import('./pages/OrganizationOperationsReportPage').then(({ OrganizationOperationsReportPage: Page }) => ({ default: Page })))
const OrganizationBranchesPage = lazy(() => import('./pages/OrganizationBranchesPage').then(({ OrganizationBranchesPage: Page }) => ({ default: Page })))
const OrganizationStaffPage = lazy(() => import('./pages/OrganizationStaffPage').then(({ OrganizationStaffPage: Page }) => ({ default: Page })))
const OrganizationServicesPage = lazy(() => import('./pages/OrganizationServicesPage').then(({ OrganizationServicesPage: Page }) => ({ default: Page })))
const OrganizationAuditPage = lazy(() => import('./pages/OrganizationAuditPage').then(({ OrganizationAuditPage: Page }) => ({ default: Page })))
const OrganizationSettingsPage = lazy(() => import('./pages/OrganizationSettingsPage').then(({ OrganizationSettingsPage: Page }) => ({ default: Page })))
const AccountSecurityPage = lazy(() => import('./pages/AccountSecurityPage').then(({ AccountSecurityPage: Page }) => ({ default: Page })))
const PrivacyPolicyPage = lazy(() => import('./pages/LegalPages').then(({ PrivacyPolicyPage: Page }) => ({ default: Page })))
const TermsPage = lazy(() => import('./pages/LegalPages').then(({ TermsPage: Page }) => ({ default: Page })))
const EmailVerificationPendingPage = lazy(() => import('./pages/AuthPages').then(({ EmailVerificationPendingPage: Page }) => ({ default: Page })))
const ForgotPasswordPage = lazy(() => import('./pages/AuthPages').then(({ ForgotPasswordPage: Page }) => ({ default: Page })))
const LoginPage = lazy(() => import('./pages/AuthPages').then(({ LoginPage: Page }) => ({ default: Page })))
const RegisterPage = lazy(() => import('./pages/AuthPages').then(({ RegisterPage: Page }) => ({ default: Page })))
const ResetPasswordPage = lazy(() => import('./pages/AuthPages').then(({ ResetPasswordPage: Page }) => ({ default: Page })))
const VerifyEmailPage = lazy(() => import('./pages/AuthPages').then(({ VerifyEmailPage: Page }) => ({ default: Page })))
import { ErrorBoundary } from './components/ErrorBoundary'
import { AdminShell } from './components/admin/AdminShell'
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
      <Route element={<AdminShell />}>
        <Route path="/quan-ly-chi-nhanh" element={<BranchDashboardPage />} />
        <Route path="/quan-ly-chi-nhanh/lich-hen" element={<BranchManagementPage />} />
        <Route path="/quan-ly-chi-nhanh/ca-lam" element={<BranchStaffSchedulePage />} />
        <Route path="/quan-ly-chi-nhanh/bao-cao" element={<BranchReportsPage />} />
        <Route path="/quan-ly-chi-nhanh/hoa-don" element={<BranchInvoicesPage />} />
        <Route path="/quan-ly-chi-nhanh/cau-hinh" element={<BranchConfigurationPage />} />
      </Route>
    </Route>
    <Route element={<RequireRole area="ORGANIZATION" />}>
      <Route element={<AdminShell />}>
        <Route path="/quan-ly-to-chuc" element={<OrganizationOverviewPage />} />
        <Route path="/quan-ly-to-chuc/lich-hen" element={<OrganizationAppointmentsPage />} />
        <Route path="/quan-ly-to-chuc/ca-lam" element={<OrganizationStaffSchedulePage />} />
        <Route path="/quan-ly-to-chuc/tai-chinh" element={<OrganizationFinancePage />} />
        <Route path="/quan-ly-to-chuc/bao-cao" element={<OrganizationOperationsReportPage />} />
        <Route path="/quan-ly-to-chuc/chi-nhanh" element={<OrganizationBranchesPage />} />
        <Route path="/quan-ly-to-chuc/nhan-su" element={<OrganizationStaffPage />} />
        <Route path="/quan-ly-to-chuc/dich-vu" element={<OrganizationServicesPage />} />
        <Route path="/quan-ly-to-chuc/nhat-ky" element={<OrganizationAuditPage />} />
        <Route path="/quan-ly-to-chuc/cau-hinh" element={<OrganizationSettingsPage />} />
      </Route>
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
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="route-auth-loading" role="status">Đang tải trang...</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </ErrorBoundary>
  )
}
