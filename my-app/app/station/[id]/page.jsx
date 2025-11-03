"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SingleStationMap } from "@/components/single-station-map"
import { AdvancedChart } from "@/components/advanced-chart"
import { PeriodSelector } from "@/components/period-selector"
import { ArrowLeft, Thermometer, Droplets, Radio, Clock, MapPin, TrendingUp, TrendingDown, Zap } from "lucide-react"

export default function StationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [station, setStation] = useState(null)
  const [chartData, setChartData] = useState([])
  const [recentReadings, setRecentReadings] = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState("week")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStationData = async () => {
      try {
        // Obtener información de la estación
        const stationsResponse = await fetch("/api/stations")
        const stationsResult = await stationsResponse.json()

        if (stationsResult.success) {
          const foundStation = stationsResult.data.find((s) => s.id === Number.parseInt(params.id))
          if (foundStation) {
            setStation(foundStation)
          } else {
            router.push("/")
            return
          }
        }

        // Obtener lecturas históricas
        const readingsResponse = await fetch(`/api/readings?stationId=${params.id}&period=${selectedPeriod}`)
        const readingsResult = await readingsResponse.json()

        if (readingsResult.success) {
          const formatted = readingsResult.data.map((reading) => ({
            time: new Date(reading.timestamp).toLocaleDateString("es-ES", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            temperature: reading.temperature,
            humidity: reading.humidity,
            timestamp: reading.timestamp,
          }))
          setChartData(formatted)
          setRecentReadings(formatted.slice(-10).reverse())
        }
      } catch (error) {
        console.error("[v0] Error cargando datos de la estación:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStationData()
    const interval = setInterval(fetchStationData, 10000)
    return () => clearInterval(interval)
  }, [params.id, selectedPeriod, router])

  const getStatusColor = (status) => {
    switch (status) {
      case "online":
        return "bg-emerald-500"
      case "offline":
        return "bg-rose-500"
      default:
        return "bg-slate-400"
    }
  }

  const formatTime = (date) => {
    const dateObj = new Date(date)
    return dateObj.toLocaleString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const calculateTrend = (dataKey) => {
    if (chartData.length < 2) return 0
    const recent = chartData.slice(-5)
    const avg = recent.reduce((acc, r) => acc + r[dataKey], 0) / recent.length
    const previous = chartData.slice(-10, -5)
    if (previous.length === 0) return 0
    const prevAvg = previous.reduce((acc, r) => acc + r[dataKey], 0) / previous.length
    return ((avg - prevAvg) / prevAvg) * 100
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-400 border-t-transparent" />
          <p className="mt-4 text-slate-300">Cargando datos de la estación...</p>
        </div>
      </div>
    )
  }

  if (!station) {
    return null
  }

  const tempTrend = calculateTrend("temperature")
  const humidityTrend = calculateTrend("humidity")

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 bg-gradient-to-br from-purple-950/40 via-black to-cyan-950/40">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f12_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f12_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>

      <div className="relative z-10">
        <header className="border-b border-purple-500/20 bg-black/60 backdrop-blur-2xl shadow-2xl shadow-purple-500/10">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-purple-500/20 text-purple-300 hover:text-purple-100 border border-purple-500/30"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex flex-1 items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-cyan-600 shadow-2xl shadow-purple-500/50 animate-pulse">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-cyan-600 blur-xl opacity-50" />
                    <Radio className="relative h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
                      {station.name}
                    </h1>
                    <p className="text-sm text-purple-300 font-mono flex items-center gap-2 mt-1">
                      <MapPin className="h-3 w-3" />
                      {station.mac}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-purple-950/50 rounded-full px-6 py-3 border border-purple-500/50 shadow-lg shadow-purple-500/20">
                  <div
                    className={`h-3 w-3 rounded-full ${getStatusColor(station.status)} shadow-lg shadow-current animate-pulse`}
                  />
                  <span className="text-sm font-bold capitalize text-white">{station.status}</span>
                  <Zap className="h-4 w-4 text-yellow-400" />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-950/40 via-red-950/40 to-black backdrop-blur-sm shadow-2xl shadow-orange-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-red-500/10" />
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
              <div className="relative p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-500 to-red-600 shadow-2xl shadow-orange-500/50">
                      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-orange-500 to-red-600 blur-xl opacity-50 animate-pulse" />
                      <Thermometer className="relative h-10 w-10 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-orange-300 font-bold uppercase tracking-widest mb-2">Temperatura</p>
                      <p className="text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(249,115,22,0.5)]">
                        {station.temperature.toFixed(1)}
                        <span className="text-3xl text-orange-300">°C</span>
                      </p>
                    </div>
                  </div>
                  {tempTrend !== 0 && (
                    <div
                      className={`flex items-center gap-2 rounded-full px-4 py-2 border ${tempTrend > 0 ? "bg-orange-500/20 text-orange-200 border-orange-500/50" : "bg-blue-500/20 text-blue-200 border-blue-500/50"}`}
                    >
                      {tempTrend > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      <span className="text-lg font-black">{Math.abs(tempTrend).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="relative h-3 bg-black/50 rounded-full overflow-hidden border border-orange-500/30">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 via-red-500 to-red-600 rounded-full transition-all duration-500 shadow-[0_0_20px_rgba(249,115,22,0.8)]"
                    style={{ width: `${Math.min((station.temperature / 50) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-950/40 via-blue-950/40 to-black backdrop-blur-sm shadow-2xl shadow-cyan-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10" />
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl" />
              <div className="relative p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-2xl shadow-cyan-500/50">
                      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 blur-xl opacity-50 animate-pulse" />
                      <Droplets className="relative h-10 w-10 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-cyan-300 font-bold uppercase tracking-widest mb-2">Humedad</p>
                      <p className="text-7xl font-black text-white drop-shadow-[0_0_20px_rgba(6,182,212,0.5)]">
                        {station.humidity.toFixed(1)}
                        <span className="text-3xl text-cyan-300">%</span>
                      </p>
                    </div>
                  </div>
                  {humidityTrend !== 0 && (
                    <div
                      className={`flex items-center gap-2 rounded-full px-4 py-2 border ${humidityTrend > 0 ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/50" : "bg-amber-500/20 text-amber-200 border-amber-500/50"}`}
                    >
                      {humidityTrend > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      <span className="text-lg font-black">{Math.abs(humidityTrend).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="relative h-3 bg-black/50 rounded-full overflow-hidden border border-cyan-500/30">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 rounded-full transition-all duration-500 shadow-[0_0_20px_rgba(6,182,212,0.8)]"
                    style={{ width: `${station.humidity}%` }}
                  />
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3 mb-8">
            <div className="lg:col-span-2">
              <Card className="border border-purple-500/30 bg-black/40 backdrop-blur-sm overflow-hidden shadow-2xl shadow-purple-500/20">
                <SingleStationMap station={station} />
              </Card>
            </div>

            <Card className="border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-black to-black backdrop-blur-sm p-6 shadow-2xl shadow-purple-500/20">
              <div className="flex items-center gap-3 mb-6">
                <Clock className="h-6 w-6 text-purple-400" />
                <h3 className="text-lg font-bold text-white">Información</h3>
              </div>
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 shadow-lg shadow-purple-500/10">
                  <p className="text-xs text-purple-300 uppercase tracking-wide mb-1">Última Actualización</p>
                  <p className="text-sm font-semibold text-white">{formatTime(station.lastUpdate)}</p>
                </div>
                <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 shadow-lg shadow-purple-500/10">
                  <p className="text-xs text-purple-300 uppercase tracking-wide mb-1">Ubicación</p>
                  <p className="text-sm font-semibold text-white">
                    {station.lat?.toFixed(4)}, {station.lon?.toFixed(4)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 shadow-lg shadow-purple-500/10">
                  <p className="text-xs text-purple-300 uppercase tracking-wide mb-1">Lecturas Totales</p>
                  <p className="text-sm font-semibold text-white">{chartData.length} registros</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="mb-6">
            <PeriodSelector selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriod} />
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
              <div className="h-1.5 w-16 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-full shadow-lg shadow-purple-500/50" />
              Análisis Histórico
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <AdvancedChart
                data={chartData}
                title="Temperatura"
                dataKey="temperature"
                unit="°C"
                icon={Thermometer}
                color="rgb(249, 115, 22)"
              />
              <AdvancedChart
                data={chartData}
                title="Humedad"
                dataKey="humidity"
                unit="%"
                icon={Droplets}
                color="rgb(6, 182, 212)"
              />
            </div>
          </div>

          <div>
            <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
              <div className="h-1.5 w-16 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-full shadow-lg shadow-purple-500/50" />
              Lecturas Recientes
            </h2>
            <Card className="border border-purple-500/30 bg-black/40 backdrop-blur-sm overflow-hidden shadow-2xl shadow-purple-500/20">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-purple-950/50 border-b border-purple-500/30">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">
                        Fecha y Hora
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">
                        Temperatura
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-purple-300 uppercase tracking-wider">
                        Humedad
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-500/20">
                    {recentReadings.map((reading, index) => (
                      <tr key={index} className="hover:bg-purple-950/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-200">
                          {formatTime(reading.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Thermometer className="h-4 w-4 text-orange-400" />
                            <span className="text-sm font-semibold text-white">{reading.temperature.toFixed(1)}°C</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Droplets className="h-4 w-4 text-cyan-400" />
                            <span className="text-sm font-semibold text-white">{reading.humidity.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
