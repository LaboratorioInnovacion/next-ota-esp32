"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { MapPin } from "lucide-react"

export function SingleStationMapFallback({ station }) {
  const [mapHtml, setMapHtml] = useState("")
  const { id, latitude, longitude } = station ?? {}

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMapHtml("")
      return
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 400px; width: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          const map = L.map('map').setView([${latitude}, ${longitude}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
          }).addTo(map);
          
          const customIcon = L.divIcon({
            className: 'custom-marker',
            html: \`
              <div style="
                width: 48px;
                height: 48px;
                background: #3b82f6;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <svg width="24" height="24" fill="none" stroke="white" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
              </div>
            \`,
            iconSize: [48, 48],
            iconAnchor: [24, 48]
          });
          
          L.marker([${latitude}, ${longitude}], { icon: customIcon }).addTo(map);
        </script>
      </body>
      </html>
    `

    setMapHtml(html)
  }, [id, latitude, longitude])

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
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
      <iframe
        srcDoc={mapHtml}
        className="h-[400px] w-full border-0"
        title={`Mapa de ${station.name}`}
        sandbox="allow-scripts allow-same-origin"
      />
    </Card>
  )
}
