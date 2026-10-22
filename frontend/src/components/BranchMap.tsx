import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'

import type { Branch } from '../types/api'

interface BranchMapProps {
  branches: Branch[]
  selectedId: number | null
  onSelect: (id: number) => void
  userLocation: {
    latitude: number
    longitude: number
    radiusKm?: number
  } | null
  showRoute?: boolean
  routeCoordinates?: [number, number][] | null
  showBranchPopup?: boolean
}

export function BranchMap({
  branches,
  selectedId,
  onSelect,
  userLocation,
  showRoute,
  routeCoordinates,
  showBranchPopup = true,
}: BranchMapProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const userLocationRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const markersMapRef = useRef<Map<number, L.Marker>>(new Map())
  const onSelectRef = useRef(onSelect)

  onSelectRef.current = onSelect

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return

    const map = L.map(elementRef.current, {
      center: [10.7769, 106.7009],
      zoom: 12,
      scrollWheelZoom: false,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map
    userLocationRef.current = L.layerGroup().addTo(map)
    markersRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      userLocationRef.current = null
      markersRef.current = null
      markersMapRef.current.clear()
    }
  }, [])

  // Auto invalidate size on responsive container resize
  useEffect(() => {
    if (!elementRef.current || !mapRef.current) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize()
    })
    observer.observe(elementRef.current)
    return () => observer.disconnect()
  }, [])

  // Ctrl + Wheel to zoom handler
  useEffect(() => {
    const container = elementRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent) => {
      const map = mapRef.current
      if (!map) return

      if (event.ctrlKey || event.metaKey) {
        // Holding Ctrl -> Zoom map smoothly
        event.preventDefault()
        const currentZoom = map.getZoom()
        if (event.deltaY < 0) {
          map.setZoom(Math.min(map.getMaxZoom(), currentZoom + 1))
        } else if (event.deltaY > 0) {
          map.setZoom(Math.max(map.getMinZoom(), currentZoom - 1))
        }
      }
      // If Ctrl not held, let normal page scrolling happen naturally without any popup/overlay
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [])



  useEffect(() => {
    const map = mapRef.current
    const locationLayer = userLocationRef.current
    if (!map || !locationLayer) return

    locationLayer.clearLayers()
    if (
      !userLocation ||
      !Number.isFinite(userLocation.latitude) ||
      !Number.isFinite(userLocation.longitude)
    ) {
      return
    }

    try {
      const position = L.latLng(userLocation.latitude, userLocation.longitude)

      if (userLocation.radiusKm) {
        const radiusMeters = Math.max(100, userLocation.radiusKm * 1000)
        L.circle(position, {
          radius: radiusMeters,
          color: '#087493',
          weight: 2,
          opacity: 0.75,
          dashArray: '7 7',
          fillColor: '#45b6cc',
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(locationLayer)
      }

      L.circleMarker(position, {
        radius: 9,
        color: '#ffffff',
        weight: 4,
        fillColor: '#087493',
        fillOpacity: 1,
        className: 'user-location-marker',
      })
        .bindTooltip('Vị trí của bạn', {
          permanent: true,
          direction: 'top',
          offset: [0, -10],
          className: 'user-location-tooltip',
        })
        .addTo(locationLayer)

      if (showRoute && routeCoordinates && routeCoordinates.length > 0) {
        // Outer glow/casing to make route stand out over map tiles
        L.polyline(routeCoordinates, {
          color: '#ffffff',
          weight: 8,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(locationLayer)

        // Main road route line
        L.polyline(routeCoordinates, {
          color: '#087493',
          weight: 5,
          opacity: 0.95,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(locationLayer)

        // Inner highlight
        L.polyline(routeCoordinates, {
          color: '#38bdf8',
          weight: 2,
          opacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(locationLayer)
      } else if (showRoute && branches.length === 1 && branches[0]?.location) {
        const dest = L.latLng(branches[0].location.latitude, branches[0].location.longitude)
        L.polyline([position, dest], {
          color: '#087493',
          weight: 4,
          dashArray: '6 8',
          opacity: 0.85,
        }).addTo(locationLayer)
      }
    } catch (err) {
      console.warn('Không thể vẽ vị trí người dùng trên bản đồ:', err)
    }
  }, [userLocation, showRoute, branches, routeCoordinates])

  useEffect(() => {
    const map = mapRef.current
    const markerLayer = markersRef.current
    if (!map || !markerLayer) return

    try {
      markerLayer.clearLayers()
      markersMapRef.current.clear()
      const bounds = L.latLngBounds([])

      if (showRoute && routeCoordinates && routeCoordinates.length > 0) {
        bounds.extend(L.latLngBounds(routeCoordinates))
      } else if (
        userLocation &&
        Number.isFinite(userLocation.latitude) &&
        Number.isFinite(userLocation.longitude)
      ) {
        const userLatLng = L.latLng(userLocation.latitude, userLocation.longitude)
        bounds.extend(userLatLng)
        if (userLocation.radiusKm) {
          const radiusMeters = Math.max(100, userLocation.radiusKm * 1000)
          const radiusBounds = userLatLng.toBounds(radiusMeters * 2)
          bounds.extend(radiusBounds)
        }
      }

      const branchList = Array.isArray(branches) ? branches : []
      branchList.forEach((branch) => {
        if (
          !branch?.location ||
          !Number.isFinite(branch.location.latitude) ||
          !Number.isFinite(branch.location.longitude)
        ) {
          return
        }
        const position = L.latLng(branch.location.latitude, branch.location.longitude)
        const isSelected = branch.id_branch === selectedId
        bounds.extend(position)

        const marker = L.marker(position, {
          title: branch.name,
          icon: L.divIcon({
            className: 'branch-map-marker-wrap',
            html: `<span class="branch-map-marker${isSelected ? ' selected' : ''}"><i></i></span>`,
            iconSize: isSelected ? [32, 38] : [26, 32],
            iconAnchor: isSelected ? [16, 36] : [13, 30],
            popupAnchor: [0, isSelected ? -40 : -34],
          }),
        })

        const popupHtml = `
          <div class="map-popup-card">
            ${branch.primary_image ? `<img src="${branch.primary_image.storage_key}" alt="" class="map-popup-img" />` : ''}
            <div class="map-popup-body">
              <span class="open-status ${branch.is_open_now ? 'is-open' : ''}"><i></i>${branch.is_open_now ? 'Đang mở cửa' : 'Đang đóng cửa'}</span>
              <strong>${branch.name}</strong>
              <p>${branch.full_address}</p>
              ${branch.phone ? `<small>📞 ${branch.phone}</small>` : ''}
              ${branch.distance_km !== null && branch.distance_km !== undefined ? `<small class="branch-distance">📍 Cách bạn ${branch.distance_km} km</small>` : ''}
              <a href="/chi-nhanh/${branch.id_branch}" class="map-popup-link">Chi tiết phòng khám →</a>
            </div>
          </div>
        `
        if (showBranchPopup) {
          marker.bindPopup(popupHtml, {
            className: 'custom-map-popup',
            maxWidth: 230,
            minWidth: 190,
            offset: [0, -12],
          })
        }

        marker.on('click', () => {
          onSelectRef.current(branch.id_branch)
        })

        marker.addTo(markerLayer)
        markersMapRef.current.set(branch.id_branch, marker)
      })

      const selected = branchList.find((branch) => branch.id_branch === selectedId)
      if (selected && branches.length === 1 && userLocation && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 })
        const selectedMarker = markersMapRef.current.get(selected.id_branch)
        if (showBranchPopup && selectedMarker && !selectedMarker.isPopupOpen()) {
          selectedMarker.openPopup()
        }
      } else if (
        selected &&
        selected.location &&
        Number.isFinite(selected.location.latitude) &&
        Number.isFinite(selected.location.longitude)
      ) {
        map.flyTo([selected.location.latitude, selected.location.longitude], 15, { duration: 0.7 })
        const selectedMarker = markersMapRef.current.get(selected.id_branch)
        if (showBranchPopup && selectedMarker && !selectedMarker.isPopupOpen()) {
          selectedMarker.openPopup()
        }
      } else if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 })
      }
    } catch (err) {
      console.warn('Lỗi khi vẽ marker bản đồ:', err)
    }
  }, [branches, selectedId, userLocation, showRoute, routeCoordinates, showBranchPopup])

  return <div ref={elementRef} className="branch-map-canvas" aria-label="Bản đồ các chi nhánh DentaVie" />
}
