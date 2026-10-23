"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin } from "lucide-react"

const hasLocation = (station) => Number.isFinite(station.latitude) && Number.isFinite(station.longitude)

export function StationsMap({ stations, onStationClick }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const markers = useRef(new Map())
  const fitted = useRef(false)
  const click = useRef(onStationClick)
  const [ready, setReady] = useState(null)
  const router = useRouter()

  useEffect(() => { click.current = onStationClick }, [onStationClick])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const L = (await import("leaflet")).default
        if (cancelled || !container.current) return
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link")
          link.id = "leaflet-css"
          link.rel = "stylesheet"
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          document.head.appendChild(link)
        }
        const map = L.map(container.current, { center: [-28.88, -65.77], zoom: 12 })
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
        }).addTo(map)
        mapRef.current = map
        setReady({ L, map })
      } catch (error) {
        console.error("Error initializing station map:", error)
      }
    }
    void load()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markers.current.clear()
      fitted.current = false
    }
  }, [])

  useEffect(() => {
    if (!ready || ready.map !== mapRef.current) return
    const { L, map } = ready
    const located = stations.filter(hasLocation)
    const ids = new Set(located.map((station) => station.id))
    for (const [id, entry] of markers.current) {
      if (!ids.has(id)) {
        entry.marker.remove()
        markers.current.delete(id)
      }
    }
    for (const station of located) {
      let entry = markers.current.get(station.id)
      if (!entry) {
        const marker = L.marker([station.latitude, station.longitude])
        entry = { marker, station: null }
        marker.on("click", () => {
          if (click.current) click.current(entry.station)
          else router.push(`/station/${entry.station.id}`)
        })
        markers.current.set(station.id, entry)
      }
      if (entry.station === station) continue
      entry.station = station
      entry.marker.setLatLng([station.latitude, station.longitude])
      entry.marker.setIcon(L.divIcon({
        className: "custom-marker", iconSize: [32, 32], iconAnchor: [16, 32],
        html: `<div style="width:32px;height:32px;border:3px solid white;border-radius:50%;background:${station.status === "online" ? "#3b82f6" : "#737373"};box-shadow:0 2px 8px #0005"></div>`,
      }))
      const popup = document.createElement("div")
      const title = document.createElement("strong")
      title.textContent = station.name
      const values = document.createElement("p")
      values.textContent = `Temperatura: ${station.temperature ?? "--"} °C · Humedad: ${station.humidity ?? "--"} % · MAC: ${station.mac}`
      popup.append(title, values)
      entry.marker.bindPopup(popup).addTo(map)
    }
    // Fit only once. Subsequent readings must preserve the user's viewport.
    if (!fitted.current && located.length) {
      map.fitBounds(L.latLngBounds(located.map((station) => [station.latitude, station.longitude])).pad(0.1), { maxZoom: 15 })
      fitted.current = true
    }
  }, [stations, ready, router])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <CardTitle>Mapa de Estaciones</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={container} className="h-[400px] w-full" />
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-primary" />Activa</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-muted-foreground" />Inactiva</span>
          </div>
          <span>{stations.filter(hasLocation).length} estaciones con ubicación</span>
        </div>
      </CardContent>
    </Card>
  )
}
