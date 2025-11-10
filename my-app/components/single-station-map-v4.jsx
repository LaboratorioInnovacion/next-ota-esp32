"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { MapPin } from "lucide-react"

// Componente interno que maneja el mapa
function MapComponent({ station, containerId }) {
  const mapInstanceRef = useRef(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    const initMap = async () => {
      try {
        if (!station?.latitude || !station?.longitude || !isMounted) return

        console.log("[MapComponent] Starting initialization for:", station.id)
        
        // Dynamic import para asegurar que Leaflet se carga correctamente
        const L = (await import("leaflet")).default

        // Add CSS
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link")
          link.id = "leaflet-css"
          link.rel = "stylesheet"
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          document.head.appendChild(link)
        }

        // Buscar el contenedor por ID
        const container = document.getElementById(containerId)
        if (!container || !isMounted) {
          console.warn("[MapComponent] Container not found:", containerId)
          return
        }

        // Verificar que el contenedor esté vacío
        if (container.children.length > 0) {
          console.log("[MapComponent] Clearing container")
          container.innerHTML = ""
        }

        // Esperar un frame para que el DOM se actualice
        await new Promise(resolve => requestAnimationFrame(() => {
          requestAnimationFrame(resolve)
        }))

        if (!isMounted) return

        console.log("[MapComponent] Creating Leaflet map")
        const map = L.map(container, {
          center: [station.latitude, station.longitude],
          zoom: 15,
          zoomControl: true,
        })

        if (!isMounted) {
          map.remove()
          return
        }

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map)

        // Custom icon
        const customIcon = L.divIcon({
          className: "custom-marker",
          html: `
            <div class="flex flex-col items-center">
              <div class="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg ring-4 ring-primary/20">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
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
        
        marker.bindPopup(`
          <div class="p-2">
            <h3 class="font-semibold text-base mb-2">${station.name}</h3>
            <div class="space-y-1 text-sm">
              <p><strong>Temperatura:</strong> ${station.temperature?.toFixed(1)}°C</p>
              <p><strong>Humedad:</strong> ${station.humidity?.toFixed(1)}%</p>
              <p class="text-xs text-gray-500 mt-2">${station.mac}</p>
            </div>
          </div>
        `).openPopup()

        mapInstanceRef.current = map
        mountedRef.current = true
        
        console.log("[MapComponent] Map initialized successfully")

        // Invalidate size
        setTimeout(() => {
          if (isMounted && mapInstanceRef.current) {
            try {
              mapInstanceRef.current.invalidateSize()
            } catch (e) {
              console.warn("[MapComponent] Error invalidating size:", e)
            }
          }
        }, 100)

      } catch (error) {
        console.error("[MapComponent] Error initializing map:", error)
      }
    }

    // Delay para asegurar que el DOM esté listo
    const timeoutId = setTimeout(initMap, 100)

    return () => {
      isMounted = false
      clearTimeout(timeoutId)
      
      if (mapInstanceRef.current && mountedRef.current) {
        try {
          console.log("[MapComponent] Cleaning up map")
          mapInstanceRef.current.remove()
        } catch (error) {
          console.warn("[MapComponent] Cleanup error:", error)
        }
        mapInstanceRef.current = null
        mountedRef.current = false
      }
    }
  }, [station.id, containerId])

  return null // Este componente no renderiza nada, solo maneja el mapa
}

export function SingleStationMapV4({ station }) {
  const [containerId] = useState(() => 
    `map-container-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
  )
  
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

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
      <div id={containerId} className="h-[400px] w-full" />
      {isClient && (
        <MapComponent 
          key={`${station.id}-${containerId}`} 
          station={station} 
          containerId={containerId} 
        />
      )}
    </Card>
  )
}