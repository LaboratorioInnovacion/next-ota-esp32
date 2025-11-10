"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { ChartLine } from "lucide-react"

// Palette consistente y accesible
const COLORS = [
  "#7c3aed",
  "#0ea5a4", 
  "#f97316",
  "#06b6d4",
  "#ef4444",
  "#f59e0b",
]

function formatTimeLabel(ts) {
  try {
    const d = new Date(ts)
    return d.toLocaleString("es-ES", { 
      month: "short", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit",
      weekday: "short"
    })
  } catch (e) {
    return String(ts)
  }
}

export function AllStationsChart({ stations }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [readingsByStation, setReadingsByStation] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [lastFetchKey, setLastFetchKey] = useState("")
  
  // Forzar período a "week" para mostrar solo datos de una semana
  const period = "week"

  // Initialize selectedIds when stations are available
  useEffect(() => {
    if (stations && stations.length > 0) {
      setSelectedIds(new Set(stations.map((s) => s.id)))
    }
  }, [stations])

  // Create a stable key based on station IDs and period
  const fetchKey = useMemo(() => {
    if (!stations || stations.length === 0) return ""
    const stationIds = stations.map(s => s.id).sort().join(",")
    return `${stationIds}-${period}`
  }, [stations, period])

  const fetchAll = useCallback(async () => {
    if (!stations || stations.length === 0 || fetchKey === lastFetchKey) return
    
    console.log("[AllStationsChart] Fetching data for key:", fetchKey)
    setLoading(true)
    setError(null)
    setLastFetchKey(fetchKey)
    
    try {
      const results = {}
      await Promise.all(
        stations.map(async (s) => {
          try {
            const res = await fetch(`/api/readings?stationId=${s.id}&period=${period}`)
            const json = await res.json()
            if (json && json.success && Array.isArray(json.data)) {
              results[s.id] = json.data.map((r) => ({ ...r }))
            } else {
              results[s.id] = []
            }
          } catch (e) {
            console.error(`[AllStationsChart] Error fetching data for station ${s.id}:`, e)
            results[s.id] = []
          }
        })
      )

      setReadingsByStation(results)
    } catch (e) {
      console.error("[AllStationsChart] General fetch error:", e)
      setError("Error cargando lecturas")
    } finally {
      setLoading(false)
    }
  }, [stations, period, fetchKey, lastFetchKey])

  useEffect(() => {
    // Only fetch if we have a new key and haven't fetched it yet
    if (fetchKey && fetchKey !== lastFetchKey) {
      fetchAll()
    }
  }, [fetchKey, lastFetchKey, fetchAll])

  const seriesData = useMemo(() => {
    // Early return if no data available
    if (!readingsByStation || Object.keys(readingsByStation).length === 0) {
      return []
    }

    const allTimestamps = new Set()
    Object.values(readingsByStation).forEach((arr) => {
      if (Array.isArray(arr)) {
        arr.forEach((r) => {
          if (r && r.timestamp) {
            allTimestamps.add(r.timestamp)
          }
        })
      }
    })

    if (allTimestamps.size === 0) return []

    // Filtrar solo los últimos 5 días
    const now = new Date()
    const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000))
    
    const times = Array.from(allTimestamps)
      .filter(ts => {
        const date = new Date(ts)
        return date >= fiveDaysAgo
      })
      .sort((a, b) => new Date(a) - new Date(b))

    // Limitar el número de puntos para mejor rendimiento (máximo 50 puntos)
    const maxPoints = 50
    const step = Math.max(1, Math.floor(times.length / maxPoints))
    const filteredTimes = times.filter((_, index) => index % step === 0)

    return filteredTimes.map((ts) => {
      const point = { time: formatTimeLabel(ts), _ts: ts }
      Object.entries(readingsByStation).forEach(([stationId, arr]) => {
        if (Array.isArray(arr)) {
          const r = arr.find((x) => x && x.timestamp === ts)
          point[`t_${stationId}`] = r && r.temperature !== null ? r.temperature : null
          point[`h_${stationId}`] = r && r.humidity !== null ? r.humidity : null
        }
      })
      return point
    })
  }, [readingsByStation])

  const toggleStation = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set((stations || []).map((s) => s.id)))
  }, [stations])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const lines = useMemo(() => {
    return (stations || []).map((s, idx) => ({ 
      id: s.id, 
      name: s.name, 
      color: COLORS[idx % COLORS.length] 
    }))
  }, [stations])

  return (
    <Card>
      <CardHeader className="border-b border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChartLine className="h-5 w-5 text-primary" />
            <CardTitle>Series Temporales - Últimos 5 Días</CardTitle>
          </div>
          <div className="text-sm text-muted-foreground">{(stations || []).length} estaciones</div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-start gap-4">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-muted px-3 py-1 text-sm text-foreground" onClick={selectAll} type="button">
              Seleccionar todas
            </button>
            <button className="rounded-md bg-muted px-3 py-1 text-sm text-foreground" onClick={deselectAll} type="button">
              Deseleccionar todas
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-6">
          <div className="col-span-6 lg:col-span-5">
            <div className="h-[360px] w-full">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : error ? (
                <div className="text-center text-destructive">{String(error)}</div>
              ) : seriesData.length === 0 ? (
                <div className="text-center text-muted-foreground">No hay datos temporales disponibles</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart 
                    data={seriesData} 
                    margin={{ top: 10, right: 24, left: 4, bottom: 6 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 10 }} 
                      interval="preserveStartEnd"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tickFormatter={(value, index) => {
                        // Solo mostrar cada 5to tick para mejor legibilidad
                        return index % 5 === 0 ? value : ""
                      }}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip 
                      animationDuration={100}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null
                        return (
                          <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                            <p className="font-medium text-foreground mb-2">{label}</p>
                            {payload.map((entry, index) => (
                              <div key={index} className="flex items-center gap-2 text-sm">
                                <div 
                                  className="w-3 h-3 rounded" 
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span>{entry.name}: {entry.value?.toFixed(1)}°C</span>
                              </div>
                            ))}
                          </div>
                        )
                      }}
                    />
                    <Legend />
                    {lines.map((ln) =>
                      selectedIds.has(ln.id) ? (
                        <Line
                          key={ln.id}
                          type="monotone"
                          dataKey={`t_${ln.id}`}
                          name={ln.name}
                          stroke={ln.color}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                          connectNulls={false}
                        />
                      ) : null
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="col-span-6 lg:col-span-1">
            <div className="space-y-2 max-h-80 overflow-auto px-2">
              {(stations || []).map((s, idx) => {
                const isSelected = selectedIds.has(s.id)
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/40 cursor-pointer"
                    onClick={() => toggleStation(s.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Controlled by parent onClick
                      className="h-4 w-4 pointer-events-none"
                      tabIndex={-1}
                    />
                    <span className="flex-1 text-sm text-foreground select-none">{s.name}</span>
                    <span 
                      className="h-3 w-3 rounded shrink-0" 
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}