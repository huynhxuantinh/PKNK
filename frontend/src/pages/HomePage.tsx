import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { listBranches, type BranchFilters } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { BranchMap } from '../components/BranchMap'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Seo } from '../seo/Seo'
import { homeSeo, organizationSchema, websiteSchema } from '../seo/seoConfig'
import type { Branch } from '../types/api'

const slides = [
  { src: '/hero/banner-cham-soc-gia-dinh.png', alt: 'Chăm sóc răng toàn diện cho cả gia đình', width: 1916, height: 821 },
  { src: '/hero/banner-nieng-rang.png', alt: 'Niềng răng trong suốt thẩm mỹ', width: 1942, height: 809 },
  { src: '/hero/banner-he-uu-dai.png', alt: 'Chương trình chăm sóc răng miệng DentaVie', width: 1983, height: 793 },
]

const homeStructuredData = [organizationSchema, websiteSchema]

const services = [
  { code: '01', image: '/images/services/general-dentistry.jpg', focus: '50% 48%', title: 'Nha khoa tổng quát', description: 'Khám định kỳ, cạo vôi và chăm sóc sức khỏe răng miệng toàn diện.' },
  { code: '02', image: '/images/services/orthodontics.jpg', focus: '50% 72%', title: 'Niềng răng', description: 'Lộ trình chỉnh nha rõ ràng, theo dõi xuyên suốt từng giai đoạn.' },
  { code: '03', image: '/images/services/implant.jpg', focus: '50% 62%', title: 'Cấy ghép Implant', description: 'Phục hồi răng mất với kế hoạch điều trị phù hợp từng tình trạng.' },
  { code: '04', image: '/images/services/cosmetic-dentistry.jpg', focus: '50% 45%', title: 'Nha khoa thẩm mỹ', description: 'Tẩy trắng, phục hình và cải thiện nụ cười theo hướng tự nhiên.' },
  { code: '05', image: '/images/services/root-canal-process.png', focus: '50% 50%', fit: 'contain' as const, title: 'Điều trị tủy', description: 'Kiểm soát đau, bảo tồn răng thật và theo dõi sau điều trị.' },
  { code: '06', image: '/images/services/pediatric-dentistry.jpg', focus: '50% 48%', title: 'Nha khoa trẻ em', description: 'Không gian nhẹ nhàng giúp trẻ hình thành thói quen chăm sóc răng.' },
]

const recognitions = [
  { image: '/images/recognition/dental-care-award.png', title: 'DentaVie Awards 2024', description: 'Dấu ấn trong hoạt động chăm sóc sức khỏe răng miệng.' },
  { image: '/images/recognition/iso-9001-certificate.png', title: 'Chứng nhận ISO 9001:2015', description: 'Hệ thống quản lý chất lượng dịch vụ khám và chữa răng.' },
  { image: '/images/recognition/national-brand-award.png', title: 'Top 10 thương hiệu mạnh', description: 'Chứng nhận thương hiệu mạnh quốc gia năm 2025.' },
  { image: '/images/recognition/appreciation-certificate-gold.png', title: 'Certificate of Appreciation', description: 'Ghi nhận đóng góp cho giáo dục và sức khỏe cộng đồng.' },
  { image: '/images/recognition/appreciation-certificate.png', title: 'Global Leadership Program', description: 'Ghi nhận sự đồng hành và đóng góp trong chương trình.' },
]

