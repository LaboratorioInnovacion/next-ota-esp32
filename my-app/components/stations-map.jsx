"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin } from "lucide-react"

export function StationsMap({ stations, onStationClick }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const router = useRouter()
  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined" || isInitializedRef.current) return

    const loadMap = async () => {
      try {
        const L = (await import("leaflet")).default

        // Add Leaflet CSS
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link")
          link.id = "leaflet-css"
          link.rel = "stylesheet"
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          document.head.appendChild(link)
        }

        if (!mapRef.current) return

        // Calculate center from stations
        const validStations = stations.filter((s) => s.latitude && s.longitude)
        const centerLat =
          validStations.length > 0
            ? validStations.reduce((sum, s) => sum + s.latitude, 0) / validStations.length
            : -28.88
        const centerLon =
          validStations.length > 0
            ? validStations.reduce((sum, s) => sum + s.longitude, 0) / validStations.length
            : -65.77

        const map = L.map(mapRef.current, {
          center: [centerLat, centerLon],
          zoom: 12,
          zoomControl: true,
        })

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map)

        mapInstanceRef.current = map
        isInitializedRef.current = true

        setTimeout(() => {
          updateMarkers(L, map)
        }, 100)
      } catch (error) {
        console.error("[v0] Error initializing map:", error)
      }
    }

    const updateMarkers = (L, map) => {
      // Clear existing markers
      markersRef.current.forEach((marker) => {
        try {
          marker.remove()
        } catch (e) {
          console.error("[v0] Error removing marker:", e)
        }
      })
      markersRef.current = []

      // Add markers for each station
      stations.forEach((station) => {
        if (station.latitude && station.longitude) {
          const iconHtml = `
            <div style="
              background: ${station.status === "online" ? "oklch(0.65 0.24 264)" : "oklch(0.6 0 0)"};
              width: 32px;
              height: 32px;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
          `

          const icon = L.divIcon({
            html: iconHtml,
            className: "custom-marker",
            iconSize: [32, 32],
            iconAnchor: [16, 32],
          })

          const marker = L.marker([station.latitude, station.longitude], { icon })
            .addTo(map)
            .bindPopup(
              `
              <div style="font-family: system-ui; min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">${station.name}</h3>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">MAC: ${station.mac}</div>
                ${
                  station.temperature !== null
                    ? `
                  <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <div>
                      <div style="font-size: 11px; color: #666;">Temperatura</div>
                      <div style="font-weight: 600; color: oklch(0.65 0.24 264);">${station.temperature}°C</div>
                    </div>
                    <div>
                      <div style="font-size: 11px; color: #666;">Humedad</div>
                      <div style="font-weight: 600; color: oklch(0.55 0.2 200);">${station.humidity}%</div>
                    </div>
                  </div>
                `
                    : '<div style="font-size: 12px; color: #999;">Sin datos</div>'
                }
                <button 
                  onclick="window.location.href='/station/${station.id}'" 
                  style="
                    margin-top: 12px;
                    width: 100%;
                    padding: 6px 12px;
                    background: oklch(0.65 0.24 264);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                  "
                >
                  Ver Detalles
                </button>
              </div>
            `,
            )

          marker.on("click", () => {
            if (onStationClick) {
              onStationClick(station)
            }
            router.push(`/station/${station.id}`)
          })

          markersRef.current.push(marker)
        }
      })

      // Fit bounds to show all markers
      if (markersRef.current.length > 0) {
        const group = L.featureGroup(markersRef.current)
        map.fitBounds(group.getBounds().pad(0.1))
      }
    }

    loadMap()

    return () => {
      // Clear markers first
      markersRef.current.forEach((marker) => {
        try {
          marker.remove()
        } catch (e) {
          // Ignore errors during cleanup
        }
      })
      markersRef.current = []

      // Remove map instance with delay to allow animations to complete
      if (mapInstanceRef.current) {
        try {
          setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.remove()
              mapInstanceRef.current = null
            }
          }, 100)
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      isInitializedRef.current = false
    }
  }, []) // Empty dependency array to only initialize once

  useEffect(() => {
    if (!mapInstanceRef.current || !isInitializedRef.current) return

    const updateMarkersOnly = async () => {
      try {
        const L = (await import("leaflet")).default

        // Clear existing markers
        markersRef.current.forEach((marker) => {
          try {
            marker.remove()
          } catch (e) {
            // Ignore
          }
        })
        markersRef.current = []

        // Add new markers
        stations.forEach((station) => {
          if (station.latitude && station.longitude) {
            const iconHtml = `
              <div style="
                background: ${station.status === "online" ? "oklch(0.65 0.24 264)" : "oklch(0.6 0 0)"};
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
            `

            const icon = L.divIcon({
              html: iconHtml,
              className: "custom-marker",
              iconSize: [32, 32],
              iconAnchor: [16, 32],
            })

            const marker = L.marker([station.latitude, station.longitude], { icon })
              .addTo(mapInstanceRef.current)
              .bindPopup(
                `
                <div style="font-family: system-ui; min-width: 200px;">
                  <h3 style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">${station.name}</h3>
                  <div style="font-size: 12px; color: #666; margin-bottom: 8px;">MAC: ${station.mac}</div>
                  ${
                    station.temperature !== null
                      ? `
                    <div style="display: flex; gap: 12px; margin-top: 8px;">
                      <div>
                        <div style="font-size: 11px; color: #666;">Temperatura</div>
                        <div style="font-weight: 600; color: oklch(0.65 0.24 264);">${station.temperature}°C</div>
                      </div>
                      <div>
                        <div style="font-size: 11px; color: #666;">Humedad</div>
                        <div style="font-weight: 600; color: oklch(0.55 0.2 200);">${station.humidity}%</div>
                      </div>
                    </div>
                  `
                      : '<div style="font-size: 12px; color: #999;">Sin datos</div>'
                  }
                  <button 
                    onclick="window.location.href='/station/${station.id}'" 
                    style="
                      margin-top: 12px;
                      width: 100%;
                      padding: 6px 12px;
                      background: oklch(0.65 0.24 264);
                      color: white;
                      border: none;
                      border-radius: 6px;
                      font-size: 12px;
                      font-weight: 600;
                      cursor: pointer;
                    "
                  >
                    Ver Detalles
                  </button>
                </div>
              `,
              )

            marker.on("click", () => {
              if (onStationClick) {
                onStationClick(station)
              }
              router.push(`/station/${station.id}`)
            })

            markersRef.current.push(marker)
          }
        })
      } catch (error) {
        console.error("[v0] Error updating markers:", error)
      }
    }

    updateMarkersOnly()
  }, [stations, onStationClick, router])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <CardTitle>Mapa de Estaciones</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={mapRef} className="h-[400px] w-full" />
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Activa</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">Inactiva</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {stations.filter((s) => s.latitude && s.longitude).length} estaciones con ubicación
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
