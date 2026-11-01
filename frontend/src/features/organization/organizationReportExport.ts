import type { AppointmentReport, ChairUtilizationReport, RevenueReport } from '../../api/organization'
import { formatPercent, formatVnd } from '../../components/branch-management/branchReportPresentation'
import { formatMinutes } from './organizationReports'

function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function exportOrganizationOperationsCsv({
  organizationName,
  from,
  to,
  appointments,
  chairs,
}: {
  organizationName: string
  from: string
  to: string
  appointments: AppointmentReport
  chairs: ChairUtilizationReport
}) {
  const rows = [
    ['Báo cáo vận hành DentaVie', organizationName],
    ['Khoảng thời gian', `${from} - ${to}`],
    [],
    ['Chi nhánh', 'Tổng lịch', 'Hoàn tất', 'Tỷ lệ hủy', 'Tỷ lệ không đến', 'Số ghế', 'Phút sử dụng', 'Hiệu suất ghế'],
    ...appointments.by_branch.map((item) => {
      const chair = chairs.by_branch.find((candidate) => candidate.branch_id === item.branch_id)
      return [
        item.branch_name,
        item.total_appointments,
        item.completed_count,
        formatPercent(item.cancellation_rate_percent),
        formatPercent(item.no_show_rate_percent),
        chair?.chair_count ?? 0,
        chair?.occupied_minutes ?? 0,
        chair ? formatPercent(chair.utilization_rate_percent) : '—',
      ]
    }),
  ]
  const csv = `\ufeff${rows.map((row) => row.map((value) => csvValue(value ?? '')).join(',')).join('\r\n')}`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = `bao-cao-van-hanh-${from}-${to}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

export function printOrganizationOperationsReport({
  organizationName,
  from,
  to,
  appointments,
  chairs,
}: {
  organizationName: string
  from: string
  to: string
  appointments: AppointmentReport
  chairs: ChairUtilizationReport
}) {
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.opener = null
  const rows = appointments.by_branch.map((item) => {
    const chair = chairs.by_branch.find((candidate) => candidate.branch_id === item.branch_id)
    return `<tr><td><strong>${escapeHtml(item.branch_name)}</strong></td><td>${escapeHtml(item.total_appointments)}</td><td>${escapeHtml(item.completed_count)}</td><td>${escapeHtml(formatPercent(item.cancellation_rate_percent))}</td><td>${escapeHtml(formatPercent(item.no_show_rate_percent))}</td><td>${chair ? `${escapeHtml(formatPercent(chair.utilization_rate_percent))}<small>${escapeHtml(chair.chair_count)} ghế · ${escapeHtml(formatMinutes(chair.occupied_minutes))}</small>` : '—'}</td></tr>`
  }).join('') || '<tr><td colspan="6" class="empty">Chưa có dữ liệu trong khoảng thời gian này.</td></tr>'
  const printedAt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo vận hành ${escapeHtml(organizationName)}</title><style>@page{size:A4 landscape;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#16384d;font-family:Arial,sans-serif;font-size:11px;line-height:1.45}.head{padding:20px 24px;border-radius:12px;background:#0c6179;color:#fff}.eyebrow{margin:0 0 9px;color:#b7eef2;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.head h1{margin:0;font-size:25px}.head p{margin:7px 0 0;color:#ddf8fa}.period{display:inline-block;margin-top:13px;padding:5px 9px;border:1px solid rgba(255,255,255,.35);border-radius:99px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:15px 0}.metric{padding:13px;border:1px solid #d8e7eb;border-radius:9px;background:#f9fcfd}.metric span{display:block;color:#66808c;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.metric strong{display:block;margin:6px 0;color:#082d4a;font-size:20px}h2{margin:20px 0 9px;color:#0b566d;font-size:15px}table{width:100%;border-collapse:collapse}th,td{padding:9px 10px;border-bottom:1px solid #dce8ec;text-align:left}th{background:#eaf6f8;color:#54717c;font-size:9px;letter-spacing:.07em;text-transform:uppercase}td small{display:block;margin-top:2px;color:#718995}.empty{text-align:center;color:#718995}.footer{margin-top:20px;padding-top:10px;border-top:1px solid #dce8ec;color:#78909a;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.head{background:#0c6179!important}}</style></head><body><header class="head"><p class="eyebrow">DentaVie · Báo cáo vận hành toàn chuỗi</p><h1>${escapeHtml(organizationName)}</h1><p>Chất lượng lịch hẹn và hiệu suất khai thác ghế</p><span class="period">${escapeHtml(from)} — ${escapeHtml(to)}</span></header><section class="metrics"><article class="metric"><span>Tổng lịch hẹn</span><strong>${escapeHtml(appointments.total_appointments)}</strong>${escapeHtml(appointments.completed_count)} hoàn tất</article><article class="metric"><span>Tỷ lệ hủy</span><strong>${escapeHtml(formatPercent(appointments.cancellation_rate_percent))}</strong>Không đến: ${escapeHtml(formatPercent(appointments.no_show_rate_percent))}</article><article class="metric"><span>Khai thác ghế</span><strong>${escapeHtml(formatPercent(chairs.utilization_rate_percent))}</strong>${escapeHtml(chairs.total_chairs)} ghế · ${escapeHtml(formatMinutes(chairs.occupied_minutes))}</article></section><h2>So sánh theo chi nhánh</h2><table><thead><tr><th>Chi nhánh</th><th>Lịch hẹn</th><th>Hoàn tất</th><th>Hủy</th><th>Không đến</th><th>Khai thác ghế</th></tr></thead><tbody>${rows}</tbody></table><footer class="footer">Tạo lúc ${escapeHtml(printedAt)} · DentaVie</footer></body></html>`)
  popup.document.close()
  popup.focus()
  window.setTimeout(() => popup.print(), 150)
  return true
}

