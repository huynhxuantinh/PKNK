export interface RouteStep {
  instruction: string
  distanceMeters: number
  modifier?: string
  name: string
}

export interface RoadRoute {
  distanceKm: number
  durationMinutes: number
  coordinates: [number, number][] // [lat, lng] array
  steps: RouteStep[]
}

function formatManeuver(type: string, modifier?: string, name?: string): string {
  const street = name ? ` vào đường ${name}` : ''
  switch (type) {
    case 'depart':
      return name ? `Bắt đầu xuất phát trên đường ${name}` : 'Bắt đầu xuất phát'
    case 'arrive':
      return 'Đến địa chỉ phòng khám'
    case 'turn':
    case 'end of road':
      if (modifier === 'left') return `Rẽ trái${street}`
      if (modifier === 'right') return `Rẽ phải${street}`
      if (modifier === 'slight left') return `Chếch nhẹ sang trái${street}`
      if (modifier === 'slight right') return `Chếch nhẹ sang phải${street}`
      if (modifier === 'sharp left') return `Rẽ ngoặt sang trái${street}`
      if (modifier === 'sharp right') return `Rẽ ngoặt sang phải${street}`
      if (modifier === 'straight') return `Đi thẳng${street}`
      return `Chuyển hướng${street}`
    case 'continue':
    case 'new name':
      return name ? `Tiếp tục đi thẳng trên ${name}` : 'Tiếp tục đi thẳng'
    case 'roundabout':
    case 'rotary':
      return `Đi vào bùng binh${street}`
    case 'exit roundabout':
    case 'exit rotary':
      return `Rời bùng binh${street}`
    case 'fork':
      if (modifier?.includes('left')) return `Đi theo nhánh bên trái${street}`
      if (modifier?.includes('right')) return `Đi theo nhánh bên phải${street}`
      return `Đi theo nhánh đường${street}`
    case 'merge':
      return `Nhập làn${street}`
    case 'on ramp':
      return `Đi vào đường dẫn${street}`
    case 'off ramp':
      return `Đi ra lối thoát${street}`
    default:
      return name ? `Đi theo hướng ${name}` : 'Tiếp tục di chuyển'
  }
}

export async function fetchRoadRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<RoadRoute | null> {
  try {
    const fetchCandidateRoutes = async (profile: string) => {
      try {
        const url = `https://router.project-osrm.org/route/v1/${profile}/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true&alternatives=true`
        const res = await fetch(url, { signal })
        if (!res.ok) return []
        const data = await res.json()
        return Array.isArray(data.routes) ? data.routes : []
      } catch {
        return []
      }
    }

    // Check both driving and bike (two-wheeler) networks to find the shortest feasible road path
    const [drivingRoutes, bikeRoutes] = await Promise.all([
      fetchCandidateRoutes('driving'),
      fetchCandidateRoutes('bike'),
    ])

    const allCandidates = [...drivingRoutes, ...bikeRoutes]
    if (allCandidates.length === 0) return null

    // Sort strictly by distance ascending to guarantee the SHORTEST route
    allCandidates.sort((a, b) => a.distance - b.distance)
    const shortestRoute = allCandidates[0]

    // OSRM returns coordinates as [lng, lat], Leaflet needs [lat, lng]
    const coordinates: [number, number][] = shortestRoute.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng],
    )

    const rawSteps = shortestRoute.legs?.[0]?.steps || []
    const steps: RouteStep[] = rawSteps.map((s: { maneuver?: { type?: string; modifier?: string }; distance?: number; name?: string }) => ({
      instruction: formatManeuver(s.maneuver?.type || '', s.maneuver?.modifier, s.name),
      distanceMeters: Math.round(s.distance || 0),
      modifier: s.maneuver?.modifier,
      name: s.name || '',
    }))

    return {
      distanceKm: Math.round((shortestRoute.distance / 1000) * 10) / 10,
      durationMinutes: Math.max(1, Math.round(shortestRoute.duration / 60)),
      coordinates,
      steps,
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    console.warn('Lỗi tải lộ trình đường đi ngắn nhất:', err)
    return null
  }
}
