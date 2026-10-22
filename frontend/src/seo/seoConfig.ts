export const SITE_URL = 'https://dentavie.id.vn'
export const SITE_NAME = 'DentaVie'
export const DEFAULT_SHARE_IMAGE = '/hero/banner-cham-soc-gia-dinh.png'

export interface SeoDefinition {
  title: string
  description: string
  path: string
  image?: string
  noIndex?: boolean
}

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}/${path.replace(/^\/+/, '')}`
}

export const homeSeo: SeoDefinition = {
  title: 'Nha khoa DentaVie - Chăm sóc răng miệng toàn diện',
  description: 'DentaVie cung cấp dịch vụ nha khoa tổng quát, niềng răng, Implant, thẩm mỹ và điều trị tủy với đội ngũ bác sĩ tận tâm tại TP.HCM.',
  path: '/',
}

export const pricingSeo: SeoDefinition = {
  title: 'Bảng giá dịch vụ nha khoa tham khảo | DentaVie',
  description: 'Tra cứu bảng giá tham khảo cho nha khoa tổng quát, niềng răng, Implant, thẩm mỹ, điều trị tủy và nha khoa trẻ em tại DentaVie.',
  path: '/bang-gia',
}

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl('/branding/dentavie-logo-horizontal-color.png'),
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+84-1900-2102',
    contactType: 'customer service',
    areaServed: 'VN',
    availableLanguage: 'Vietnamese',
  },
}

export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  inLanguage: 'vi-VN',
  publisher: { '@id': `${SITE_URL}/#organization` },
}
