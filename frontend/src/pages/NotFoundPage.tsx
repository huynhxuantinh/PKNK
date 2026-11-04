import { Link, useLocation } from "react-router-dom";

import { AuthBar } from "../auth/AuthBar";
import { PublicFooter } from "../components/public/PublicFooter";
import { PublicMobileNavigation } from "../components/public/PublicMobileNavigation";
import { Seo } from "../seo/Seo";

const publicLinks = [
  { to: "/bang-gia", label: "Bảng giá" },
  { to: "/ve-dentavie", label: "Về DentaVie" },
  { to: "/#chi-nhanh", label: "Chi nhánh" },
  { to: "/#lien-he", label: "Liên hệ" },
];

export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <div className="site-shell not-found-shell">
      <Seo
        title="Không tìm thấy trang | DentaVie"
        description="Trang bạn đang tìm không tồn tại hoặc đã được chuyển. Quay về trang chủ DentaVie để tiếp tục."
        path={pathname}
        noIndex
      />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          {publicLinks.map((link) => (
            <Link key={link.to} to={link.to}>{link.label}</Link>
          ))}
        </nav>
        <div className="header-actions">
          <AuthBar />
          <PublicMobileNavigation links={publicLinks} />
        </div>
      </header>

      <main className="not-found-main">
        <section className="not-found-card" aria-labelledby="not-found-title">
          <p className="not-found-eyebrow">DENTAVIE · LỖI 404</p>
          <div className="not-found-number" aria-hidden="true">404</div>
          <h1 id="not-found-title">Không tìm thấy trang bạn cần</h1>
          <p className="not-found-description">
            Đường dẫn có thể đã thay đổi hoặc không còn tồn tại. Mình đưa bạn về
            những trang chính để tiếp tục nhé.
          </p>
          <div className="not-found-actions">
            <Link className="button button-primary" to="/">Về trang chủ</Link>
            <Link className="button button-secondary" to="/#chi-nhanh">Tìm chi nhánh</Link>
          </div>
          <div className="not-found-shortcuts" aria-label="Trang hữu ích">
            <Link to="/bang-gia">Xem bảng giá</Link>
            <span aria-hidden="true">·</span>
            <Link to="/ve-dentavie">Tìm hiểu DentaVie</Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
