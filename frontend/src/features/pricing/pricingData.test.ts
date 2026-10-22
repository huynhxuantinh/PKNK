import { describe, expect, it } from 'vitest'

import { filterPriceGroups, priceGroups } from './pricingData'

describe('pricingData', () => {
  it('có đầy đủ các nhóm dịch vụ chính của DentaVie', () => {
    expect(priceGroups.map((group) => group.id)).toEqual([
      'tong-quat',
      'nieng-rang',
      'implant',
      'tham-my',
      'dieu-tri-tuy',
      'tre-em',
    ])
  })

  it('lọc dịch vụ không phân biệt hoa thường', () => {
    const result = filterPriceGroups(priceGroups, 'IMPLANT')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('implant')
  })

  it('chỉ giữ các dòng phù hợp khi tìm theo tên dịch vụ con', () => {
    const result = filterPriceGroups(priceGroups, 'mắc cài sứ')

    expect(result).toHaveLength(1)
    expect(result[0].items).toHaveLength(1)
    expect(result[0].items[0].name.toLocaleLowerCase('vi')).toContain('mắc cài sứ')
  })
})
