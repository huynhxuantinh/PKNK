import { Link, useSearchParams } from 'react-router-dom'

import { AuthBar } from '../auth/AuthBar'
import { BookingFlow } from '../features/booking/BookingFlow'
import { Seo } from '../seo/Seo'

export function BookingPage() {
  const [searchParams] = useSearchParams()
  const branchId = Number(searchParams.get('chi-nhanh'))
  const initialBranchId = Number.isInteger(branchId) && branchId > 0 ? branchId : undefined

  return (
    <div className="site-shell booking-page">
      <Seo
        title="Đặt lịch khám nha khoa | DentaVie"
        description="Chọn chi nhánh, dịch vụ, ngày giờ và bác sĩ phù hợp để đặt lịch khám tại DentaVie."
        path="/dat-lich"
        noIndex
      />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng đặt lịch">
          <Link to="/bang-gia">Bảng giá</Link>
          <Link to="/#chi-nhanh">Chi nhánh</Link>
          <Link to="/#lien-he">Liên hệ</Link>
        </nav>
        <AuthBar />
      </header>

      <main className="booking-page-main">
        <div className="booking-hero">
          <div>
            <h1>Một lịch hẹn rõ ràng,<br />một nụ cười an tâm.</h1>
            <p>Chọn dịch vụ, thời gian và bác sĩ phù hợp. Chỉ mất vài phút để hoàn tất.</p>
          </div>
          <div className="booking-hero-note" aria-label="Thông tin hỗ trợ đặt lịch">
            <div>
              <strong>{initialBranchId ? 'Chi nhánh đã được chọn sẵn' : 'Chọn chi nhánh phù hợp'}</strong>
              <p>{initialBranchId ? 'Bạn chỉ cần chọn dịch vụ, bác sĩ và giờ khám.' : 'Giờ mở cửa và bác sĩ của từng chi nhánh hiển thị ngay bên dưới.'}</p>
            </div>
          </div>
        </div>
        <BookingFlow initialBranchId={initialBranchId} />
      </main>
    </div>
  )
}
