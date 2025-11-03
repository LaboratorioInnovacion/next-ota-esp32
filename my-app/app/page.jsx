"use client"

import { useState, useEffect } from "react"
import { StationCard } from "@/components/station-card"
import { StatsOverview } from "@/components/stats-overview"
import { StationSelector } from "@/components/station-selector"
import { PeriodSelector } from "@/components/period-selector"
import { AdvancedChart } from "@/components/advanced-chart"
import { StationsMap } from "@/components/stations-map"
import { Activity, Thermometer, Droplets, Radio } from "lucide-react"

/**
 * Página Principal del Dashboard Meteorológico
 * Muestra en tiempo real los datos de las estaciones ESP32 conectadas
 */
export default function Page() {
  // Estados del componente
  const [stations, setStations] = useState([]) // Lista completa de estaciones meteorológicas
  const [selectedStation, setSelectedStation] = useState(null) // Estación actualmente seleccionada para ver detalles
  const [selectedPeriod, setSelectedPeriod] = useState("week") // Periodo de tiempo para gráficos: "week" o "month"
  const [chartData, setChartData] = useState([]) // Datos históricos formateados para los gráficos
  const [loading, setLoading] = useState(true) // Estado de carga inicial de la página

  /**
   * Effect 1: Carga y actualización automática de estaciones
   * - Obtiene la lista de estaciones desde la API
   * - Se ejecuta al montar el componente
   * - Se actualiza automáticamente cada 10 segundos
   * - Si hay estaciones disponibles, selecciona la primera por defecto
   */
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const response = await fetch("/api/stations")
        const result = await response.json()
        if (result.success) {
          setStations(result.data)
          // Auto-seleccionar la primera estación si no hay ninguna seleccionada
          if (result.data.length > 0 && !selectedStation) {
            setSelectedStation(result.data[0])
          }
        }
      } catch (error) {
        console.error("[v0] Error cargando estaciones:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStations()
    const interval = setInterval(fetchStations, 10000) // Actualizar cada 10 segundos
    return () => clearInterval(interval) // Limpiar intervalo al desmontar componente
  }, [])

  /**
   * Effect 2: Carga de lecturas históricas
   * - Obtiene los datos históricos de la estación seleccionada
   * - Filtra por el periodo seleccionado (semana o mes)
   * - Formatea las fechas en español para los gráficos
   * - Se ejecuta cuando cambia la estación o el periodo
   */
  useEffect(() => {
    const fetchReadings = async () => {
      if (!selectedStation) return

      try {
        const response = await fetch(`/api/readings?stationId=${selectedStation.id}&period=${selectedPeriod}`)
        const result = await response.json()

        if (result.success) {
          // Formatear datos para los gráficos con fechas en español
          const formatted = result.data.map((reading) => ({
            time: new Date(reading.timestamp).toLocaleDateString("es-ES", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            temperature: reading.temperature,
            humidity: reading.humidity,
          }))
          setChartData(formatted)
        }
      } catch (error) {
        console.error("[v0] Error cargando lecturas:", error)
      }
    }

    fetchReadings()
  }, [selectedStation, selectedPeriod])

  // Cálculo de estadísticas globales del sistema
  const avgTemperature =
    stations.length > 0 ? stations.reduce((acc, s) => acc + (s.temperature || 0), 0) / stations.length : 0
  const avgHumidity =
    stations.length > 0 ? stations.reduce((acc, s) => acc + (s.humidity || 0), 0) / stations.length : 0
  const activeStations = stations.filter((s) => s.status === "online").length

  // Pantalla de carga mientras se obtienen los datos iniciales
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">Cargando estaciones...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Cabecera del sistema con logo y estado */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-primary to-accent shadow-lg">
                <Activity className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Centro Meteorológico</h1>
                <p className="text-sm text-muted-foreground">Sistema de Monitoreo Profesional</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary shadow-lg shadow-primary/50" />
                <span className="text-sm font-semibold text-foreground">Sistema Activo</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Panel de estadísticas generales - 4 tarjetas con métricas principales */}
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <StatsOverview
            title="Estaciones Activas"
            value={activeStations}
            total={stations.length}
            icon={Radio}
            trend={`${activeStations}/${stations.length}`}
          />
          <StatsOverview
            title="Temperatura Promedio"
            value={`${avgTemperature.toFixed(1)}°C`}
            icon={Thermometer}
            trend="Tiempo real"
          />
          <StatsOverview
            title="Humedad Promedio"
            value={`${avgHumidity.toFixed(1)}%`}
            icon={Droplets}
            trend="Tiempo real"
          />
          <StatsOverview
            title="Lecturas Totales"
            value={chartData.length}
            icon={Activity}
            trend={selectedPeriod === "week" ? "7 días" : "30 días"}
          />
        </div>

        {/* Mapa interactivo con ubicación de todas las estaciones */}
        <div className="mb-8">
          <StationsMap stations={stations} onStationClick={setSelectedStation} />
        </div>

        {/* Controles de selección - Estación y periodo de tiempo */}
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <StationSelector stations={stations} selectedStation={selectedStation} onSelectStation={setSelectedStation} />
          <PeriodSelector selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriod} />
        </div>

        {/* Gráficos históricos - Solo se muestran si hay una estación seleccionada */}
        {selectedStation && (
          <div className="mb-8">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-foreground">Análisis Histórico - {selectedStation.name}</h2>
              <p className="text-sm text-muted-foreground">
                Datos de {selectedPeriod === "week" ? "la última semana" : "el último mes"}
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Gráfico de temperatura */}
              <AdvancedChart
                data={chartData}
                title="Temperatura"
                dataKey="temperature"
                unit="°C"
                icon={Thermometer}
                color="oklch(0.65 0.24 264)"
              />
              {/* Gráfico de humedad */}
              <AdvancedChart
                data={chartData}
                title="Humedad"
                dataKey="humidity"
                unit="%"
                icon={Droplets}
                color="oklch(0.55 0.2 200)"
              />
            </div>
          </div>
        )}

        {/* Lista de tarjetas de estaciones conectadas */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground">Estaciones Conectadas</h2>
            <span className="rounded-lg bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
              {stations.length} {stations.length === 1 ? "estación" : "estaciones"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
