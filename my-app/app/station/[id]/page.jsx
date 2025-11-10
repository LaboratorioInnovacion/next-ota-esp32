"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SingleStationMapFallback as SingleStationMapV4 } from "@/components/single-station-map-fallback"
import { AdvancedChart } from "@/components/advanced-chart"
import { UnifiedChart } from "@/components/unified-chart"
import { PeriodSelector } from "@/components/period-selector"
import { 
  ArrowLeft, 
  Thermometer, 
  Droplets, 
  Radio, 
  Clock, 
  MapPin, 
  TrendingUp, 
  TrendingDown, 
  Zap,
  Activity,
  AlertTriangle,
  BarChart3,
  Download,
  Calendar,
  Gauge,
  CheckCircle,
  XCircle,
  RefreshCw,
  Minus,
  BarChart,
  ArrowUp,
  Eye,
  EyeOff
} from "lucide-react"

export default function StationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [station, setStation] = useState(null)
  const [chartData, setChartData] = useState([])
  const [recentReadings, setRecentReadings] = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState("week")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showUnifiedChart, setShowUnifiedChart] = useState(false)

  // Función optimizada para obtener datos
  const fetchStationData = useCallback(async () => {
    try {
      setRefreshing(true)
      // Obtener información de la estación
      const stationsResponse = await fetch("/api/stations")
      const stationsResult = await stationsResponse.json()

      if (stationsResult.success) {
        const foundStation = stationsResult.data.find((s) => s.id === params.id)
        if (foundStation) {
          setStation(foundStation)
        } else {
          console.error("[v0] Station not found with ID:", params.id)
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
      setRefreshing(false)
    }
  }, [params.id, selectedPeriod, router])

  // Manejar cambio de período
  const handlePeriodChange = useCallback((period) => {
    setSelectedPeriod(period)
  }, [])

  // Función para exportar datos
  const exportData = useCallback(() => {
    if (!station || !chartData.length) return

    const csvData = [
      ["Fecha", "Temperatura (°C)", "Humedad (%)"],
      ...chartData.map(reading => [
        new Date(reading.timestamp).toISOString(),
        reading.temperature,
        reading.humidity
      ])
    ]

    const csvContent = csvData.map(row => row.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement("a")
    link.href = url
    link.download = `${station.name}_${selectedPeriod}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    
    URL.revokeObjectURL(url)
  }, [station, chartData, selectedPeriod])

  useEffect(() => {
    fetchStationData()
    const interval = setInterval(fetchStationData, 30000) // Actualizar cada 30 segundos
    return () => clearInterval(interval)
  }, [fetchStationData])

  // Cálculos estadísticos memoizados
  const stats = useMemo(() => {
    if (!chartData.length) return null

    const validReadings = chartData.filter(r => 
      r.temperature !== null && 
      r.humidity !== null &&
      r.temperature !== undefined && 
      r.humidity !== undefined
    )

    if (validReadings.length === 0) return null

    const temperatures = validReadings.map(r => r.temperature)
    const humidities = validReadings.map(r => r.humidity)

    // Calcular estadísticas
    const tempStats = {
      avg: temperatures.reduce((a, b) => a + b, 0) / temperatures.length,
      max: Math.max(...temperatures),
      min: Math.min(...temperatures),
      std: Math.sqrt(temperatures.reduce((acc, temp) => acc + Math.pow(temp - temperatures.reduce((a, b) => a + b, 0) / temperatures.length, 2), 0) / temperatures.length)
    }

    const humStats = {
      avg: humidities.reduce((a, b) => a + b, 0) / humidities.length,
      max: Math.max(...humidities),
      min: Math.min(...humidities),
      std: Math.sqrt(humidities.reduce((acc, hum) => acc + Math.pow(hum - humidities.reduce((a, b) => a + b, 0) / humidities.length, 2), 0) / humidities.length)
    }

    // Análisis de tendencias
    const recentTemp = temperatures.slice(-10)
    const recentHum = humidities.slice(-10)
    const oldTemp = temperatures.slice(0, 10)
    const oldHum = humidities.slice(0, 10)

    const tempTrend = recentTemp.length > 0 && oldTemp.length > 0 
      ? ((recentTemp.reduce((a, b) => a + b, 0) / recentTemp.length) - (oldTemp.reduce((a, b) => a + b, 0) / oldTemp.length))
      : 0

    const humTrend = recentHum.length > 0 && oldHum.length > 0
      ? ((recentHum.reduce((a, b) => a + b, 0) / recentHum.length) - (oldHum.reduce((a, b) => a + b, 0) / oldHum.length))
      : 0

    // Alertas
    const alerts = []
    if (tempStats.avg > 35) alerts.push({ type: "warning", message: "Temperatura promedio alta" })
    if (tempStats.avg < 5) alerts.push({ type: "warning", message: "Temperatura promedio baja" })
    if (humStats.avg > 85) alerts.push({ type: "warning", message: "Humedad promedio alta" })
    if (humStats.avg < 20) alerts.push({ type: "warning", message: "Humedad promedio baja" })

    return {
      temperature: { ...tempStats, trend: tempTrend },
      humidity: { ...humStats, trend: humTrend },
      totalReadings: validReadings.length,
      alerts
    }
  }, [chartData])

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">Cargando datos de la estación...</p>
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
    <div className="min-h-screen bg-background">
      {/* Panel de controles específico de la estación */}
      <div className="border-b border-border bg-card/50">
        <div className="container mx-auto px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
              <div className="relative shrink-0">
                <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg md:rounded-xl bg-primary shadow-lg shadow-primary/25">
                  <Radio className="h-5 w-5 md:h-6 md:w-6 text-primary-foreground" />
                </div>
                <div className="absolute -top-1 -right-1 h-2.5 w-2.5 md:h-3 md:w-3 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50" />
              </div>
              
              <div className="min-w-0 flex-1">
                <h1 className="text-lg md:text-2xl font-bold text-foreground mb-0.5 md:mb-1 truncate">
                  {station.name}
                </h1>
                <p className="text-xs md:text-sm text-muted-foreground font-mono flex items-center gap-1.5 md:gap-2">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{station.mac}</span>
                </p>
              </div>
            </div>

            {/* Controles específicos de la estación - Responsivos */}
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchStationData}
                disabled={refreshing}
                className="h-8 md:h-9 px-2 md:px-3"
              >
                <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${refreshing ? 'animate-spin' : ''} ${refreshing ? '' : 'md:mr-2'}`} />
                <span className="hidden md:inline">Actualizar</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={exportData}
                disabled={!chartData.length}
                className="h-8 md:h-9 px-2 md:px-3"
              >
                <Download className="h-3 w-3 md:h-4 md:w-4 md:mr-2" />
                <span className="hidden md:inline">Exportar</span>
              </Button>

              <Button
                variant={showUnifiedChart ? "default" : "outline"}
                size="sm"
                onClick={() => setShowUnifiedChart(!showUnifiedChart)}
                className="h-8 md:h-9 px-2 md:px-3"
              >
                {showUnifiedChart ? <EyeOff className="h-3 w-3 md:h-4 md:w-4 md:mr-2" /> : <Eye className="h-3 w-3 md:h-4 md:w-4 md:mr-2" />}
                <span className="hidden md:inline">{showUnifiedChart ? "Separar" : "Unificar"}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-3 md:px-6 py-4 md:py-8">
        {/* Métricas principales con colores consistentes - Apiladas en mobile */}
        <div className="mb-6 md:mb-10 grid gap-4 md:gap-8 md:grid-cols-2">
          {/* Tarjeta de Temperatura */}
          <Card className="group relative overflow-hidden border shadow-sm hover:shadow-lg transition-all duration-300">
            <div className="p-4 md:p-8">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <div className="flex items-center gap-3 md:gap-6 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <div className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-xl md:rounded-2xl bg-primary shadow-lg shadow-primary/30 transition-all duration-300 group-hover:scale-110">
                      <Thermometer className="h-6 w-6 md:h-8 md:w-8 text-primary-foreground" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 md:h-5 md:w-5 bg-background rounded-full flex items-center justify-center border-2 border-primary">
                      <div className="h-1.5 w-1.5 md:h-2 md:w-2 bg-primary rounded-full animate-pulse" />
                    </div>
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 md:mb-2">
                      Temperatura
                    </p>
                    <div className="flex items-baseline gap-1 md:gap-2">
                      <span className="text-3xl md:text-5xl font-black text-foreground tracking-tight">
                        {station.temperature.toFixed(1)}
                      </span>
                      <span className="text-lg md:text-2xl font-bold text-muted-foreground">°C</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 hidden md:block">
                      Actualizado hace {formatTime(station.lastUpdate).includes('Hace') ? formatTime(station.lastUpdate).split(' ')[1] : '1m'}
                    </p>
                  </div>
                </div>
                
                {tempTrend !== 0 && (
                  <div className={`flex items-center gap-1.5 md:gap-2 rounded-lg md:rounded-xl px-2 md:px-4 py-2 md:py-3 border transition-all duration-300 shrink-0 ${
                    tempTrend > 0 
                      ? "bg-destructive/10 text-destructive border-destructive/20" 
                      : "bg-primary/10 text-primary border-primary/20"
                  }`}>
                    {tempTrend > 0 ? (
                      <TrendingUp className="h-4 w-4 md:h-5 md:w-5" />
                    ) : (
                      <TrendingDown className="h-4 w-4 md:h-5 md:w-5" />
                    )}
                    <div className="text-center md:text-right">
                      <p className="text-sm md:text-lg font-bold">{Math.abs(tempTrend).toFixed(1)}%</p>
                      <p className="text-xs opacity-70 hidden md:block">vs anterior</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Barra de progreso */}
              <div className="relative">
                <div className="h-2 md:h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min((station.temperature / 50) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 md:mt-2 text-xs text-muted-foreground">
                  <span>0°C</span>
                  <span>50°C</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Tarjeta de Humedad */}
          <Card className="group relative overflow-hidden border shadow-sm hover:shadow-lg transition-all duration-300">
            <div className="p-4 md:p-8">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <div className="flex items-center gap-3 md:gap-6 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <div className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-xl md:rounded-2xl bg-accent shadow-lg shadow-accent/30 transition-all duration-300 group-hover:scale-110">
                      <Droplets className="h-6 w-6 md:h-8 md:w-8 text-accent-foreground" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 md:h-5 md:w-5 bg-background rounded-full flex items-center justify-center border-2 border-accent">
                      <div className="h-1.5 w-1.5 md:h-2 md:w-2 bg-accent rounded-full animate-pulse" />
                    </div>
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 md:mb-2">
                      Humedad
                    </p>
                    <div className="flex items-baseline gap-1 md:gap-2">
                      <span className="text-3xl md:text-5xl font-black text-foreground tracking-tight">
                        {station.humidity.toFixed(1)}
                      </span>
                      <span className="text-lg md:text-2xl font-bold text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 hidden md:block">
                      Actualizado hace {formatTime(station.lastUpdate).includes('Hace') ? formatTime(station.lastUpdate).split(' ')[1] : '1m'}
                    </p>
                  </div>
                </div>
                
                {humidityTrend !== 0 && (
                  <div className={`flex items-center gap-1.5 md:gap-2 rounded-lg md:rounded-xl px-2 md:px-4 py-2 md:py-3 border transition-all duration-300 shrink-0 ${
                    humidityTrend > 0 
                      ? "bg-accent/10 text-accent border-accent/20" 
                      : "bg-muted border-border"
                  }`}>
                    {humidityTrend > 0 ? (
                      <TrendingUp className="h-4 w-4 md:h-5 md:w-5" />
                    ) : (
                      <TrendingDown className="h-4 w-4 md:h-5 md:w-5" />
                    )}
                    <div className="text-center md:text-right">
                      <p className="text-sm md:text-lg font-bold">{Math.abs(humidityTrend).toFixed(1)}%</p>
                      <p className="text-xs opacity-70 hidden md:block">vs anterior</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Barra de progreso */}
              <div className="relative">
                <div className="h-2 md:h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${station.humidity}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 md:mt-2 text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </Card>
        </div>          {/* Alertas y estadísticas rápidas */}
          {stats && (
            <div className="mb-6 md:mb-8 space-y-4 md:space-y-6">
              {/* Alertas */}
              {stats.alerts.length > 0 && (
                <div className="grid gap-2 md:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {stats.alerts.map((alert, index) => (
                    <Card key={index} className="border border-amber-500/30 bg-amber-950/20 backdrop-blur-sm p-3 md:p-4">
                      <div className="flex items-center gap-2 md:gap-3">
                        <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-amber-400 shrink-0" />
                        <p className="text-amber-200 text-xs md:text-sm font-medium">{alert.message}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Estadísticas avanzadas - Grid responsivo */}
              <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
                <Card className="border border-purple-500/30 bg-purple-950/20 backdrop-blur-sm p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-purple-300 uppercase tracking-wide mb-1">Lecturas</p>
                      <p className="text-lg md:text-2xl font-bold text-white">{stats.totalReadings}</p>
                    </div>
                    <Activity className="h-6 w-6 md:h-8 md:w-8 text-purple-400" />
                  </div>
                </Card>

                <Card className="border border-orange-500/30 bg-orange-950/20 backdrop-blur-sm p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-orange-300 uppercase tracking-wide mb-1">Rango T.</p>
                      <p className="text-sm md:text-lg font-bold text-white">
                        {(stats.temperature.max - stats.temperature.min).toFixed(1)}°C
                      </p>
                    </div>
                    <Gauge className="h-6 w-6 md:h-8 md:w-8 text-orange-400" />
                  </div>
                </Card>

                <Card className="border border-cyan-500/30 bg-cyan-950/20 backdrop-blur-sm p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-cyan-300 uppercase tracking-wide mb-1">Rango H.</p>
                      <p className="text-sm md:text-lg font-bold text-white">
                        {(stats.humidity.max - stats.humidity.min).toFixed(1)}%
                      </p>
                    </div>
                    <Gauge className="h-6 w-6 md:h-8 md:w-8 text-cyan-400" />
                  </div>
                </Card>

                <Card className="border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-sm p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-emerald-300 uppercase tracking-wide mb-1">Estado</p>
                      <p className="text-sm md:text-lg font-bold text-white flex items-center gap-1.5 md:gap-2">
                        {station.status === "online" ? (
                          <>
                            <CheckCircle className="h-3 w-3 md:h-4 md:w-4 text-emerald-400" />
                            <span className="hidden sm:inline">Activo</span>
                            <span className="sm:hidden">On</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 md:h-4 md:w-4 text-red-400" />
                            <span className="hidden sm:inline">Inactivo</span>
                            <span className="sm:hidden">Off</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Mapa e información - Layout vertical en mobile */}
          <div className="grid gap-6 md:gap-8 lg:grid-cols-3 mb-6 md:mb-10">
            <div className="lg:col-span-2 order-2 lg:order-1">
              <Card className="relative overflow-hidden border shadow-sm">
                <div className="relative">
                  <SingleStationMapV4 station={station} />
                </div>
              </Card>
            </div>

            <Card className="relative overflow-hidden border shadow-sm order-1 lg:order-2">
              <div className="p-4 md:p-8">
                <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-8">
                  <div className="flex h-10 w-10 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl bg-primary shadow-lg shadow-primary/30">
                    <MapPin className="h-5 w-5 md:h-7 md:w-7 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-bold text-foreground">
                      Información
                    </h3>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      Detalles técnicos
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4 md:space-y-6">
                  <div className="bg-muted/50 p-3 md:p-6 rounded-lg md:rounded-xl border transition-all duration-300 hover:bg-muted">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                      <Clock className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Última Actualización
                      </p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-foreground">
                      {formatTime(station.lastUpdate)}
                    </p>
                  </div>
                  
                  <div className="bg-muted/50 p-3 md:p-6 rounded-lg md:rounded-xl border transition-all duration-300 hover:bg-muted">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                      <MapPin className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Coordenadas GPS
                      </p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-foreground">
                      {station.latitude?.toFixed(4)}, {station.longitude?.toFixed(4)}
                    </p>
                  </div>
                  
                  <div className="bg-muted/50 p-3 md:p-6 rounded-lg md:rounded-xl border transition-all duration-300 hover:bg-muted">
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                      <BarChart className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Total de Lecturas
                      </p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-foreground">
                      {chartData.length.toLocaleString()} registros
                    </p>
                  </div>

                  <div className="bg-primary/10 p-3 md:p-6 rounded-lg md:rounded-xl border border-primary/20">
                    <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3">
                      {station.status === "online" ? (
                        <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      ) : (
                        <XCircle className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
                      )}
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Estado del Sistema
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 md:h-3 md:w-3 rounded-full ${station.status === "online" ? "bg-primary animate-pulse" : "bg-destructive"}`} />
                      <p className={`text-sm md:text-lg font-bold ${station.status === "online" ? "text-primary" : "text-destructive"}`}>
                        {station.status === "online" ? "En Línea" : "Desconectado"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="mb-4 md:mb-6">
            <PeriodSelector selectedPeriod={selectedPeriod} onSelectPeriod={handlePeriodChange} />
          </div>

          <div className="mb-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Análisis Histórico
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Gráficos interactivos de las condiciones del {selectedPeriod === "week" ? "período semanal" : "período mensual"}
              </p>
            </div>
            
            {showUnifiedChart ? (
              <UnifiedChart 
                data={chartData}
                title={`Histórico de ${station.name}`}
              />
            ) : (
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
            )}
          </div>

          <div className="mb-10">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Lecturas Recientes
              </h2>
              <p className="text-muted-foreground">
                Últimas mediciones registradas por la estación meteorológica
              </p>
            </div>
            <Card className="relative overflow-hidden border shadow-sm">
              <div className="relative overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="px-8 py-5 text-left text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Fecha y Hora
                        </div>
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                          <Thermometer className="h-4 w-4 text-primary" />
                          Temperatura
                        </div>
                      </th>
                      <th className="px-8 py-5 text-left text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center gap-2">
                          <Droplets className="h-4 w-4 text-accent" />
                          Humedad
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentReadings.map((reading, index) => (
                      <tr key={index} className="group hover:bg-muted/30 transition-all duration-300">
                        <td className="px-8 py-6 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                              <Calendar className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {formatTime(reading.timestamp).split(' ')[0]}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatTime(reading.timestamp).split(' ')[1]}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                              <Thermometer className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-lg font-bold text-foreground">
                                {reading.temperature.toFixed(1)}°C
                              </p>
                              <p className="text-xs text-primary">
                                Temperatura
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                              <Droplets className="h-4 w-4 text-accent" />
                            </div>
                            <div>
                              <p className="text-lg font-bold text-foreground">
                                {reading.humidity.toFixed(1)}%
                              </p>
                              <p className="text-xs text-accent">
                                Humedad relativa
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Estadísticas detalladas */}
          {stats && (
            <div className="mb-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Estadísticas Detalladas
                </h2>
                <p className="text-muted-foreground">
                  Análisis estadístico completo del período seleccionado
                </p>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Estadísticas de Temperatura */}
                <Card className="border shadow-sm p-6">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="flex items-center gap-3 text-foreground">
                      <Thermometer className="h-6 w-6 text-primary" />
                      Análisis de Temperatura
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Promedio</p>
                        <p className="text-2xl font-bold text-foreground">{stats.temperature.avg.toFixed(1)}°C</p>
                      </div>
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Desv. Estándar</p>
                        <p className="text-2xl font-bold text-foreground">{stats.temperature.std.toFixed(1)}°C</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Mínimo</p>
                        <p className="text-xl font-bold text-primary">{stats.temperature.min.toFixed(1)}°C</p>
                      </div>
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Máximo</p>
                        <p className="text-xl font-bold text-destructive">{stats.temperature.max.toFixed(1)}°C</p>
                      </div>
                    </div>
                    <div className="bg-muted/50 p-4 rounded-lg border">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Tendencia</p>
                      <div className="flex items-center gap-2">
                        {stats.temperature.trend > 0 ? (
                          <>
                            <TrendingUp className="h-5 w-5 text-destructive" />
                            <span className="text-destructive font-bold">+{stats.temperature.trend.toFixed(1)}°C</span>
                          </>
                        ) : stats.temperature.trend < 0 ? (
                          <>
                            <TrendingDown className="h-5 w-5 text-primary" />
                            <span className="text-primary font-bold">{stats.temperature.trend.toFixed(1)}°C</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground font-bold">Sin cambios</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Estadísticas de Humedad */}
                <Card className="border shadow-sm p-6">
                  <CardHeader className="p-0 mb-6">
                    <CardTitle className="flex items-center gap-3 text-foreground">
                      <Droplets className="h-6 w-6 text-accent" />
                      Análisis de Humedad
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Promedio</p>
                        <p className="text-2xl font-bold text-foreground">{stats.humidity.avg.toFixed(1)}%</p>
                      </div>
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Desv. Estándar</p>
                        <p className="text-2xl font-bold text-foreground">{stats.humidity.std.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Mínimo</p>
                        <p className="text-xl font-bold text-accent">{stats.humidity.min.toFixed(1)}%</p>
                      </div>
                      <div className="bg-muted/50 p-4 rounded-lg border">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Máximo</p>
                        <p className="text-xl font-bold text-primary">{stats.humidity.max.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="bg-muted/50 p-4 rounded-lg border">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Tendencia</p>
                      <div className="flex items-center gap-2">
                        {stats.humidity.trend > 0 ? (
                          <>
                            <TrendingUp className="h-5 w-5 text-accent" />
                            <span className="text-accent font-bold">+{stats.humidity.trend.toFixed(1)}%</span>
                          </>
                        ) : stats.humidity.trend < 0 ? (
                          <>
                            <TrendingDown className="h-5 w-5 text-accent" />
                            <span className="text-accent font-bold">{stats.humidity.trend.toFixed(1)}%</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground font-bold">Sin cambios</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>
  )
}
