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
    if (typeof window === "undefined") return

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

        if (!mapRef.current) {
          console.error("[v0] Map container ref is null")
          return
        }

        // Check if container is in DOM
        if (!document.contains(mapRef.current)) {
          console.error("[v0] Map container is not in DOM")
          return
        }

        // If there is an existing map instance, remove it first.
        // Avoid reading/writing Leaflet private properties like `_leaflet_id`.
        if (mapInstanceRef.current) {
          console.log("[v0] Existing map instance found, removing before init...")
          try {
            mapInstanceRef.current.remove()
          } catch (e) {
            console.error("[v0] Error removing previous map instance:", e)
          }
          mapInstanceRef.current = null
        }

        // Prevent double initialization
        if (isInitializedRef.current && mapInstanceRef.current) {
          console.log("[v0] Map already initialized, skipping...")
          return
        }

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

        console.log("[v0] Initializing new map instance...")
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

        // Wait for the map to be fully loaded before adding markers
        map.whenReady(() => {
          console.log("[v0] Map is ready, adding markers...")
          updateMarkers(L, map)
        })

        // Fallback timeout in case whenReady doesn't fire
        setTimeout(() => {
          if (map && L && mapRef.current && !markersRef.current.length) {
            console.log("[v0] Fallback: Calling updateMarkers via timeout")
            updateMarkers(L, map)
          }
        }, 500)
      } catch (error) {
        console.error("[v0] Error initializing map:", error)
      }
    }

    const updateMarkers = (L, map) => {
      // Verify map instance exists
      if (!map) {
        console.error("[v0] Map parameter is undefined in updateMarkers")
        return
      }

      // Verify Leaflet library exists
      if (!L) {
        console.error("[v0] Leaflet library is undefined in updateMarkers")
        return
      }

      console.log("[v0] Starting marker update with valid parameters")

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

          // Verify map parameter exists before adding marker
          if (!map) {
            console.error("[v0] Map parameter is undefined during marker creation")
            return
          }

          marker.addTo(map)
          
          marker.bindPopup(
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
              </div>
            `
          )

          marker.on("click", (e) => {
            try {
              e.originalEvent?.stopPropagation()
              e.originalEvent?.preventDefault()
            } catch (_) {}

            if (onStationClick) {
              onStationClick(station)
            } else {
              // Fallback: navigate to station detail page when no handler is provided
              try {
                router.push(`/station/${station.id}`)
              } catch (err) {
                console.error("[v0] Error navigating to station page:", err)
              }
            }
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
      console.log("[v0] Cleaning up map...")
      // Clear markers first
      markersRef.current.forEach((marker) => {
        try {
          marker.remove()
        } catch (e) {
          // Ignore errors during cleanup
        }
      })
      markersRef.current = []

      // Remove map instance
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove()
          mapInstanceRef.current = null
        } catch (e) {
          console.error("[v0] Error removing map:", e)
        }
      }

      // Clear container content (do not touch Leaflet private props)
      if (mapRef.current) {
        try {
          mapRef.current.innerHTML = ""
        } catch (e) {
          console.error("[v0] Error clearing container:", e)
        }
      }
      
      isInitializedRef.current = false
    }
  }, [stations]) // Include stations to reinitialize when they change

  useEffect(() => {
    if (!mapInstanceRef.current || !isInitializedRef.current) {
      console.log("[v0] Map not ready for marker updates, skipping...")
      return
    }

    // Add a small delay to ensure map is fully ready
    const timeoutId = setTimeout(() => {
      updateMarkersOnly()
    }, 100)

    const updateMarkersOnly = async () => {
      try {
        const L = (await import("leaflet")).default

        // Double check that map instance still exists
        if (!mapInstanceRef.current) {
          console.log("[v0] Map instance no longer exists during marker update")
          return
        }

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

            // Verify map instance still exists before adding marker
            if (!mapInstanceRef.current) {
              console.log("[v0] Map instance lost during marker creation")
              return
            }

            marker.addTo(mapInstanceRef.current)
            
            marker.bindPopup(
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
                </div>
              `
            )

            marker.on("click", (e) => {
              e.originalEvent?.stopPropagation()
              e.originalEvent?.preventDefault()
              
              if (onStationClick) {
                onStationClick(station)
              }
              // Removido router.push para evitar navegación
            })

            markersRef.current.push(marker)
          }
        })
      } catch (error) {
        console.error("[v0] Error updating markers:", error)
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
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
