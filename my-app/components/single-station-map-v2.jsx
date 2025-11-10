"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { MapPin } from "lucide-react"

export function SingleStationMapV2({ station }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [mapId] = useState(() => `map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)

  useEffect(() => {
    if (typeof window === "undefined" || !station?.latitude || !station?.longitude) return

    const initMap = async () => {
      try {
        console.log("[SingleStationMapV2] Starting map initialization for station:", station.id)
        
        // Cleanup any existing map first
        if (mapInstanceRef.current) {
          console.log("[SingleStationMapV2] Removing existing map instance")
          try {
            mapInstanceRef.current.remove()
          } catch (e) {
            console.warn("[SingleStationMapV2] Error removing previous map:", e)
          }
          mapInstanceRef.current = null
        }

        const L = (await import("leaflet")).default

        // Add Leaflet CSS if not already added
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link")
          link.id = "leaflet-css"
          link.rel = "stylesheet"
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          document.head.appendChild(link)
        }

        if (!mapRef.current) {
          console.error("[SingleStationMapV2] Map container ref is null")
          return
        }

        // Clear container completely and wait longer
        if (mapRef.current) {
          mapRef.current.innerHTML = ""
          // Remove any Leaflet-specific attributes that might remain
          mapRef.current.removeAttribute('data-leaflet-map')
          mapRef.current.classList.remove('leaflet-container')
        }
        
        // Wait longer for DOM cleanup and any pending operations
        await new Promise(resolve => setTimeout(resolve, 200))

        console.log("[SingleStationMapV2] Creating map instance for:", station.id)
        
        // Try-catch around map creation with retry logic
        let map
        let retryCount = 0
        const maxRetries = 3
        
        while (retryCount < maxRetries) {
          try {
            map = L.map(mapRef.current, {
              center: [station.latitude, station.longitude],
              zoom: 15,
              zoomControl: true,
            })
            console.log("[SingleStationMapV2] Map created successfully on attempt", retryCount + 1)
            break
          } catch (error) {
            retryCount++
            console.warn(`[SingleStationMapV2] Map creation attempt ${retryCount} failed:`, error.message)
            
            if (retryCount < maxRetries) {
              // Clear container more aggressively and wait
              if (mapRef.current) {
                mapRef.current.innerHTML = ""
                const newDiv = document.createElement('div')
                newDiv.className = 'h-[400px] w-full'
                mapRef.current.parentNode.replaceChild(newDiv, mapRef.current)
                mapRef.current = newDiv
              }
              await new Promise(resolve => setTimeout(resolve, 300))
            } else {
              throw error
            }
          }
        }

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map)

        // Create custom icon
        const customIcon = L.divIcon({
          className: "custom-marker",
          html: `
            <div class="flex flex-col items-center">
              <div class="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg ring-4 ring-primary/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 16v2"/>
                  <path d="M19 16v2"/>
                  <path d="M3 12h18"/>
                  <path d="M5 8v4"/>
                  <path d="M19 8v4"/>
                  <path d="M9 8v8"/>
                  <path d="M15 8v8"/>
                </svg>
              </div>
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 48],
        })

        // Add marker
        const marker = L.marker([station.latitude, station.longitude], { icon: customIcon }).addTo(map)

        // Popup with information
        marker
          .bindPopup(`
          <div class="p-2">
            <h3 class="font-semibold text-base mb-2">${station.name}</h3>
            <div class="space-y-1 text-sm">
              <p><strong>Temperatura:</strong> ${station.temperature?.toFixed(1)}°C</p>
              <p><strong>Humedad:</strong> ${station.humidity?.toFixed(1)}%</p>
              <p class="text-xs text-gray-500 mt-2">${station.mac}</p>
            </div>
          </div>
        `)
          .openPopup()

        mapInstanceRef.current = map
        console.log("[SingleStationMapV2] Map initialized successfully for station:", station.id)

        // Invalidate size after a short delay to ensure proper rendering
        setTimeout(() => {
          try {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize()
            }
          } catch (e) {
            console.warn("[SingleStationMapV2] Error invalidating size:", e)
          }
        }, 100)

      } catch (error) {
        console.error("[SingleStationMapV2] Error initializing map:", error)
      }
    }

    // Initialize map
    initMap()

    // Cleanup function
    return () => {
      console.log("[SingleStationMapV2] Cleanup called for station:", station?.id)
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove()
        } catch (e) {
          console.warn("[SingleStationMapV2] Error during cleanup:", e)
        }
        mapInstanceRef.current = null
      }
    }
  }, [station.id, station.latitude, station.longitude]) // Re-initialize when station changes

  if (!station?.latitude || !station?.longitude) {
    return (
      <Card className="flex h-[400px] items-center justify-center bg-card">
        <div className="text-center text-muted-foreground">
          <MapPin className="mx-auto mb-2 h-12 w-12 opacity-50" />
          <p>Ubicación no disponible</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-border bg-card p-0">
      <div className="border-b border-border bg-secondary/50 px-4 py-3">
        <h3 className="font-semibold text-card-foreground">Ubicación de la Estación</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Coordenadas: {station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}
        </p>
      </div>
      <div ref={mapRef} id={mapId} className="h-[400px] w-full" />
    </Card>
  )
}