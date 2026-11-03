import { Link } from "react-router-dom";

/** Shared footer for public-facing marketing pages. */
export function PublicFooter() {
  return (
    <footer className="site-footer" id="lien-he">
      <div className="footer-main">
        <div className="footer-brand">
          <img
            src="/branding/dentavie-logo-horizontal-white.png"
            alt="DentaVie"
          />
          <p>
            Chăm sóc nụ cười bằng sự rõ ràng, thuận tiện và tôn trọng.
          </p>
        </div>
        <div>
          <strong>Liên hệ</strong>
          <a href="tel:19002102">Đường dây nóng: 1900 2102</a>
          <a href="mailto:cskh@dentavie.vn">cskh@dentavie.vn</a>
          <span>Thứ Hai – Chủ Nhật: 8:00 – 20:00</span>
        </div>
        <div>
          <strong>Khám phá</strong>
          <Link to="/#dich-vu">Dịch vụ</Link>
          <Link to="/ve-dentavie">Về DentaVie</Link>
          <Link to="/#chi-nhanh">Chi nhánh</Link>
          <Link to="/chinh-sach-bao-mat">Chính sách bảo mật</Link>
          <Link to="/dieu-khoan-su-dung">Điều khoản sử dụng</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 DentaVie</span>
        <span>Thời gian hiển thị theo Asia/Ho_Chi_Minh</span>
      </div>
    </footer>
  );
}
