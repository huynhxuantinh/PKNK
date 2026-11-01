import {
  type BranchReportData,
  formatPercent,
  formatReportDate,
  formatVnd,
} from './branchReportPresentation'
import './branch-report-dashboard.css'

interface BranchReportDashboardProps {
  data: BranchReportData
}

export function BranchReportDashboard({ data }: BranchReportDashboardProps) {
  const maximumRevenue = Math.max(1, ...data.revenue.by_period.map((period) => Number(period.revenue) || 0))
  const cancellationRate = Math.min(100, Math.max(0, Number(data.appointments.cancellation_rate_percent) || 0))
  const chairRate = Math.min(100, Math.max(0, Number(data.chairs.utilization_rate_percent) || 0))
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

      <section className="branch-report-analytics" aria-label="Phân tích vận hành">
        <article className="branch-report-chart-card">
          <header><div><p className="eyebrow">Doanh thu</p><h2>Biến động theo ngày</h2></div><strong>{formatVnd(data.revenue.total_revenue)}</strong></header>
          {data.revenue.by_period.length ? <div className="branch-report-bars">{data.revenue.by_period.map((period) => <div key={period.period_start} title={`${formatReportDate(period.period_start)}: ${formatVnd(period.revenue)}`}><i style={{ height: `${Math.max(6, Number(period.revenue) / maximumRevenue * 100)}%` }} /><span>{formatReportDate(period.period_start).slice(0, 5)}</span></div>)}</div> : <p className="branch-report-empty">Chưa có doanh thu đã thanh toán trong khoảng này.</p>}
        </article>
        <article className="branch-report-rate-card"><p className="eyebrow">Chất lượng lịch hẹn</p><h2>Tỷ lệ hủy</h2><div className="branch-report-ring is-cancel" style={{ '--rate': `${cancellationRate * 3.6}deg` } as React.CSSProperties}><strong>{formatPercent(cancellationRate)}</strong></div><p>{data.appointments.completed_count}/{data.appointments.total_appointments} lịch đã hoàn tất · Không đến {formatPercent(data.appointments.no_show_rate_percent)}</p></article>
        <article className="branch-report-rate-card"><p className="eyebrow">Nguồn lực</p><h2>Hiệu suất ghế</h2><div className="branch-report-ring is-chair" style={{ '--rate': `${chairRate * 3.6}deg` } as React.CSSProperties}><strong>{formatPercent(chairRate)}</strong></div><p>{data.chairs.occupied_minutes} phút được sử dụng trong khoảng đã chọn.</p></article>
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
