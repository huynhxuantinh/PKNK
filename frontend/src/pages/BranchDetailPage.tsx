import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { getBranchDetail } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { BranchMap } from '../components/BranchMap'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Seo } from '../seo/Seo'
import { SITE_URL, absoluteUrl } from '../seo/seoConfig'
import { shouldShowRoadRoute } from '../services/routeDisplay'
import { fetchRoadRoute, type RoadRoute } from '../services/routing'
import type { Branch, BranchDetail } from '../types/api'

function computeDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

function formatVnd(price: string | number): string {
  const num = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(num) || num <= 0) return ''
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num)
}

export function BranchDetailPage() {
  const { branchId } = useParams()
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const [branch, setBranch] = useState<BranchDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null)
  const [routeConsentGranted, setRouteConsentGranted] = useState(false)
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const galleryTouchStartX = useRef<number | null>(null)

  useEffect(() => {
    const id = Number(branchId)
    if (!Number.isInteger(id) || id < 1) {
      setState('error')
      return
    }

    const controller = new AbortController()
    setState('loading')
    getBranchDetail(id, controller.signal)
      .then((response) => {
        setBranch(response.data)
        setState('ready')
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState('error')
      })
    return () => controller.abort()
  }, [branchId])

  // Route lookup is opt-in because it sends the selected coordinates to OSRM.
  useEffect(() => {
    if (!userLocation || !branch?.location || !routeConsentGranted) {
      setRoadRoute(null)
      setIsLoadingRoute(false)
      return
    }

    const controller = new AbortController()
    setIsLoadingRoute(true)
    fetchRoadRoute(userLocation, branch.location, controller.signal)
      .then((route) => {
        setRoadRoute(route)
        setIsLoadingRoute(false)
      })
      .catch(() => {
        setIsLoadingRoute(false)
      })

    return () => controller.abort()
  }, [userLocation, branch, routeConsentGranted])

  const todayHours = useMemo(() => {
    const weekday = new Date().getDay() || 7
    return branch?.opening_hours.find((item) => item.weekday === weekday)
  }, [branch])

  const galleryImages = useMemo(() => {
    if (!branch) return []
    return [...branch.images].sort((left, right) => {
      if (left.is_primary !== right.is_primary) return left.is_primary ? -1 : 1
      return left.sort_order - right.sort_order
    })
  }, [branch])

  useEffect(() => setActiveImageIndex(0), [branch?.id_branch])

  const isOpenNow = useMemo(() => {
    if (!todayHours || todayHours.is_closed) return false
    const now = new Date()
    const currentHours = now.getHours()
    const currentMinutes = now.getMinutes()
    const currentTimeStr = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}:00`
    if (!todayHours.open_time || !todayHours.close_time) return false
    return currentTimeStr >= todayHours.open_time && currentTimeStr < todayHours.close_time
  }, [todayHours])

  const mapBranch = useMemo<Branch | null>(() => {
    if (!branch) return null
    return {
      id_branch: branch.id_branch,
      code: branch.code,
      name: branch.name,
      phone: branch.phone,
      province_code: branch.province_code,
      province_name: branch.province_name,
      ward_code: branch.ward_code,
      ward_name: branch.ward_name,
      address_line: '',
      full_address: branch.full_address,
      location: branch.location,
      distance_km: null,
      is_open_now: isOpenNow,
      primary_image: branch.images.find((image) => image.is_primary) || branch.images[0] || null,
    }
  }, [branch, isOpenNow])

  const branchSeo = useMemo(() => {
    if (!branch) return null
    return {
      title: `${branch.name} - Nha khoa tại ${branch.ward_name} | DentaVie`,
      description: `${branch.name} tại ${branch.full_address}. Xem dịch vụ, bác sĩ, giờ làm việc, bản đồ và đặt lịch khám nha khoa trực tuyến.`,
      path: `/chi-nhanh/${branch.id_branch}`,
      image: branch.images.find((image) => image.is_primary)?.storage_key || branch.images[0]?.storage_key,
    }
  }, [branch])

  const branchStructuredData = useMemo(() => {
    if (!branch || !branchSeo) return undefined
    const pageUrl = `${SITE_URL}${branchSeo.path}`
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Dentist',
        '@id': `${pageUrl}#clinic`,
        name: branch.name,
        url: pageUrl,
        telephone: branch.phone || undefined,
        email: branch.email || undefined,
        image: branchSeo.image ? absoluteUrl(branchSeo.image) : undefined,
        address: {
          '@type': 'PostalAddress',
          streetAddress: branch.full_address,
          addressLocality: branch.ward_name,
          addressRegion: branch.province_name,
          addressCountry: 'VN',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: branch.location.latitude,
          longitude: branch.location.longitude,
        },
        priceRange: '$$',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Chi nhánh', item: `${SITE_URL}/#chi-nhanh` },
          { '@type': 'ListItem', position: 3, name: branch.name, item: pageUrl },
        ],
      },
    ]
  }, [branch, branchSeo])

  const distanceKm = useMemo(() => {
    if (!userLocation || !branch?.location) return null
    return computeDistanceKm(
      userLocation.latitude,
      userLocation.longitude,
      branch.location.latitude,
      branch.location.longitude,
    )
  }, [userLocation, branch])

  const displayDistanceKm = roadRoute ? roadRoute.distanceKm : distanceKm
  const displayDurationMinutes = roadRoute
    ? roadRoute.durationMinutes
    : distanceKm
      ? Math.max(4, Math.round((distanceKm / 22) * 60))
      : null

  // Google Maps Directions link
  const googleMapsDirectionsUrl = useMemo(() => {
    if (!branch?.location) return '#'
    const dest = `${branch.location.latitude},${branch.location.longitude}`
    if (userLocation) {
      return `https://www.google.com/maps/dir/?api=1&origin=${userLocation.latitude},${userLocation.longitude}&destination=${dest}&travelmode=driving`
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`
  }, [branch, userLocation])

  function handleGetDirections() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt của bạn không hỗ trợ tính năng định vị.')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        })
        setIsLocating(false)
        const mapSection = document.getElementById('vi-tri-chi-nhanh')
        mapSection?.scrollIntoView({ behavior: 'smooth' })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Bạn chưa cấp quyền truy cập vị trí. Hãy mở biểu tượng ổ khóa trên thanh địa chỉ để bật lại.')
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError('Thiết bị chưa xác định được vị trí GPS hiện tại.')
        } else {
          setLocationError('Lấy vị trí quá thời gian chờ. Vui lòng thử lại.')
        }
        setIsLocating(false)
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    )
  }

  function handleClearDirections() {
    setUserLocation(null)
    setRoadRoute(null)
    setRouteConsentGranted(false)
    setShowSteps(false)
    setLocationError('')
  }

  function moveGallery(direction: number) {
    if (galleryImages.length < 2) return
    setActiveImageIndex((current) => (current + direction + galleryImages.length) % galleryImages.length)
  }

  if (state === 'loading') {
    return <div className="clinic-detail-state state-loading">Đang tải thông tin chi nhánh…</div>
  }

  if (state === 'error' || !branch || !mapBranch) {
    return (
      <div className="clinic-detail-state">
        <p>Không tìm thấy chi nhánh phù hợp.</p>
        <Link to="/#chi-nhanh">← Về danh sách chi nhánh</Link>
      </div>
    )
  }

  const bookingPath = `/dat-lich?chi-nhanh=${branch.id_branch}`
  const returnPath = `${location.pathname}${location.search}${location.hash}`
  const bookingLink = isAuthenticated
    ? bookingPath
    : `/dang-nhap?returnTo=${encodeURIComponent(returnPath)}`

  return (
    <div className="site-shell clinic-detail-page">
      {branchSeo && <Seo {...branchSeo} jsonLd={branchStructuredData} />}
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <nav className="main-nav" aria-label="Điều hướng chi tiết chi nhánh">
          <Link to="/bang-gia">Bảng giá</Link>
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
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className={`mobile-nav-drawer ${mobileMenuOpen ? 'open' : ''}`} role="dialog" aria-label="Menu di động">
        <nav className="mobile-nav-links">
          <Link to="/bang-gia" onClick={() => setMobileMenuOpen(false)}>Bảng giá</Link>
          <Link to="/#ly-do" onClick={() => setMobileMenuOpen(false)}>Về DentaVie</Link>
          <Link to="/#chi-nhanh" onClick={() => setMobileMenuOpen(false)}>Hệ thống chi nhánh</Link>
          <Link to="/#lien-he" onClick={() => setMobileMenuOpen(false)}>Thông tin liên hệ</Link>
        </nav>
      </div>

      <main className="clinic-detail-main">
        {/* Breadcrumb Navigation */}
        <nav className="clinic-breadcrumb" aria-label="Đường dẫn trang">
          <Link to="/">Trang chủ</Link>
          <span>/</span>
          <Link to="/#chi-nhanh">Hệ thống chi nhánh</Link>
          <span>/</span>
          <span className="current">{branch.name}</span>
        </nav>

        {/* Hero Section */}
        <section className="clinic-detail-hero">
          <div className="clinic-detail-copy">
            <div className="clinic-hero-meta">
              <span className={`open-status ${isOpenNow ? 'is-open' : ''}`}>
                <i />
                {isOpenNow ? 'Đang mở cửa' : 'Đang đóng cửa'}
              </span>
              <span className="clinic-code-badge">{branch.code}</span>
            </div>

            <h1>{branch.name}</h1>
            <p className="clinic-detail-address">{branch.full_address}</p>

            <div className="clinic-detail-facts">
              {branch.phone && (
                <a href={`tel:${branch.phone.replace(/\s/g, '')}`} className="clinic-detail-fact">
                  <small>Điện thoại</small>
                  <strong>{branch.phone}</strong>
                </a>
              )}
              {branch.email && (
                <a href={`mailto:${branch.email}`} className="clinic-detail-fact">
                  <small>Email</small>
                  <strong>{branch.email}</strong>
                </a>
              )}
              <div className="clinic-detail-fact">
                <small>Hôm nay</small>
                <strong>
                  {todayHours?.is_closed
                    ? 'Nghỉ'
                    : todayHours
                      ? `${todayHours.open_time?.slice(0, 5)} – ${todayHours.close_time?.slice(0, 5)}`
                      : 'Đang cập nhật'}
                </strong>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="clinic-hero-actions">
              <Link to={bookingLink} className="clinic-btn primary">Đặt lịch khám</Link>
              <a href="#vi-tri-chi-nhanh" className="clinic-btn secondary">Xem bản đồ</a>
            </div>
          </div>

          <div className="clinic-detail-image">
            {galleryImages.length > 0 ? (
              <>
                <div
                  className="clinic-gallery-track"
                  style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}
                  onTouchStart={(event) => { galleryTouchStartX.current = event.touches[0]?.clientX ?? null }}
                  onTouchEnd={(event) => {
                    const startX = galleryTouchStartX.current
                    const endX = event.changedTouches[0]?.clientX
                    galleryTouchStartX.current = null
                    if (startX === null || endX === undefined || Math.abs(startX - endX) < 45) return
                    moveGallery(startX > endX ? 1 : -1)
                  }}
                >
                  {galleryImages.map((image, index) => (
                    <div className="clinic-gallery-slide" key={image.id_branch_image} aria-hidden={index !== activeImageIndex}>
                      <img src={image.storage_key} alt={`Không gian phòng khám ${branch.name} - ảnh ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} />
                    </div>
                  ))}
                </div>
                {galleryImages.length > 1 ? (
                  <>
                    <button className="clinic-gallery-arrow prev" type="button" onClick={() => moveGallery(-1)} aria-label="Xem ảnh trước">‹</button>
                    <button className="clinic-gallery-arrow next" type="button" onClick={() => moveGallery(1)} aria-label="Xem ảnh tiếp theo">›</button>
                    <div className="clinic-gallery-dots" aria-label="Chọn ảnh phòng khám">
                      {galleryImages.map((image, index) => (
                        <button
                          key={image.id_branch_image}
                          type="button"
                          className={index === activeImageIndex ? 'active' : ''}
                          onClick={() => setActiveImageIndex(index)}
                          aria-label={`Xem ảnh ${index + 1}`}
                          aria-current={index === activeImageIndex ? 'true' : undefined}
                        />
                      ))}
                    </div>
                    <span className="clinic-gallery-count">{activeImageIndex + 1}/{galleryImages.length}</span>
                  </>
                ) : null}
              </>
            ) : (
              <div className="clinic-detail-placeholder">Không gian phòng khám DentaVie</div>
            )}
          </div>
        </section>

        {/* Operating Hours & Services */}
        <section className="clinic-detail-grid">
          {/* Services */}
          <article className="clinic-info-card clinic-services-card">
            <p className="eyebrow">Dịch vụ điều trị</p>
            <h2>Dịch vụ tại cơ sở ({branch.services.length})</h2>
            <div className={`clinic-service-list ${branch.services.length > 6 ? 'is-scrollable' : ''}`}>
              {branch.services.map((service) => (
                <div className="clinic-service-card" key={service.id_branch_service}>
                  <div className="service-card-top">
                    <strong>{service.name}</strong>
                    <span className="service-duration">{service.duration_minutes} phút</span>
                  </div>
                  {formatVnd(service.price) && (
                    <div className="service-price">
                      <span>Giá tham khảo:</span>
                      <strong>{formatVnd(service.price)}</strong>
                    </div>
                  )}
                  {service.description && <p>{service.description}</p>}
                </div>
              ))}
            </div>
            {branch.services.length > 6 ? <p className="clinic-service-scroll-hint">Cuộn để xem thêm dịch vụ</p> : null}
          </article>

          {/* Operating Hours */}
          <article className="clinic-info-card clinic-hours-card">
            <p className="eyebrow">Thời gian hoạt động</p>
            <h2>Giờ làm việc</h2>
            <div className="clinic-hours-list">
              {branch.opening_hours.map((item) => (
                <div
                  key={item.weekday}
                  className={`clinic-hour-row ${item.weekday === (new Date().getDay() || 7) ? 'today' : ''}`}
                >
                  <span className="hour-weekday">{item.weekday_label}</span>
                  <strong className="hour-time">
                    {item.is_closed
                      ? 'Nghỉ'
                      : `${item.open_time?.slice(0, 5)} – ${item.close_time?.slice(0, 5)}`}
                  </strong>
                </div>
              ))}
            </div>
            <p className="clinic-hours-note">Nên đặt hẹn trước để được phục vụ thuận tiện hơn.</p>
          </article>
        </section>

        {/* Location & Interactive Route Map Section */}
        <section className="clinic-location-section" id="vi-tri-chi-nhanh">
          <div className="clinic-location-card">
            <p className="eyebrow">Bản đồ</p>
            <h2>Vị trí phòng khám</h2>
            <p className="clinic-location-summary">Xem vị trí và đường đi thuận tiện.</p>

            {userLocation ? (
              <div className="route-info-box">
                <div className="route-stat">
                  <div>
                    <small>{roadRoute ? 'Khoảng cách theo đường bộ' : 'Khoảng cách ước tính'}</small>
                    <strong>~{displayDistanceKm} km</strong>
                  </div>
                </div>

                <div className="route-estimates">
                  <span>{roadRoute ? `Thời gian lái xe ước tính: ~${displayDurationMinutes} phút` : 'Khoảng cách đường chim bay.'}</span>
                  {isLoadingRoute && <span className="route-loading">Đang tìm đường ngắn nhất…</span>}
                </div>

                {!routeConsentGranted && (
                  <div className="route-prompt-box">
                    <p>Để tìm lộ trình, vị trí hiện tại và điểm đến sẽ được gửi tới OSRM, dịch vụ định tuyến bên thứ ba.</p>
                    <button
                      type="button"
                      className="route-locate-btn"
                      onClick={() => setRouteConsentGranted(true)}
                    >
                      Đồng ý tìm đường
                    </button>
                  </div>
                )}

                {roadRoute && roadRoute.steps.length > 0 && (
                  <div className="route-steps-container">
                    <button
                      type="button"
                      className="route-steps-toggle"
                      onClick={() => setShowSteps(!showSteps)}
                    >
                      {showSteps ? 'Thu gọn hướng dẫn' : `Xem ${roadRoute.steps.length} chặng chỉ đường`}
                    </button>
                    {showSteps && (
                      <ol className="route-steps-list">
                        {roadRoute.steps.map((step, idx) => (
                          <li key={idx} className="route-step-item">
                            <span className="step-badge">{idx + 1}</span>
                            <div className="step-body">
                              <span className="step-desc">{step.instruction}</span>
                              {step.distanceMeters > 0 && (
                                <span className="step-meter">
                                  {step.distanceMeters >= 1000
                                    ? `${(step.distanceMeters / 1000).toFixed(1)} km`
                                    : `${step.distanceMeters} m`}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                <div className="route-actions">
                  <a
                    href={googleMapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="route-gmap-btn"
                  >
                    Mở chỉ đường trên Google Maps ↗
                  </a>
                  <button type="button" className="route-clear-btn" onClick={handleClearDirections}>
                    Xóa lộ trình
                  </button>
                </div>
              </div>
            ) : (
              <div className="route-prompt-box">
                <p>Dùng vị trí hiện tại để xem khoảng cách.</p>
                <div className="route-prompt-actions">
                  <button
                    type="button"
                    className="route-locate-btn"
                    onClick={handleGetDirections}
                    disabled={isLocating}
                  >
                    {isLocating ? 'Đang lấy vị trí…' : 'Lấy vị trí'}
                  </button>
                  <a
                    href={googleMapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="route-gmap-btn"
                  >
                    Google Maps ↗
                  </a>
                </div>
                {locationError && <p className="route-error" role="alert">{locationError}</p>}
              </div>
            )}
          </div>

          <div className="clinic-detail-map-wrap">
            <ErrorBoundary
              fallback={
                <div className="branch-map-canvas" style={{ display: 'grid', placeItems: 'center', color: '#526677' }}>
                  Không thể hiển thị bản đồ vào lúc này.
                </div>
              }
            >
              <BranchMap
                branches={[mapBranch]}
                selectedId={mapBranch.id_branch}
                onSelect={() => undefined}
                userLocation={userLocation}
                showRoute={shouldShowRoadRoute(roadRoute?.coordinates)}
                routeCoordinates={roadRoute?.coordinates}
                showBranchPopup={false}
              />
            </ErrorBoundary>
          </div>
        </section>

        {/* Dentists Section */}
        {branch.dentists.length > 0 && (
          <section className="clinic-dentists-section">
            <div className="section-heading-centered">
              <p className="eyebrow">Đội ngũ bác sĩ</p>
              <h2>Bác sĩ tại chi nhánh</h2>
              <p>Bác sĩ phụ trách tại cơ sở.</p>
            </div>
            <div className="clinic-dentist-grid">
              {branch.dentists.map((dentist) => (
                <article key={dentist.id_dentist} className="dentist-card">
                  <div className="dentist-avatar" aria-hidden="true">
                    {dentist.full_name
                      .split(' ')
                      .slice(-2)
                      .map((part) => part[0])
                      .join('')}
                  </div>
                  <div className="dentist-info">
                    <strong>{dentist.full_name}</strong>
                    <span className="dentist-license">CCHN: {dentist.license_number}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

      </main>

      <footer className="site-footer" id="lien-he">
        <div className="footer-main">
          <div className="footer-brand">
            <img src="/branding/dentavie-logo-horizontal-white.png" alt="DentaVie" />
            <p>Chăm sóc nụ cười bằng sự rõ ràng, thuận tiện và tôn trọng.</p>
          </div>
          <div>
            <strong>Liên hệ</strong>
            <a href="tel:19002102">Hotline: 1900 2102</a>
            <a href="mailto:cskh@dentavie.vn">cskh@dentavie.vn</a>
            <span>Thứ Hai – Chủ Nhật: 8:00 – 20:00</span>
          </div>
          <div>
            <strong>Khám phá</strong>
            <Link to="/#dich-vu">Dịch vụ</Link>
            <Link to="/#ly-do">Về DentaVie</Link>
            <Link to="/#chi-nhanh">Chi nhánh</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 DentaVie</span>
          <span>Thời gian hiển thị theo Asia/Ho_Chi_Minh</span>
        </div>
      </footer>
    </div>
  )
}
