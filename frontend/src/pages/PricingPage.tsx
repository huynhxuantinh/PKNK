import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AuthBar } from '../auth/AuthBar'
import { filterPriceGroups, priceGroups } from '../features/pricing/pricingData'
import { Seo } from '../seo/Seo'
import { SITE_URL, pricingSeo } from '../seo/seoConfig'

const pricingStructuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pricingSeo.title,
    description: pricingSeo.description,
    url: `${SITE_URL}/bang-gia`,
    inLanguage: 'vi-VN',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Bảng giá', item: `${SITE_URL}/bang-gia` },
    ],
  },
]

export function PricingPage() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const visibleGroups = useMemo(() => {
    const groups = activeCategory === 'all'
      ? priceGroups
      : priceGroups.filter((group) => group.id === activeCategory)
    return filterPriceGroups(groups, query)
  }, [activeCategory, query])

  return (
    <div className="site-shell pricing-page">
      <Seo {...pricingSeo} jsonLd={pricingStructuredData} />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng bảng giá">
          <Link className="active" to="/bang-gia">Bảng giá</Link>
          <Link to="/#ly-do">Về DentaVie</Link>
          <Link to="/#chi-nhanh">Chi nhánh</Link>
          <Link to="/#lien-he">Liên hệ</Link>
        </nav>
        <div className="header-actions">
          <AuthBar />
          <button
            className={`mobile-menu-btn ${mobileMenuOpen ? 'open' : ''}`}
            type="button"
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      <div className={`mobile-nav-drawer ${mobileMenuOpen ? 'open' : ''}`} role="dialog" aria-label="Menu di động">
        <nav className="mobile-nav-links">
          <Link to="/bang-gia">Bảng giá</Link>
          <Link to="/#ly-do">Về DentaVie</Link>
          <Link to="/#chi-nhanh">Hệ thống chi nhánh</Link>
          <Link to="/#lien-he">Thông tin liên hệ</Link>
        </nav>
      </div>

      <main className="pricing-main">
        <section className="pricing-hero">
          <nav className="clinic-breadcrumb" aria-label="Đường dẫn trang">
            <Link to="/">Trang chủ</Link><span>/</span><strong>Bảng giá</strong>
          </nav>
          <div className="pricing-hero-grid">
            <div>
              <p className="eyebrow">Chi phí rõ ràng</p>
              <h1>Bảng giá dịch vụ nha khoa</h1>
              <p>Tham khảo chi phí theo từng nhóm điều trị trước khi chọn chi nhánh và đặt lịch với bác sĩ.</p>
            </div>
            <div className="pricing-hero-note">
              <strong>Giá minh bạch, tư vấn trước điều trị</strong>
              <p>Chi phí cuối cùng được xác nhận sau khi bác sĩ thăm khám và lập kế hoạch phù hợp.</p>
            </div>
          </div>
        </section>

        <section className="pricing-content" aria-labelledby="price-list-title">
          <div className="pricing-toolbar">
            <div>
              <p className="eyebrow">Danh mục dịch vụ</p>
              <h2 id="price-list-title">Tra cứu mức giá tham khảo</h2>
            </div>
            <label className="pricing-search">
              <span>Tìm dịch vụ</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ví dụ: niềng răng, Implant…"
              />
            </label>
          </div>

          <div className="pricing-tabs" aria-label="Lọc nhóm dịch vụ">
            <button className={activeCategory === 'all' ? 'active' : ''} type="button" onClick={() => setActiveCategory('all')}>Tất cả</button>
            {priceGroups.map((group) => (
              <button className={activeCategory === group.id ? 'active' : ''} type="button" key={group.id} onClick={() => setActiveCategory(group.id)}>
                {group.title}
              </button>
            ))}
          </div>

          {visibleGroups.length ? (
            <div className="price-group-list">
              {visibleGroups.map((group, index) => (
                <article className="price-group" id={group.id} key={group.id}>
                  <header>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div><h3>{group.title}</h3><p>{group.description}</p></div>
                  </header>
                  <div className="price-table-wrap">
                    <table>
                      <thead><tr><th>Dịch vụ</th><th>Đơn vị</th><th>Giá tham khảo</th></tr></thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr key={item.name}><td>{item.name}</td><td>{item.unit}</td><td><strong>{item.price}</strong>{item.note && <small>{item.note}</small>}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="pricing-empty">Không tìm thấy dịch vụ phù hợp.</p>}

          <aside className="pricing-disclaimer">
            <strong>Lưu ý về chi phí điều trị</strong>
            <p>Bảng giá mang tính tham khảo. Mức phí có thể thay đổi theo tình trạng răng miệng, vật liệu, mức độ phức tạp và chỉ định chuyên môn. DentaVie sẽ thông báo kế hoạch cùng chi phí dự kiến trước khi điều trị.</p>
            <Link to="/#chi-nhanh">Chọn chi nhánh để được tư vấn</Link>
          </aside>
        </section>
      </main>

      <footer className="site-footer" id="lien-he">
        <div className="footer-main">
          <div className="footer-brand"><img src="/branding/dentavie-logo-horizontal-white.png" alt="DentaVie" /><p>Chăm sóc nụ cười bằng sự rõ ràng, thuận tiện và tôn trọng.</p></div>
          <div><strong>Liên hệ</strong><a href="tel:19002102">Hotline: 1900 2102</a><a href="mailto:cskh@dentavie.vn">cskh@dentavie.vn</a><span>Thứ Hai – Chủ Nhật: 8:00 – 20:00</span></div>
          <div><strong>Khám phá</strong><Link to="/#dich-vu">Dịch vụ</Link><Link to="/bang-gia">Bảng giá</Link><Link to="/#chi-nhanh">Chi nhánh</Link></div>
        </div>
        <div className="footer-bottom"><span>© 2026 DentaVie</span><span>Thời gian hiển thị theo Asia/Ho_Chi_Minh</span></div>
      </footer>
    </div>
  )
}
