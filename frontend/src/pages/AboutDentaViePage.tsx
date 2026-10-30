import { Link } from 'react-router-dom'

import { AuthBar } from '../auth/AuthBar'
import { Seo } from '../seo/Seo'

const recognitions = [
  {
    image: '/images/recognition/dental-care-award.png',
    title: 'DentaVie Awards 2024',
    year: '2024',
    description: 'Dấu ấn ghi nhận hoạt động chăm sóc sức khỏe răng miệng và sự đồng hành cùng cộng đồng.',
  },
  {
    image: '/images/recognition/iso-9001-certificate.png',
    title: 'Chứng nhận ISO 9001:2015',
    year: 'ISO 9001:2015',
    description: 'Ghi nhận hệ thống quản lý chất lượng dịch vụ theo tiêu chuẩn được công bố trên chứng nhận.',
  },
  {
    image: '/images/recognition/national-brand-award.png',
    title: 'Top 10 thương hiệu mạnh',
    year: '2025',
    description: 'Chứng nhận về định hướng phát triển thương hiệu và chất lượng phục vụ khách hàng.',
  },
  {
    image: '/images/recognition/appreciation-certificate-gold.png',
    title: 'Certificate of Appreciation',
    year: 'Ghi nhận',
    description: 'Lời ghi nhận sự đóng góp cho các hoạt động giáo dục và sức khỏe cộng đồng.',
  },
  {
    image: '/images/recognition/appreciation-certificate.png',
    title: 'Global Leadership Program',
    year: 'Ghi nhận',
    description: 'Ghi nhận sự đồng hành và đóng góp trong chương trình phát triển cộng đồng.',
  },
]

export function AboutDentaViePage() {
  return (
    <div className="site-shell about-page">
      <Seo title="Về DentaVie | Chăm sóc nụ cười rõ ràng" description="Thông tin về DentaVie, định hướng chăm sóc và các chứng nhận, thành tựu." path="/ve-dentavie" />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link to="/bang-gia">Bảng giá</Link>
          <Link to="/ve-dentavie" aria-current="page">Về DentaVie</Link>
          <Link to="/#chi-nhanh">Chi nhánh</Link>
          <Link to="/#lien-he">Liên hệ</Link>
        </nav>
        <AuthBar />
      </header>

      <main>
        <section className="about-hero">
          <div>
            <p className="eyebrow">Về DentaVie</p>
            <h1>Chứng nhận &amp; thành tựu</h1>
            <p>Những chứng nhận và dấu mốc ghi nhận hành trình DentaVie theo đuổi chất lượng chuyên môn, phục vụ minh bạch và đóng góp cho cộng đồng.</p>
          </div>
        </section>

        <section className="about-recognition" aria-labelledby="about-recognition-title">
          <div className="about-section-heading">
            <p className="eyebrow">Chứng nhận & thành tựu</p>
            <h2 id="about-recognition-title">Giới thiệu các chứng nhận của DentaVie</h2>
            <p>Mỗi chứng nhận dưới đây thể hiện một khía cạnh trong định hướng phát triển và chất lượng phục vụ của DentaVie.</p>
          </div>
          <div className="about-recognition-grid">
            {recognitions.map((recognition) => (
              <article className="about-recognition-card" key={recognition.image}>
                <div className="about-recognition-image"><img src={recognition.image} alt={recognition.title} /></div>
                <div>
                  <span>{recognition.year}</span>
                  <h3>{recognition.title}</h3>
                  <p>{recognition.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer" id="lien-he">
        <div className="footer-main">
          <div className="footer-brand"><img src="/branding/dentavie-logo-horizontal-white.png" alt="DentaVie" /><p>Chăm sóc nụ cười bằng sự rõ ràng, thuận tiện và tôn trọng.</p></div>
          <div><strong>Liên hệ</strong><a href="tel:19002102">Hotline: 1900 2102</a><a href="mailto:cskh@dentavie.vn">cskh@dentavie.vn</a><span>Thứ Hai – Chủ Nhật: 8:00 – 20:00</span></div>
          <div><strong>Khám phá</strong><Link to="/bang-gia">Bảng giá</Link><Link to="/#chi-nhanh">Chi nhánh</Link><Link to="/chinh-sach-bao-mat">Chính sách bảo mật</Link></div>
        </div>
        <div className="footer-bottom"><span>© 2026 DentaVie</span><span>Thời gian hiển thị theo Asia/Ho_Chi_Minh</span></div>
      </footer>
    </div>
  )
}
