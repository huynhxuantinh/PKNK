import { describe, expect, it } from 'vitest'

import { SITE_URL, absoluteUrl, homeSeo, pricingSeo } from './seoConfig'

describe('seoConfig', () => {
  it('tạo URL tuyệt đối nhất quán với domain chính', () => {
    expect(absoluteUrl('/bang-gia')).toBe(`${SITE_URL}/bang-gia`)
    expect(absoluteUrl('chi-nhanh/1')).toBe(`${SITE_URL}/chi-nhanh/1`)
  })

  it('trang chủ có title và mô tả phù hợp giới hạn tìm kiếm', () => {
    expect(homeSeo.title.length).toBeLessThanOrEqual(60)
    expect(homeSeo.description.length).toBeGreaterThanOrEqual(120)
    expect(homeSeo.description.length).toBeLessThanOrEqual(160)
  })

  it('trang bảng giá có canonical riêng', () => {
    expect(pricingSeo.path).toBe('/bang-gia')
    expect(pricingSeo.title).toContain('Bảng giá')
  })
})