export function exportOrganizationFinanceCsv({ organizationName, from, to, report }: { organizationName: string; from: string; to: string; report: RevenueReport }) {
  const rows = [
    ['Báo cáo doanh thu DentaVie', organizationName],
    ['Khoảng thời gian', `${from} - ${to}`],
    ['Tổng doanh thu đã thanh toán', formatVnd(report.total_revenue)],
    ['Số hóa đơn đã thanh toán', report.paid_invoice_count],
    [],
    ['Chi nhánh', 'Hóa đơn đã thanh toán', 'Doanh thu'],
    ...report.by_branch.map((item) => [item.branch_name, item.paid_invoice_count, formatVnd(item.revenue)]),
    [],
    ['Dịch vụ', 'Hóa đơn đã thanh toán', 'Doanh thu'],
    ...report.by_service.map((item) => [item.service_name, item.paid_invoice_count, formatVnd(item.revenue)]),
  ]
  const csv = `\ufeff${rows.map((row) => row.map((value) => csvValue(value ?? '')).join(',')).join('\r\n')}`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  link.download = `bao-cao-doanh-thu-${from}-${to}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

export function printOrganizationFinanceReport({ organizationName, from, to, report }: { organizationName: string; from: string; to: string; report: RevenueReport }) {
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.opener = null
  const branchRows = report.by_branch.map((item) => `<tr><td><strong>${escapeHtml(item.branch_name)}</strong></td><td>${escapeHtml(item.paid_invoice_count)}</td><td class="amount">${escapeHtml(formatVnd(item.revenue))}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Chưa có hóa đơn đã thanh toán.</td></tr>'
  const serviceRows = report.by_service.map((item) => `<tr><td>${escapeHtml(item.service_name)}</td><td>${escapeHtml(item.paid_invoice_count)}</td><td class="amount">${escapeHtml(formatVnd(item.revenue))}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Chưa có dữ liệu dịch vụ.</td></tr>'
  const printedAt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo doanh thu ${escapeHtml(organizationName)}</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#16384d;font-family:Arial,sans-serif;font-size:11px;line-height:1.45}.head{padding:20px 24px;border-radius:12px;background:#0c6179;color:#fff}.eyebrow{margin:0 0 9px;color:#b7eef2;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.head h1{margin:0;font-size:25px}.head p{margin:7px 0 0;color:#ddf8fa}.period{display:inline-block;margin-top:13px;padding:5px 9px;border:1px solid rgba(255,255,255,.35);border-radius:99px}.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:15px 0}.metric{padding:13px;border:1px solid #d8e7eb;border-radius:9px;background:#f9fcfd}.metric span{display:block;color:#66808c;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.metric strong{display:block;margin:6px 0;color:#082d4a;font-size:20px}h2{margin:20px 0 9px;color:#0b566d;font-size:15px}table{width:100%;border-collapse:collapse}th,td{padding:9px 10px;border-bottom:1px solid #dce8ec;text-align:left}th{background:#eaf6f8;color:#54717c;font-size:9px;letter-spacing:.07em;text-transform:uppercase}.amount{text-align:right;font-weight:700}.empty{text-align:center;color:#718995}.footer{margin-top:20px;padding-top:10px;border-top:1px solid #dce8ec;color:#78909a;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.head{background:#0c6179!important}}</style></head><body><header class="head"><p class="eyebrow">DentaVie · Báo cáo doanh thu toàn chuỗi</p><h1>${escapeHtml(organizationName)}</h1><p>Doanh thu chỉ tính trên hóa đơn đã thanh toán</p><span class="period">${escapeHtml(from)} — ${escapeHtml(to)}</span></header><section class="metrics"><article class="metric"><span>Doanh thu toàn chuỗi</span><strong>${escapeHtml(formatVnd(report.total_revenue))}</strong>Đã thanh toán</article><article class="metric"><span>Hóa đơn đã thanh toán</span><strong>${escapeHtml(report.paid_invoice_count)}</strong>Trong kỳ báo cáo</article></section><h2>Doanh thu theo chi nhánh</h2><table><thead><tr><th>Chi nhánh</th><th>Hóa đơn</th><th class="amount">Doanh thu</th></tr></thead><tbody>${branchRows}</tbody></table><h2>Doanh thu theo dịch vụ</h2><table><thead><tr><th>Dịch vụ</th><th>Hóa đơn</th><th class="amount">Doanh thu</th></tr></thead><tbody>${serviceRows}</tbody></table><footer class="footer">Tạo lúc ${escapeHtml(printedAt)} · DentaVie</footer></body></html>`)
  popup.document.close()
  popup.focus()
  window.setTimeout(() => popup.print(), 150)
  return true
}
