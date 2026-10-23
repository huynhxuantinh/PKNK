import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { EmailVerificationPendingPage, ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from './pages/AuthPages'
import { HomePage } from './pages/HomePage'
import { BranchDetailPage } from './pages/BranchDetailPage'
import { BookingPage } from './pages/BookingPage'
import { PricingPage } from './pages/PricingPage'
import { PatientProfilePage } from './pages/PatientProfilePage'
import { NotificationsPage, PatientAppointmentsPage, PatientHistoryPage, PatientInvoicesPage } from './pages/PatientRecordsPages'
import { DentistDashboardPage } from './pages/DentistDashboardPage'
import { DentistBranchSelectionPage } from './pages/DentistBranchSelectionPage'
import { DentistExaminationPage } from './pages/DentistExaminationPage'
import { BranchManagementPage } from './pages/BranchManagementPage'
import { BranchStaffSchedulePage } from './pages/BranchStaffSchedulePage'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chi-nhanh/:branchId" element={<BranchDetailPage />} />
          <Route path="/dat-lich" element={<BookingPage />} />
          <Route path="/bang-gia" element={<PricingPage />} />
          <Route path="/ho-so" element={<PatientProfilePage />} />
          <Route path="/lich-hen" element={<PatientAppointmentsPage />} />
          <Route path="/lich-su-kham" element={<PatientHistoryPage />} />
          <Route path="/hoa-don" element={<PatientInvoicesPage />} />
          <Route path="/thong-bao" element={<NotificationsPage />} />
          <Route path="/bac-si" element={<DentistDashboardPage />} />
          <Route path="/bac-si/chon-chi-nhanh" element={<DentistBranchSelectionPage />} />
          <Route path="/bac-si/kham/:publicCode" element={<DentistExaminationPage />} />
          <Route path="/quan-ly-chi-nhanh" element={<BranchManagementPage />} />
          <Route path="/quan-ly-chi-nhanh/ca-lam" element={<BranchStaffSchedulePage />} />
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route path="/dang-ky" element={<RegisterPage />} />
          <Route path="/xac-minh-email" element={<EmailVerificationPendingPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
