import {
  formatPercent,
  formatReportDate,
  formatVnd,
  type BranchReportData,
} from "./branchReportPresentation";

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function printBranchReport({
  branchName,
  from,
  to,
  data,
}: {
  branchName: string;
  from: string;
  to: string;
  data: BranchReportData;
}) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const periodRows =
    data.revenue.by_period
      .map(
        (item) =>
          `<tr><td>${escapeHtml(formatReportDate(item.period_start))}</td><td>${escapeHtml(item.paid_invoice_count)}</td><td class="amount">${escapeHtml(formatVnd(item.revenue))}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="3" class="empty">Chưa có hóa đơn đã thanh toán trong khoảng này.</td></tr>';
  const printedAt = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  popup.document.write(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo ${escapeHtml(branchName)}</title><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#16384d;font-family:Arial,sans-serif;font-size:11px;line-height:1.45}.report-header{padding:20px 22px;border-radius:12px;background:#0c6179;color:#fff}.brand{margin:0 0 12px;color:#b7eef2;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.report-header h1{margin:0;font-size:25px;line-height:1.15}.report-header p{margin:6px 0 0;color:#d8f6f8}.period{display:inline-block;margin-top:14px;padding:6px 9px;border:1px solid rgba(255,255,255,.32);border-radius:99px;font-size:10px}.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0}.metric{min-height:84px;padding:13px;border:1px solid #d8e7eb;border-radius:9px;background:#f9fcfd}.metric span{display:block;color:#66808c;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.metric strong{display:block;margin:6px 0 2px;color:#082d4a;font-size:18px}.metric small{color:#6b818b}section{margin-top:18px}h2{margin:0 0 9px;color:#0b566d;font-size:15px}table{width:100%;border-collapse:collapse}th,td{padding:9px 10px;border-bottom:1px solid #dce8ec;text-align:left}th{background:#eaf6f8;color:#54717c;font-size:9px;letter-spacing:.07em;text-transform:uppercase}.amount{text-align:right;font-weight:700}.empty{text-align:center;color:#718995}.footer{margin-top:22px;padding-top:10px;border-top:1px solid #dce8ec;color:#78909a;font-size:9px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.report-header{background:#0c6179!important}}</style></head><body><header class="report-header"><p class="brand">DentaVie · Báo cáo vận hành</p><h1>${escapeHtml(branchName)}</h1><p>Doanh thu, lịch hẹn và hiệu suất nguồn lực</p><span class="period">${escapeHtml(formatReportDate(from))} — ${escapeHtml(formatReportDate(to))}</span></header><section class="metrics"><article class="metric"><span>Doanh thu đã thanh toán</span><strong>${escapeHtml(formatVnd(data.revenue.total_revenue))}</strong><small>${escapeHtml(data.revenue.paid_invoice_count)} hóa đơn</small></article><article class="metric"><span>Tổng lịch hẹn</span><strong>${escapeHtml(data.appointments.total_appointments)}</strong><small>${escapeHtml(data.appointments.completed_count)} lịch hoàn tất</small></article><article class="metric"><span>Tỷ lệ hủy</span><strong>${escapeHtml(formatPercent(data.appointments.cancellation_rate_percent))}</strong><small>Không đến: ${escapeHtml(formatPercent(data.appointments.no_show_rate_percent))}</small></article><article class="metric"><span>Hiệu suất ghế</span><strong>${escapeHtml(formatPercent(data.chairs.utilization_rate_percent))}</strong><small>${escapeHtml(data.chairs.occupied_minutes)} phút sử dụng</small></article></section><section><h2>Chi tiết doanh thu theo ngày</h2><table><thead><tr><th>Ngày</th><th>Hóa đơn đã thanh toán</th><th class="amount">Doanh thu</th></tr></thead><tbody>${periodRows}</tbody></table></section><footer class="footer">Báo cáo được tạo lúc ${escapeHtml(printedAt)} · DentaVie</footer></body></html>`,
  );
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 150);
  return true;
}
