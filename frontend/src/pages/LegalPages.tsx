import { Link } from 'react-router-dom'

import { AuthBar } from '../auth/AuthBar'
import { Seo } from '../seo/Seo'

type LegalSection = {
  title: string
  paragraphs: string[]
  items?: string[]
}

const privacySections: LegalSection[] = [
  {
    title: '1. Thông tin DentaVie thu thập',
    paragraphs: ['DentaVie thu thập thông tin tài khoản, thông tin liên hệ, lịch hẹn và dữ liệu khám chữa bệnh được tạo trong quá trình bạn sử dụng dịch vụ.'],
    items: ['Họ tên, email, số điện thoại và địa chỉ.', 'Thông tin lịch hẹn, chi nhánh, dịch vụ và bác sĩ.', 'Bệnh án, đơn thuốc, hình ảnh lâm sàng và thông tin thanh toán khi có phát sinh.', 'Dữ liệu kỹ thuật cần thiết để bảo mật tài khoản và ghi nhận sự đồng ý.'],
  },
  {
    title: '2. Mục đích xử lý',
    paragraphs: ['Thông tin được sử dụng để cung cấp dịch vụ chăm sóc sức khỏe, quản lý lịch hẹn, hỗ trợ thanh toán, gửi thông báo cần thiết và bảo vệ an toàn hệ thống. DentaVie không bán dữ liệu sức khỏe của bạn.'],
  },
  {
    title: '3. Chia sẻ và lưu trữ',
    paragraphs: ['Dữ liệu chỉ được truy cập bởi nhân sự có thẩm quyền, đơn vị cung cấp hạ tầng cần thiết hoặc cơ quan nhà nước khi pháp luật yêu cầu. Thời gian lưu trữ tuân theo nhu cầu điều trị, nghĩa vụ pháp lý và chính sách nội bộ.'],
  },
  {
    title: '4. Quyền của bạn',
    paragraphs: ['Bạn có thể yêu cầu xem, cập nhật hoặc giải thích cách dữ liệu được sử dụng. Một số dữ liệu y tế không thể xóa ngay nếu pháp luật yêu cầu phòng khám tiếp tục lưu trữ.'],
  },
  {
    title: '5. Bảo mật và liên hệ',
    paragraphs: ['DentaVie áp dụng phân quyền, mã hóa đường truyền, nhật ký truy cập và các biện pháp vận hành phù hợp để bảo vệ dữ liệu. Nếu có câu hỏi, liên hệ cskh@dentavie.vn hoặc hotline 1900 2102.'],
  },
]

const termsSections: LegalSection[] = [
  {
    title: '1. Tài khoản',
    paragraphs: ['Bạn cần cung cấp thông tin chính xác, bảo vệ mật khẩu và thông báo cho DentaVie khi nghi ngờ tài khoản bị truy cập trái phép. Mỗi tài khoản chỉ nên được sử dụng bởi đúng chủ tài khoản.'],
  },
  {
    title: '2. Lịch hẹn và khám chữa bệnh',
    paragraphs: ['Lịch hẹn trực tuyến giúp giữ thời gian dự kiến nhưng có thể được điều chỉnh vì tình trạng cấp cứu hoặc yêu cầu chuyên môn. Thông tin trên website không thay thế chẩn đoán trực tiếp của nha sĩ.'],
  },
  {
    title: '3. Thanh toán',
    paragraphs: ['Giá hiển thị là thông tin tham khảo hoặc giá áp dụng tại chi nhánh theo từng thời điểm. Hóa đơn, khoản thanh toán và chính sách hoàn tiền được xử lý theo giao dịch thực tế và quy định của phòng khám.'],
  },
  {
    title: '4. Sử dụng hợp lệ',
    paragraphs: ['Bạn không được giả mạo danh tính, đặt lịch nhằm gây gián đoạn, truy cập dữ liệu của người khác hoặc can thiệp vào hoạt động của hệ thống. DentaVie có thể tạm khóa tài khoản khi phát hiện rủi ro bảo mật hoặc hành vi lạm dụng.'],
  },
  {
    title: '5. Thay đổi điều khoản',
    paragraphs: ['DentaVie có thể cập nhật điều khoản để phù hợp với dịch vụ và quy định pháp luật. Phiên bản mới sẽ được công bố trên trang này; thay đổi quan trọng sẽ được thông báo bằng phương thức phù hợp.'],
  },
]

function LegalPage({
  eyebrow,
  title,
  description,
  path,
  sections,
}: {
  eyebrow: string
  title: string
  description: string
  path: string
  sections: LegalSection[]
}) {
  return (
    <div className="site-shell legal-page">
      <Seo title={`${title} | DentaVie`} description={description} path={path} />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link to="/">Trang chủ</Link>
          <Link to="/bang-gia">Bảng giá</Link>
          <Link to="/chinh-sach-bao-mat">Bảo mật</Link>
        </nav>
        <AuthBar />
      </header>
      <main className="legal-main">
        <header className="legal-hero">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <small>Phiên bản 1.0 · Cập nhật ngày 26/10/2026</small>
        </header>
        <div className="legal-layout">
          <aside className="legal-summary">
            <strong>Nội dung chính</strong>
            <p>Chúng tôi trình bày chính sách bằng ngôn ngữ rõ ràng để bạn biết dữ liệu và quyền của mình.</p>
            <a href="mailto:cskh@dentavie.vn">cskh@dentavie.vn</a>
          </aside>
          <article className="legal-content">
            {sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
              </section>
            ))}
          </article>
        </div>
        <nav className="legal-related" aria-label="Tài liệu pháp lý liên quan">
          <Link to="/chinh-sach-bao-mat">Chính sách bảo mật</Link>
          <Link to="/dieu-khoan-su-dung">Điều khoản sử dụng</Link>
        </nav>
      </main>
    </div>
  )
}

export function PrivacyPolicyPage() {
  return <LegalPage eyebrow="Quyền riêng tư" title="Chính sách bảo mật" description="Cách DentaVie thu thập, sử dụng và bảo vệ thông tin cá nhân, dữ liệu sức khỏe của bạn." path="/chinh-sach-bao-mat" sections={privacySections} />
}

export function TermsPage() {
  return <LegalPage eyebrow="Điều khoản dịch vụ" title="Điều khoản sử dụng" description="Các nguyên tắc áp dụng khi bạn sử dụng tài khoản, đặt lịch và dịch vụ trực tuyến của DentaVie." path="/dieu-khoan-su-dung" sections={termsSections} />
}
