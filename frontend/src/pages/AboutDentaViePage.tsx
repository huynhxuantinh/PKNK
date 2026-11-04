import { Link } from "react-router-dom";

import { AuthBar } from "../auth/AuthBar";
import { PublicMobileNavigation } from "../components/public/PublicMobileNavigation";
import { PublicFooter } from "../components/public/PublicFooter";
import { Seo } from "../seo/Seo";
import { aboutPageSchema, aboutSeo } from "../seo/seoConfig";
import styles from "./AboutDentaViePage.module.css";

const recognitions = [
  {
    image: "/images/recognition/dental-care-award.png",
    webpSrcSet:
      "/images/recognition/dental-care-award-400.webp 400w, /images/recognition/dental-care-award-800.webp 800w",
    title: "DentaVie Awards 2024",
    year: "2024",
    description:
      "Dấu ấn ghi nhận hoạt động chăm sóc sức khỏe răng miệng và sự đồng hành cùng cộng đồng.",
  },
  {
    image: "/images/recognition/iso-9001-certificate.png",
    webpSrcSet:
      "/images/recognition/iso-9001-certificate-400.webp 400w, /images/recognition/iso-9001-certificate-800.webp 800w",
    title: "Chứng nhận ISO 9001:2015",
    year: "ISO 9001:2015",
    description:
      "Ghi nhận hệ thống quản lý chất lượng dịch vụ theo tiêu chuẩn được công bố trên chứng nhận.",
  },
  {
    image: "/images/recognition/national-brand-award.png",
    webpSrcSet:
      "/images/recognition/national-brand-award-400.webp 400w, /images/recognition/national-brand-award-800.webp 800w",
    title: "Top 10 thương hiệu mạnh",
    year: "2025",
    description:
      "Chứng nhận về định hướng phát triển thương hiệu và chất lượng phục vụ khách hàng.",
  },
  {
    image: "/images/recognition/appreciation-certificate-gold.png",
    webpSrcSet:
      "/images/recognition/appreciation-certificate-gold-400.webp 400w, /images/recognition/appreciation-certificate-gold-800.webp 800w",
    title: "Certificate of Appreciation",
    year: "Ghi nhận",
    description:
      "Lời ghi nhận sự đóng góp cho các hoạt động giáo dục và sức khỏe cộng đồng.",
  },
  {
    image: "/images/recognition/appreciation-certificate.png",
    webpSrcSet:
      "/images/recognition/appreciation-certificate-400.webp 400w, /images/recognition/appreciation-certificate-800.webp 800w",
    title: "Global Leadership Program",
    year: "Ghi nhận",
    description:
      "Ghi nhận sự đồng hành và đóng góp trong chương trình phát triển cộng đồng.",
  },
];

export function AboutDentaViePage() {
  return (
    <div className={`site-shell ${styles.page}`}>
      <Seo
        {...aboutSeo}
        jsonLd={aboutPageSchema}
      />
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img
            src="/branding/dentavie-logo-horizontal-color.png"
            alt="DentaVie"
          />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link to="/bang-gia">Bảng giá</Link>
          <Link to="/ve-dentavie" aria-current="page">
            Về DentaVie
          </Link>
          <Link to="/#chi-nhanh">Chi nhánh</Link>
          <Link to="/#lien-he">Liên hệ</Link>
        </nav>
        <div className="header-actions">
          <AuthBar />
          <PublicMobileNavigation
            links={[
              { to: "/bang-gia", label: "Bảng giá" },
              { to: "/ve-dentavie", label: "Về DentaVie" },
              { to: "/#chi-nhanh", label: "Hệ thống chi nhánh" },
              { to: "/#lien-he", label: "Thông tin liên hệ" },
            ]}
          />
        </div>
      </header>

      <main>
        <section className="about-hero">
          <div className="about-hero-copy">
            <p className="eyebrow">Về DentaVie</p>
            <h1>Chăm sóc nụ cười, bắt đầu từ sự thấu hiểu.</h1>
            <p>
              DentaVie là hệ thống nha khoa tại TP.HCM, hướng đến trải nghiệm
              thăm khám tận tâm, tư vấn dễ hiểu và lựa chọn chăm sóc phù hợp với
              từng khách hàng.
            </p>
            <div className="about-intro-actions">
              <Link className="button button-primary" to="/dat-lich">
                Đặt lịch khám
              </Link>
              <Link className="button button-secondary" to="/#chi-nhanh">
                Tìm chi nhánh
              </Link>
            </div>
          </div>
          <figure className="about-intro-visual">
            <img
              src="/images/services/general-dentistry.jpg"
              alt="Hình minh họa một buổi thăm khám nha khoa"
              loading="lazy"
              decoding="async"
            />
            <figcaption>
              Thăm khám cẩn thận, trao đổi rõ ràng
            </figcaption>
          </figure>
        </section>

        <section className="about-intro" aria-labelledby="about-intro-title">
          <div className="about-section-heading">
            <p className="eyebrow">Trải nghiệm tại DentaVie</p>
            <h2 id="about-intro-title">Mỗi bước chăm sóc đều rõ ràng</h2>
            <p>
              Chúng tôi lắng nghe nhu cầu, giải thích tình trạng răng miệng và
              cùng khách hàng lựa chọn hướng chăm sóc phù hợp. Thông tin thăm
              khám được ghi nhận để thuận tiện theo dõi qua các lần hẹn.
            </p>
          </div>
          <div className="about-values-grid" aria-label="Cam kết chăm sóc">
            <article className="about-value-card">
              <span>01</span>
              <h3>Tư vấn dễ hiểu</h3>
              <p>
                Thông tin về tình trạng răng miệng và phương án chăm sóc được
                trao đổi rõ ràng.
              </p>
            </article>
            <article className="about-value-card">
              <span>02</span>
              <h3>Kế hoạch phù hợp</h3>
              <p>
                Lựa chọn dịch vụ dựa trên nhu cầu, tình trạng thực tế và trao
                đổi giữa bác sĩ với khách hàng.
              </p>
            </article>
            <article className="about-value-card">
              <span>03</span>
              <h3>Đồng hành lâu dài</h3>
              <p>
                Lịch hẹn và thông tin chăm sóc được ghi nhận để hỗ trợ theo dõi
                hành trình điều trị.
              </p>
            </article>
          </div>
        </section>

        <section
          className="about-recognition"
          aria-labelledby="about-recognition-title"
        >
          <div className="about-section-heading">
            <p className="eyebrow">Chứng nhận & thành tựu</p>
            <h2 id="about-recognition-title">
              Những dấu mốc đáng nhớ
            </h2>
            <p>
              Một số ghi nhận trong hành trình phát triển và đồng hành cùng cộng đồng.
            </p>
          </div>
          <div className="about-recognition-grid">
            {recognitions.map((recognition) => (
              <article
                className="about-recognition-card"
                key={recognition.image}
              >
                <div className="about-recognition-image">
                  <picture>
                    <source
                      type="image/webp"
                      srcSet={recognition.webpSrcSet}
                      sizes="(max-width: 640px) min(100vw - 64px, 360px), (max-width: 980px) 42vw, 260px"
                    />
                    <img
                      src={recognition.image}
                      alt={recognition.title}
                      loading="lazy"
                      decoding="async"
                    />
                  </picture>
                </div>
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

      <PublicFooter />
    </div>
  );
}
