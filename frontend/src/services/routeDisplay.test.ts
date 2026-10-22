import { describe, expect, it } from 'vitest'

import { shouldShowRoadRoute } from './routeDisplay'

describe('shouldShowRoadRoute', () => {
  it('không vẽ tuyến đường khi API chưa trả tọa độ', () => {
    expect(shouldShowRoadRoute(undefined)).toBe(false)
    expect(shouldShowRoadRoute([])).toBe(false)
  })

  it('chỉ vẽ khi đã có tuyến đường thật', () => {
    expect(shouldShowRoadRoute([[10.77, 106.69], [10.78, 106.7]])).toBe(true)
  })
})
