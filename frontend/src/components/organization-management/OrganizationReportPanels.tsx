import { Link } from 'react-router-dom'

import type {
  AppointmentReport,
  ChairUtilizationReport,
  RevenueReport,
} from '../../api/organization'
import {
  formatPercent,
  formatReportDate,
  formatVnd,
} from '../branch-management/branchReportPresentation'
import {
  buildBranchComparisonRows,
  formatMinutes,
} from '../../features/organization/organizationReports'

export function OrganizationReportSummary({
  revenue,
  appointments,
  chairs,
}: {
  revenue: RevenueReport
  appointments: AppointmentReport
  chairs: ChairUtilizationReport
}) {
  return (
    <section className="branch-management-summary" aria-label="Tổng quan toàn tổ chức">
      <article>
        <span>Doanh thu toàn tổ chức</span>
        <strong>{formatVnd(revenue.total_revenue)}</strong>
        <small>{revenue.paid_invoice_count} hóa đơn đã thanh toán</small>
      </article>
      <article>
        <span>Tổng lịch hẹn</span>
        <strong>{appointments.total_appointments}</strong>
        <small>Hoàn tất: {appointments.completed_count}</small>
      </article>
      <article>
        <span>Tỷ lệ hủy</span>
        <strong>{formatPercent(appointments.cancellation_rate_percent)}</strong>
        <small>Không đến: {formatPercent(appointments.no_show_rate_percent)}</small>
      </article>
      <article>
        <span>Khai thác ghế</span>
        <strong>{formatPercent(chairs.utilization_rate_percent)}</strong>
        <small>
          {chairs.total_chairs} ghế · {formatMinutes(chairs.occupied_minutes)} sử dụng
        </small>
      </article>
    </section>
  )
}

export function OrganizationBranchComparisonTable({
  revenue,
  appointments,
  chairs,
}: {
  revenue: RevenueReport
  appointments: AppointmentReport
  chairs: ChairUtilizationReport
}) {
  const rows = buildBranchComparisonRows(revenue, appointments, chairs)

  return (
    <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-branch-comparison-title">
      <header>
        <div>
          <span className="branch-report-eyebrow">SO SÁNH CHI NHÁNH</span>
          <h2 id="organization-branch-comparison-title">Hiệu quả theo chi nhánh</h2>
        </div>
        <small>Doanh thu, lịch hẹn và khai thác ghế</small>
      </header>
      {rows.length > 0 ? (
        <div className="branch-report-table-wrap">
          <table className="branch-report-table organization-report-table">
            <thead>
              <tr>
                <th>Chi nhánh</th>
                <th>Doanh thu</th>
                <th>Lịch hẹn</th>
                <th>Tỷ lệ hủy</th>
                <th>Khai thác ghế</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.branchId}>
                  <td>
                    <strong>{row.branchName}</strong>
                    <small>{row.paidInvoiceCount} hóa đơn</small>
                  </td>
                  <td>{formatVnd(row.revenue)}</td>
                  <td>
                    {row.totalAppointments}
                    <small> · {row.completedCount} hoàn tất</small>
                  </td>
                  <td>
                    {formatPercent(row.cancellationRatePercent)}
                    <small> · {formatPercent(row.noShowRatePercent)} không đến</small>
                  </td>
                  <td>
                    {formatPercent(row.chairUtilizationPercent)}
                    <small> · {row.chairCount} ghế</small>
                  </td>
                  <td>
                    <Link
                      className="organization-inline-link"
                      to={`/quan-ly-chi-nhanh/bao-cao?chi-nhanh=${row.branchId}`}
                    >
                      Xem báo cáo chi nhánh
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="branch-report-empty">Chưa có dữ liệu trong khoảng thời gian này.</p>
      )}
    </section>
  )
}

export function OrganizationServiceRevenueTable({ revenue }: { revenue: RevenueReport }) {
  return (
    <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-service-revenue-title">
      <header>
        <div>
          <span className="branch-report-eyebrow">DOANH THU DỊCH VỤ</span>
          <h2 id="organization-service-revenue-title">Doanh thu theo dịch vụ</h2>
        </div>
      </header>
      {revenue.by_service.length > 0 ? (
        <div className="branch-report-table-wrap">
          <table className="branch-report-table">
            <thead>
              <tr>
                <th>Dịch vụ</th>
                <th>Mã</th>
                <th>Hóa đơn</th>
                <th>Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {revenue.by_service.map((item, index) => (
                <tr key={`${item.service_id ?? 'unknown'}-${item.service_code}-${index}`}>
                  <td>{item.service_name}</td>
                  <td>{item.service_code || '—'}</td>
                  <td>{item.paid_invoice_count}</td>
                  <td>{formatVnd(item.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="branch-report-empty">Chưa có doanh thu đã thanh toán.</p>
      )}
    </section>
  )
}

export function OrganizationDailyRevenueTable({ revenue }: { revenue: RevenueReport }) {
  return (
    <section className="branch-report-daily organization-report-section" aria-labelledby="organization-daily-revenue-title">
      <header>
        <div>
          <span className="branch-report-eyebrow">CHI TIẾT DOANH THU</span>
          <h2 id="organization-daily-revenue-title">Doanh thu theo ngày</h2>
        </div>
        <small>Chỉ tính hóa đơn đã thanh toán</small>
      </header>
      {revenue.by_period.length > 0 ? (
        <div className="branch-report-table-wrap">
          <table className="branch-report-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Số hóa đơn</th>
                <th>Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {revenue.by_period.map((period) => (
                <tr key={period.period_start}>
                  <td>{formatReportDate(period.period_start)}</td>
                  <td>{period.paid_invoice_count}</td>
                  <td>{formatVnd(period.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="branch-report-empty">
          Chưa có doanh thu đã thanh toán trong khoảng thời gian này.
        </p>
      )}
    </section>
  )
}
