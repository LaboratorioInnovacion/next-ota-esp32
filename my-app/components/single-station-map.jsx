"use client"

import { useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { MapPin } from "lucide-react"

export function SingleStationMap({ station }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined" || !station?.lat || !station?.lon || isInitializedRef.current) return

    const initMap = async () => {
      try {
        const L = (await import("leaflet")).default

        // Add Leaflet CSS if not already added
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link")
          link.id = "leaflet-css"
          link.rel = "stylesheet"
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          document.head.appendChild(link)
        }

        if (!mapRef.current) return

        const map = L.map(mapRef.current, {
          center: [station.lat, station.lon],
          zoom: 15,
          zoomControl: true,
        })

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
        const marker = L.marker([station.lat, station.lon], { icon: customIcon }).addTo(map)

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
        isInitializedRef.current = true

        setTimeout(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize()
          }
        }, 100)
      } catch (error) {
        console.error("[v0] Error initializing single station map:", error)
      }
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        try {
          setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.remove()
              mapInstanceRef.current = null
            }
          }, 100)
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      isInitializedRef.current = false
    }
  }, []) // Empty dependency array to only initialize once

  if (!station?.lat || !station?.lon) {
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
          Coordenadas: {station.lat.toFixed(4)}, {station.lon.toFixed(4)}
        </p>
      </div>
      <div ref={mapRef} className="h-[400px] w-full" />
    </Card>
  )
}
