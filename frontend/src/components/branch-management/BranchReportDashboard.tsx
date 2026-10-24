import {
  type BranchReportData,
  formatPercent,
  formatReportDate,
  formatVnd,
} from './branchReportPresentation'

interface BranchReportDashboardProps {
  data: BranchReportData
}

export function BranchReportDashboard({ data }: BranchReportDashboardProps) {
  return (
    <>
      <section className="branch-management-summary" aria-label="Tổng quan báo cáo">
        <article>
          <span>Doanh thu</span>
          <strong>{formatVnd(data.revenue.total_revenue)}</strong>
          <small>{data.revenue.paid_invoice_count} hóa đơn đã thanh toán</small>
        </article>
        <article>
          <span>Tổng lịch hẹn</span>
          <strong>{data.appointments.total_appointments}</strong>
          <small>Hoàn tất: {data.appointments.completed_count}</small>
        </article>
        <article>
          <span>Tỷ lệ hủy</span>
          <strong>{formatPercent(data.appointments.cancellation_rate_percent)}</strong>
          <small>
            Không đến: {formatPercent(data.appointments.no_show_rate_percent)}
          </small>
        </article>
        <article>
          <span>Khai thác ghế</span>
          <strong>{formatPercent(data.chairs.utilization_rate_percent)}</strong>
          <small>{data.chairs.occupied_minutes} phút sử dụng</small>
        </article>
      </section>

      <section className="branch-report-daily" aria-labelledby="daily-revenue-title">
        <header>
          <div>
            <span className="branch-report-eyebrow">CHI TIẾT DOANH THU</span>
            <h2 id="daily-revenue-title">Doanh thu theo ngày</h2>
          </div>
          <small>Chỉ tính hóa đơn đã thanh toán</small>
        </header>

        {data.revenue.by_period.length > 0 ? (
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
                {data.revenue.by_period.map((period) => (
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
    </>
  )
}
