"use client"

import { useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { MapPin } from "lucide-react"

export function SingleStationMap({ station }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const isInitializingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined" || !station?.latitude || !station?.longitude) return

    // Prevenir múltiples inicializaciones simultáneas
    if (isInitializingRef.current) {
      console.log("[SingleStationMap] Already initializing, skipping...")
      return
    }

    const initMap = async () => {
      try {
        isInitializingRef.current = true
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
          console.error("[SingleStationMap] Map container ref is null")
          return
        }

        // Verificar si ya tenemos una instancia de mapa guardada y limpiarla
        if (mapInstanceRef.current) {
          console.log("[SingleStationMap] Removing previous map instance...")
          try {
            mapInstanceRef.current.remove()
          } catch (e) {
            console.error("[SingleStationMap] Error removing previous map:", e)
          }
          mapInstanceRef.current = null
        }

        // Limpiar completamente el contenedor HTML para evitar conflictos
        const mapContainer = document.getElementById(`map-${station.id}`)
        if (mapContainer) {
          mapContainer.innerHTML = ""
        }
        
        if (mapRef.current) {
          mapRef.current.innerHTML = ""
        }

        // Pequeña pausa para asegurar que el DOM se actualice
        await new Promise(resolve => setTimeout(resolve, 50))

        console.log("[SingleStationMap] Initializing map for station:", station.id)
        const map = L.map(mapRef.current, {
          center: [station.latitude, station.longitude],
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
        const marker = L.marker([station.latitude, station.longitude], { icon: customIcon }).addTo(map)

        // Popup with information
        marker
          .bindPopup(`
          <div class="p-2">
            <h3 class="font-semibold text-base mb-2">${station.name}</h3>
            <div class="space-y-1 text-sm">
              <p><strong>Temperatura:</strong> ${station.temperature != null ? station.temperature.toFixed(1) : "--"}°C</p>
              <p><strong>Humedad:</strong> ${station.humidity != null ? station.humidity.toFixed(1) : "--"}%</p>
              <p class="text-xs text-gray-500 mt-2">${station.mac}</p>
            </div>
          </div>
        `)
          .openPopup()

        mapInstanceRef.current = map

        setTimeout(() => {
          try {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize()
            }
          } catch (e) {
            console.error("[SingleStationMap] Error invalidating size:", e)
          }
        }, 100)
      } catch (error) {
        console.error("[SingleStationMap] Error initializing single station map:", error)
      } finally {
        isInitializingRef.current = false
      }
    }

    initMap()

    return () => {
      console.log("[SingleStationMap] Cleanup called for station:", station?.id)
      isInitializingRef.current = false
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove()
        } catch (e) {
          console.error("[SingleStationMap] Error during cleanup:", e)
        }
        mapInstanceRef.current = null
      }
    }
  }, []) // Empty dependency array since we're using key for remounting

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
          Coordenadas: {station.latitude != null && station.longitude != null 
            ? `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`
            : "No disponible"}
        </p>
      </div>
      <div ref={mapRef} id={`map-${station.id}`} className="h-[400px] w-full" />
    </Card>
  )
}