function HeroSlider() {
  const [active, setActive] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6500)
    return () => window.clearInterval(timer)
  }, [])

  const move = (direction: number) => setActive((current) => (current + direction + slides.length) % slides.length)

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX
    touchEndX.current = null
  }

  const handleTouchMove = (event: React.TouchEvent) => {
    touchEndX.current = event.touches[0].clientX
  }

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        move(1)
      } else {
        move(-1)
      }
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  return (
    <section
      className="hero-slider"
      aria-label="Thông tin nổi bật"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="hero-slides" style={{ transform: `translateX(-${active * 100}%)` }}>
        {slides.map((slide, index) => (
          <img key={slide.src} src={slide.src} alt={slide.alt} width={slide.width} height={slide.height} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" />
        ))}
      </div>
      <button className="slider-arrow slider-prev" onClick={() => move(-1)} aria-label="Ảnh trước">‹</button>
      <button className="slider-arrow slider-next" onClick={() => move(1)} aria-label="Ảnh tiếp theo">›</button>
      <div className="slider-dots">
        {slides.map((slide, index) => (
          <button key={slide.src} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Xem ảnh ${index + 1}`} aria-current={index === active ? 'true' : undefined} />
        ))}
      </div>
    </section>
  )
}

export function HomePage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchDirectory, setBranchDirectory] = useState<Branch[]>([])
  const [branchState, setBranchState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [searchText, setSearchText] = useState('')
  const [wardCode, setWardCode] = useState('')
  const [radiusKm, setRadiusKm] = useState('5')
  const [openOnly, setOpenOnly] = useState(false)
  const [branchFilters, setBranchFilters] = useState<BranchFilters>({})
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)
  const [activeView, setActiveView] = useState<'list' | 'map'>('list')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const [showLocationConsent, setShowLocationConsent] = useState(false)
  const [locationError, setLocationError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setBranchState('loading')
    listBranches(branchFilters, controller.signal)
      .then((response) => {
        const data = Array.isArray(response?.data) ? response.data : []
        setBranches(data)
        setBranchDirectory((current) => current.length ? current : data)
        setBranchState('ready')
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setBranchState('error')
      })
    return () => controller.abort()
  }, [branchFilters])

  const wardOptions = useMemo(
    () => Array.from(
      new Map(branchDirectory.map((branch) => [branch.ward_code, branch.ward_name])).entries(),
    ).sort((a, b) => a[1].localeCompare(b[1], 'vi')),
    [branchDirectory],
  )

  function applyBranchFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocationError('')
    setBranchFilters({
      query: searchText.trim() || undefined,
      wardCode: wardCode || undefined,
      openNow: openOnly || undefined,
      latitude: userLocation?.latitude,
      longitude: userLocation?.longitude,
      radiusKm: userLocation ? Number(radiusKm) : undefined,
    })
  }

  function resetBranchFilters() {
    setSearchText('')
    setWardCode('')
    setRadiusKm('5')
    setOpenOnly(false)
    setUserLocation(null)
    setLocationError('')
    setSelectedBranchId(null)
    setBranchFilters({})
  }

  function clearLocation() {
    setUserLocation(null)
    setLocationError('')
    setBranchFilters((current) => ({
      ...current,
      latitude: undefined,
      longitude: undefined,
      radiusKm: undefined,
    }))
  }

  function handleSelectBranch(id: number) {
    setSelectedBranchId(id)
    const cardEl = document.getElementById(`branch-card-${id}`)
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  function openLocationConsent() {
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt này không hỗ trợ xác định vị trí.')
      return
    }

    if (!window.isSecureContext) {
      setLocationError('Tính năng lấy vị trí chỉ hoạt động trên HTTPS hoặc localhost.')
      return
    }

    setLocationError('')
    if (!navigator.permissions || !navigator.permissions.query) {
      setShowLocationConsent(true)
      return
    }

    try {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then((permission) => {
          if (permission.state === 'denied') {
            setLocationError('Quyền vị trí đang bị chặn. Hãy mở biểu tượng ổ khóa hoặc cài đặt trang trên thanh địa chỉ và cho phép truy cập vị trí.')
            return
          }
          setShowLocationConsent(true)
        })
        .catch(() => setShowLocationConsent(true))
    } catch {
      setShowLocationConsent(true)
    }
  }

  function findNearestBranches() {
    setShowLocationConsent(false)
    setIsLocating(true)
    setLocationError('')

    if (!navigator.geolocation) {
      setLocationError('Trình duyệt của bạn không hỗ trợ định vị địa lý.')
      setIsLocating(false)
      return
    }

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const lat = coords.latitude
          const lng = coords.longitude
          const radius = Number(radiusKm) || 5
          setUserLocation({ latitude: lat, longitude: lng })
          setBranchFilters((current) => ({
            ...current,
            query: searchText.trim() || undefined,
            wardCode: wardCode || undefined,
            openNow: openOnly || undefined,
            latitude: lat,
            longitude: lng,
            radiusKm: radius,
          }))
          setIsLocating(false)
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setLocationError('Bạn chưa cho phép truy cập vị trí. Hãy mở biểu tượng ổ khóa hoặc cài đặt trên thanh địa chỉ để cấp lại quyền.')
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setLocationError('Thiết bị chưa xác định được vị trí. Hãy bật dịch vụ định vị GPS rồi thử lại.')
          } else {
            setLocationError('Lấy vị trí quá lâu hoặc không thành công. Vui lòng thử lại.')
          }
          setIsLocating(false)
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
      )
    } catch (err) {
      console.warn('Lỗi định vị:', err)
      setLocationError('Không thể kích hoạt tính năng định vị trên trình duyệt.')
      setIsLocating(false)
    }
  }

  return (
    <div className="site-shell">
      <Seo {...homeSeo} jsonLd={homeStructuredData} />
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </a>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link to="/bang-gia">Bảng giá</Link>
          <a href="#ly-do">Về DentaVie</a>
          <a href="#chi-nhanh">Chi nhánh</a>
          <a href="#lien-he">Liên hệ</a>
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
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className={`mobile-nav-drawer ${mobileMenuOpen ? 'open' : ''}`} role="dialog" aria-label="Menu di động">
        <nav className="mobile-nav-links">
          <Link to="/bang-gia" onClick={() => setMobileMenuOpen(false)}>Bảng giá</Link>
          <a href="#ly-do" onClick={() => setMobileMenuOpen(false)}>Về DentaVie</a>
          <a href="#chi-nhanh" onClick={() => setMobileMenuOpen(false)}>Hệ thống chi nhánh</a>
          <a href="#lien-he" onClick={() => setMobileMenuOpen(false)}>Thông tin liên hệ</a>
        </nav>
      </div>

      <main id="top">
        <h1 className="sr-only">Nha khoa DentaVie – Chăm sóc răng miệng toàn diện tại TP.HCM</h1>
        <section className="hero-wrap">
          <HeroSlider />
        </section>

        <section className="trust-strip" aria-label="Cam kết DentaVie">
          <p><span className="trust-icon">✓</span><strong>Bác sĩ chuyên môn</strong><small>Theo sát từng giai đoạn điều trị</small></p>
          <p><span className="trust-icon">◎</span><strong>Thông tin minh bạch</strong><small>Dịch vụ và chi phí trình bày rõ ràng</small></p>
          <p><span className="trust-icon">⌁</span><strong>Chăm sóc liên tục</strong><small>Hồ sơ khám được lưu trên một hệ thống</small></p>
          <p><span className="trust-icon">⌖</span><strong>Nhiều chi nhánh</strong><small>Dễ dàng tìm cơ sở thuận tiện</small></p>
        </section>

        <section className="home-section services-section" id="dich-vu">
          <div className="section-heading-centered">
            <p className="eyebrow">Dịch vụ nha khoa</p>
            <h2>Chăm sóc toàn diện cho mọi nụ cười</h2>
            <p>Từ phòng ngừa cơ bản đến điều trị chuyên sâu, mỗi dịch vụ đều được xây dựng theo nhu cầu thực tế của bạn.</p>
          </div>
          <div className="services-grid">
            {services.map((service) => (
              <article className="service-card" key={service.code}>
                <div className="service-image-wrap">
                  <img className="service-image" src={service.image} alt={service.title} loading="lazy" style={{ objectPosition: service.focus, objectFit: service.fit ?? 'cover' }} />
                  <span className="service-number">{service.code}</span>
                </div>
                <div className="service-card-body">
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <a href="#chi-nhanh" aria-label={`Xem chi nhánh cung cấp ${service.title}`}>Xem chi nhánh <span>→</span></a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="recognition-section" id="ly-do">
          <div className="section-heading-centered">
            <p className="eyebrow">Chứng nhận & thành tựu</p>
            <h2>Những dấu ấn trên hành trình chăm sóc nụ cười.</h2>
            <p>Các chứng nhận và ghi nhận thể hiện định hướng phát triển chất lượng, chuyên môn và đóng góp cộng đồng của DentaVie.</p>
          </div>
          <div
            className="recognition-grid"
            role="region"
            aria-label="Danh sách chứng nhận và thành tựu, vuốt ngang để xem thêm"
            tabIndex={0}
          >
            {recognitions.map((item) => (
              <figure className="recognition-card" key={item.image}>
                <div className="recognition-image-wrap">
                  <img src={item.image} alt={item.title} loading="lazy" />
                </div>
                <figcaption>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="branches-section">
          <div className="section-intro compact">
            <div><p className="eyebrow">Hệ thống chi nhánh</p><h2>Tìm phòng khám gần bạn.</h2></div>
            <p>Chọn một cơ sở để xem vị trí, địa chỉ và trạng thái hoạt động trực tiếp trên bản đồ.</p>
          </div>

          <form className="branch-filters" id="chi-nhanh" onSubmit={applyBranchFilters}>
            <label className="branch-search-field">
              <span>Tên hoặc địa chỉ</span>
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Ví dụ: Quận 3, Nguyễn Trãi…" />
            </label>
            <label>
              <span>Phường</span>
              <select value={wardCode} onChange={(event) => setWardCode(event.target.value)}>
                <option value="">Tất cả phường</option>
                {wardOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
            <label>
              <span>Bán kính gần tôi</span>
              <select
                value={radiusKm}
                onChange={(event) => {
                  setRadiusKm(event.target.value)
                  if (!userLocation) openLocationConsent()
                }}
              >
                <option value="2">Trong 2 km</option>
                <option value="5">Trong 5 km</option>
                <option value="10">Trong 10 km</option>
                <option value="20">Trong 20 km</option>
                <option value="50">Trong 50 km</option>
              </select>
            </label>
            <label className="branch-open-filter">
              <input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />
              <span>Đang mở cửa</span>
            </label>
            <div className="branch-filter-actions">
              <button type="submit">Lọc</button>
              <button className={`location-action ${userLocation ? 'active' : ''}`} type="button" onClick={openLocationConsent} disabled={isLocating}>
                {isLocating ? 'Đang định vị…' : userLocation ? 'Đã lấy vị trí' : 'Lấy vị trí'}
              </button>
              {userLocation && (
                <button type="button" className="clear-location-btn" onClick={clearLocation} title="Hủy lọc theo vị trí GPS">
                  Bỏ vị trí ✕
                </button>
              )}
              <button type="button" onClick={resetBranchFilters}>Xóa lọc</button>
            </div>
          </form>
          {locationError && <p className="branch-filter-error" role="alert">{locationError}</p>}

          {/* Mobile view switcher */}
          <div className="branch-view-tabs" role="tablist" aria-label="Chế độ xem phòng khám">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'list'}
              className={`branch-view-tab ${activeView === 'list' ? 'active' : ''}`}
              onClick={() => setActiveView('list')}
            >
              📋 Danh sách ({branches.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'map'}
              className={`branch-view-tab ${activeView === 'map' ? 'active' : ''}`}
              onClick={() => setActiveView('map')}
            >
              🗺️ Bản đồ
            </button>
          </div>

          <div className={`branch-map-layout view-${activeView}`}>
            <div className={`branch-list ${branches.length === 0 ? 'is-empty' : ''}`}>
              {branchState === 'loading' && <p className="home-state state-loading">Đang tải danh sách chi nhánh…</p>}
              {branchState === 'error' && (
                <div className="branch-nearby-empty">
                  <strong>Chưa thể tải thông tin chi nhánh</strong>
                  <p>Không thể kết nối đến máy chủ hoặc dữ liệu đang được cập nhật. Bạn có thể nhấn đặt lại để xem toàn bộ chi nhánh.</p>
                  <button type="button" className="branch-empty-reset-btn" onClick={resetBranchFilters}>Xem lại toàn bộ chi nhánh</button>
                </div>
              )}
              {branchState === 'ready' && branches.length === 0 && (
                <div className="branch-nearby-empty">
                  <strong>{userLocation ? 'Đã xác định vị trí của bạn' : 'Không tìm thấy phòng khám phù hợp'}</strong>
                  <p>
                    {userLocation
                      ? `Chưa có phòng khám nào trong bán kính ${radiusKm} km. Bạn có thể chọn bán kính lớn hơn (ví dụ 10 km hoặc 20 km) rồi nhấn “Lọc”.`
                      : 'Không có chi nhánh nào khớp với từ khóa hoặc phường đã chọn. Vui lòng thử lại với từ khóa khác.'}
                  </p>
                  <button type="button" className="branch-empty-reset-btn" onClick={resetBranchFilters}>Xem toàn bộ chi nhánh</button>
                </div>
              )}
              {branchState === 'ready' && branches.map((branch) => (
                <article
                  id={`branch-card-${branch.id_branch}`}
                  className={`branch-list-card ${selectedBranchId === branch.id_branch ? 'selected' : ''}`}
                  key={branch.id_branch}
                  onClick={() => handleSelectBranch(branch.id_branch)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleSelectBranch(branch.id_branch)
                    }
                  }}
                >
                  {branch.primary_image && <img src={branch.primary_image.storage_key} alt="" loading="lazy" />}
                  <span className="branch-list-content">
                    <span className={`open-status ${branch.is_open_now ? 'is-open' : ''}`}><i />{branch.is_open_now ? 'Đang mở cửa' : 'Đang đóng cửa'}</span>
                    <strong>{branch.name}</strong>
                    <span>{branch.full_address}</span>
                    {branch.phone && <small>{branch.phone}</small>}
                    {branch.distance_km !== null && <small className="branch-distance">Cách bạn {branch.distance_km} km</small>}
                    <div className="branch-card-actions">
                      <Link className="branch-detail-link" to={`/chi-nhanh/${branch.id_branch}`} onClick={(event) => event.stopPropagation()}>
                        Chi tiết phòng khám <span>→</span>
                      </Link>
                    </div>
                  </span>
                </article>
              ))}
            </div>
            <div className="map-panel">
              <ErrorBoundary fallback={<div className="branch-map-canvas" style={{ display: 'grid', placeItems: 'center', color: '#526677' }}>Không thể hiển thị bản đồ vào lúc này.</div>}>
                <BranchMap
                  branches={branches}
                  selectedId={selectedBranchId}
                  onSelect={(id) => handleSelectBranch(id)}
                  userLocation={userLocation ? { ...userLocation, radiusKm: Number(radiusKm) } : null}
                />
              </ErrorBoundary>
            </div>
          </div>
        </section>

        {showLocationConsent && (
          <div className="location-consent-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowLocationConsent(false)}>
            <section className="location-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="location-consent-title">
              <div className="location-consent-icon" aria-hidden="true"><i /></div>
              <div>
                <p className="eyebrow">Vị trí của bạn</p>
                <h2 id="location-consent-title">Cho phép DentaVie lấy vị trí?</h2>
                <p>Vị trí chỉ được dùng để tìm các phòng khám trong bán kính bạn đã chọn. Trình duyệt sẽ hiện thêm một yêu cầu cấp quyền GPS.</p>
              </div>
              <div className="location-consent-actions">
                <button type="button" onClick={() => setShowLocationConsent(false)}>Để sau</button>
                <button type="button" onClick={findNearestBranches}>Cho phép và tiếp tục</button>
              </div>
            </section>
          </div>
        )}

        <section className="support-banner">
          <div><p className="eyebrow light">DentaVie luôn sẵn sàng</p><h2>Bạn cần tư vấn về dịch vụ nha khoa?</h2><p>Liên hệ với đội ngũ chăm sóc khách hàng hoặc xem cơ sở gần bạn.</p></div>
          <div className="support-actions"><a href="tel:19002102">Gọi 1900 2102</a><a href="#chi-nhanh">Xem chi nhánh</a></div>
        </section>
      </main>

      <footer className="site-footer" id="lien-he">
        <div className="footer-main">
          <div className="footer-brand"><img src="/branding/dentavie-logo-horizontal-white.png" alt="DentaVie" /><p>Chăm sóc nụ cười bằng sự rõ ràng, thuận tiện và tôn trọng.</p></div>
          <div><strong>Liên hệ</strong><a href="tel:19002102">Hotline: 1900 2102</a><a href="mailto:cskh@dentavie.vn">cskh@dentavie.vn</a><span>Thứ Hai – Chủ Nhật: 8:00 – 20:00</span></div>
          <div><strong>Khám phá</strong><a href="#dich-vu">Dịch vụ</a><a href="#ly-do">Về DentaVie</a><a href="#chi-nhanh">Chi nhánh</a></div>
        </div>
        <div className="footer-bottom"><span>© 2026 DentaVie</span><span>Thời gian hiển thị theo Asia/Ho_Chi_Minh</span></div>
      </footer>
    </div>
  )
}
