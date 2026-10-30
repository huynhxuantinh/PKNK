import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'

import { roundCoordinate } from '../../features/organization/organizationValidation'

export interface LocationValue {
  lat: number
  lng: number
}

interface LocationPickerProps {
  value: LocationValue | null
  onChange: (lat: number | null, lng: number | null) => void
  disabled?: boolean
  defaultSearchQuery?: string
}

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

const DEFAULT_CENTER: L.LatLngExpression = [10.7769, 106.7009]

const branchLocationIcon = L.divIcon({
  className: 'branch-map-marker-wrap location-picker-marker-wrap',
  html: '<span class="branch-map-marker selected location-picker-marker"><i></i></span>',
  iconSize: [32, 38],
  iconAnchor: [16, 36],
})

function positionKey(value: LocationValue | null) {
  return value ? `${roundCoordinate(value.lat)},${roundCoordinate(value.lng)}` : 'empty'
}

export function LocationPicker({
  value,
  onChange,
  disabled = false,
  defaultSearchQuery = '',
}: LocationPickerProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)
  const disabledRef = useRef(disabled)
  const selfChangeRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastSearchAtRef = useRef(0)
  const [query, setQuery] = useState(defaultSearchQuery)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const [locating, setLocating] = useState(false)

  onChangeRef.current = onChange
  valueRef.current = value
  disabledRef.current = disabled

  function emitPosition(lat: number, lng: number) {
    const next = { lat: roundCoordinate(lat), lng: roundCoordinate(lng) }
    selfChangeRef.current = positionKey(next)
    markerRef.current?.setLatLng(next)
    onChangeRef.current(next.lat, next.lng)
  }

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return

    const initial = valueRef.current
    const map = L.map(elementRef.current, {
      center: initial ? [initial.lat, initial.lng] : DEFAULT_CENTER,
      zoom: initial ? 16 : 12,
      scrollWheelZoom: false,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    function createMarker(lat: number, lng: number) {
      const marker = L.marker([lat, lng], {
        draggable: !disabledRef.current,
        icon: branchLocationIcon,
        title: 'Vị trí chi nhánh',
      }).addTo(map)
      marker.on('dragend', () => {
        const position = marker.getLatLng()
        emitPosition(position.lat, position.lng)
      })
      markerRef.current = marker
    }

    if (initial) createMarker(initial.lat, initial.lng)
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (disabledRef.current) return
      if (!markerRef.current) createMarker(event.latlng.lat, event.latlng.lng)
      emitPosition(event.latlng.lat, event.latlng.lng)
    })
    mapRef.current = map

    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(elementRef.current)
    window.requestAnimationFrame(() => map.invalidateSize())

    return () => {
      observer.disconnect()
      abortRef.current?.abort()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const container = elementRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent) => {
      const map = mapRef.current
      if (!map || (!event.ctrlKey && !event.metaKey)) return
      event.preventDefault()
      const delta = event.deltaY < 0 ? 1 : -1
      map.setZoom(Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta)))
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const key = positionKey(value)
    if (selfChangeRef.current === key) {
      selfChangeRef.current = null
      return
    }
    if (!value) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([value.lat, value.lng], {
        draggable: !disabled,
        icon: branchLocationIcon,
        title: 'Vị trí chi nhánh',
      }).addTo(map)
      markerRef.current.on('dragend', () => {
        const position = markerRef.current?.getLatLng()
        if (position) emitPosition(position.lat, position.lng)
      })
    } else {
      markerRef.current.setLatLng(value)
    }
    map.panTo(value)
  }, [disabled, value])

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    if (disabled) marker.dragging?.disable()
    else marker.dragging?.enable()
  }, [disabled])

  useEffect(() => {
    setQuery(defaultSearchQuery)
  }, [defaultSearchQuery])

  function chooseResult(result: NominatimResult) {
    const lat = Number(result.lat)
    const lng = Number(result.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], {
        draggable: !disabled,
        icon: branchLocationIcon,
        title: 'Vị trí chi nhánh',
      }).addTo(mapRef.current!)
      markerRef.current.on('dragend', () => {
        const position = markerRef.current?.getLatLng()
        if (position) emitPosition(position.lat, position.lng)
      })
    }
    emitPosition(lat, lng)
    mapRef.current?.setView([lat, lng], 16)
    setMessage('Đã đặt ghim theo kết quả tìm kiếm. Bạn có thể kéo để chỉnh lại.')
  }

  async function searchAddress() {
    const trimmedQuery = query.trim()
    if (!trimmedQuery || searching || disabled) return
    setSearching(true)
    setMessage('')
    setResults([])
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const waitMs = Math.max(0, 1000 - (Date.now() - lastSearchAtRef.current))
      if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs))
      lastSearchAtRef.current = Date.now()
      const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '5',
        countrycodes: 'vn',
        q: trimmedQuery,
      })
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'vi' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('search_failed')
      const data = (await response.json()) as NominatimResult[]
      setResults(data)
      if (!data.length) {
        setMessage('Không tìm thấy, hãy kéo ghim hoặc nhập tọa độ.')
        return
      }
      chooseResult(data[0])
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessage('Không thể tìm địa chỉ lúc này. Hãy thử lại hoặc đặt ghim thủ công.')
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation || disabled) {
      setMessage('Trình duyệt không hỗ trợ hoặc không cho phép lấy vị trí.')
      return
    }
    setLocating(true)
    setMessage('Đang xác định vị trí của bạn...')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        chooseResult({ place_id: 0, display_name: 'Vị trí hiện tại', lat: String(latitude), lon: String(longitude) })
        setMessage('Đã dùng vị trí hiện tại. Hãy kéo ghim nếu cần chỉnh lại.')
        setLocating(false)
      },
      () => {
        setMessage('Không lấy được vị trí. Hãy cấp quyền định vị rồi thử lại.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <div className="location-picker" data-testid="location-picker">
      <div className="location-picker-search">
        <label htmlFor="organization-location-search">Tìm địa chỉ trên bản đồ</label>
        <div>
          <input
            id="organization-location-search"
            value={query}
            disabled={disabled}
            placeholder="Nhập địa chỉ, phường/xã, tỉnh/thành"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void searchAddress()
              }
            }}
          />
          <button type="button" disabled={disabled || searching || !query.trim()} onClick={() => void searchAddress()}>
            {searching ? 'Đang tìm...' : 'Tìm trên bản đồ'}
          </button>
        </div>
      </div>

      {results.length > 1 && (
        <div className="location-picker-results" aria-label="Kết quả tìm địa chỉ">
          {results.map((result) => (
            <button key={result.place_id} type="button" onClick={() => chooseResult(result)}>
              {result.display_name}
            </button>
          ))}
        </div>
      )}

      <div ref={elementRef} className="location-picker-map" aria-label="Chọn vị trí chi nhánh trên bản đồ" />

      <div className="location-picker-toolbar">
        <span>Giữ Ctrl và lăn chuột để phóng to bản đồ.</span>
        <div>
          <button type="button" disabled={disabled || locating} onClick={useCurrentLocation}>
            {locating ? 'Đang lấy vị trí...' : 'Dùng vị trí hiện tại'}
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={disabled || !value}
            onClick={() => {
              selfChangeRef.current = 'empty'
              markerRef.current?.remove()
              markerRef.current = null
              onChangeRef.current(null, null)
              setMessage('Đã xóa vị trí đã chọn.')
            }}
          >
            Xóa vị trí
          </button>
        </div>
      </div>
      {message && <p className="location-picker-message" role="status">{message}</p>}
    </div>
  )
}
