import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages'
import { HomePage } from './pages/HomePage'
import { BranchDetailPage } from './pages/BranchDetailPage'
import { BookingPage } from './pages/BookingPage'
import { PricingPage } from './pages/PricingPage'
import { PatientProfilePage } from './pages/PatientProfilePage'
import { PatientAppointmentsPage, PatientHistoryPage } from './pages/PatientRecordsPages'
import { DentistDashboardPage } from './pages/DentistDashboardPage'
import { DentistBranchSelectionPage } from './pages/DentistBranchSelectionPage'
import { DentistExaminationPage } from './pages/DentistExaminationPage'
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
          <Route path="/bac-si" element={<DentistDashboardPage />} />
          <Route path="/bac-si/chon-chi-nhanh" element={<DentistBranchSelectionPage />} />
          <Route path="/bac-si/kham/:publicCode" element={<DentistExaminationPage />} />
          <Route path="/dang-nhap" element={<LoginPage />} />
          <Route path="/dang-ky" element={<RegisterPage />} />
          <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
