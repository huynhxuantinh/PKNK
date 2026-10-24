import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { branchReport } from '../api/management'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import { BranchReportDashboard } from '../components/branch-management/BranchReportDashboard'
import {
  type BranchReportData,
  validateReportDateRange,
} from '../components/branch-management/branchReportPresentation'
import { ManagementPageHeader } from '../components/branch-management/ManagementPageHeader'
import { ManagementSectionNav } from '../components/branch-management/ManagementSectionNav'

const iso = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date)

export function BranchReportsPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const branchId = Number(params.get('chi-nhanh')) || 0
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = useState(() => iso(new Date()))
  const [data, setData] = useState<BranchReportData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const loadedBranchRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    const rangeError = validateReportDateRange(from, to)

    if (rangeError) {
      setLoading(false)
      setData(null)
      setError(rangeError)
      return
    }

    setLoading(true)
    setData(null)
    setError('')

    try {
      const [revenue, appointments, chairs] = await Promise.all([
        branchReport(branchId, 'revenue', from, to),
        branchReport(branchId, 'appointments', from, to),
        branchReport(branchId, 'chair-utilization', from, to),
      ])

      setData({
        revenue: revenue.data as unknown as BranchReportData['revenue'],
        appointments: appointments.data as unknown as BranchReportData['appointments'],
        chairs: chairs.data as unknown as BranchReportData['chairs'],
      })
    } catch (caught) {
      setData(null)
      setError(caught instanceof Error ? caught.message : 'Không thể tải báo cáo.')
    } finally {
      setLoading(false)
    }
  }, [branchId, from, to])

  useEffect(() => {
    if (branchId && loadedBranchRef.current !== branchId) {
      loadedBranchRef.current = branchId
      void load()
    }
  }, [branchId, load])

  if (!canAccessArea(user, 'MANAGEMENT') || !branchId) {
    return <Navigate to="/quan-ly-chi-nhanh" replace />
  }

  return (
    <div className="branch-management-page">
      <ManagementPageHeader
        title="Báo cáo chi nhánh"
        path="/quan-ly-chi-nhanh/bao-cao"
      />

      <main className="branch-management-main">
        <Link
          className="staff-schedule-back"
          to={`/quan-ly-chi-nhanh?chi-nhanh=${branchId}`}
        >
          ← Quay lại quản lý chi nhánh
        </Link>
        <h1>Báo cáo chi nhánh</h1>
        <ManagementSectionNav branchId={branchId} active="reports" />

        <div className="branch-management-filters">
          <label>
            Từ ngày
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            Đến ngày
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button type="button" disabled={loading} onClick={() => void load()}>
            {loading ? 'Đang tải...' : 'Xem báo cáo'}
          </button>
        </div>

        {error && (
          <div className="dentist-error" role="alert">
            {error}
          </div>
        )}
        {loading && (
          <p className="branch-report-loading" role="status" aria-live="polite">
            Đang tải báo cáo...
          </p>
        )}
        {!loading && data && <BranchReportDashboard data={data} />}
      </main>
    </div>
  )
}
