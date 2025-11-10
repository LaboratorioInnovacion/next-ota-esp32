"use client"

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react"
import { StationCard } from "@/components/station-card"
import { OptimizedStationCard } from "@/components/optimized-station-card"
import { StatsOverview } from "@/components/stats-overview"
import { StationSelector } from "@/components/station-selector"
import { PeriodSelector } from "@/components/period-selector"
import { QuickMetrics } from "@/components/quick-metrics"
import { AdvancedChart } from "@/components/advanced-chart"
import { UnifiedChart } from "@/components/unified-chart"
// Lazy loading para componentes pesados
const StationsMap = lazy(() => import("@/components/stations-map").then(module => ({ default: module.StationsMap })))
const StationFilters = lazy(() => import('../components/station-filters').then(module => ({ default: module.StationFilters })))
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
  const [allStationsData, setAllStationsData] = useState([]) // Datos de todas las estaciones para gráficos globales
  const [visibleStations, setVisibleStations] = useState([]) // IDs de estaciones visibles en los gráficos
  const [loading, setLoading] = useState(true) // Estado de carga inicial de la página
  const [chartLoading, setChartLoading] = useState(false) // Estado de carga específico para gráficos

  // Handlers optimizados con useCallback para evitar re-renders
  const handleStationClick = useCallback((station) => {
    setSelectedStation(station)
  }, [])

  const handleStationSelect = useCallback((station) => {
    setSelectedStation(station)
    // Opcional: hacer scroll al gráfico cuando se selecciona una estación
    // Esto mejora la UX en dispositivos móviles
    setTimeout(() => {
      const chartElement = document.getElementById('historical-chart')
      if (chartElement) {
        chartElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }, [])

  const handlePeriodSelect = useCallback((period) => {
    setSelectedPeriod(period)
  }, [])

  const handleStationToggle = useCallback((stationId) => {
    setVisibleStations(prev => 
      prev.includes(stationId) 
        ? prev.filter(id => id !== stationId)
        : [...prev, stationId]
    )
  }, [])

  const handleToggleAllStations = useCallback(() => {
    setVisibleStations(prev => 
      prev.length === stations.length ? [] : stations.map(s => s.id)
    )
  }, [stations])

  /**
   * Effect 1: Carga y actualización automática de estaciones
   * - Obtiene la lista de estaciones desde la API
   * - Se ejecuta al montar el componente
   * - Se actualiza automáticamente cada 30 segundos (optimizado)
   * - Si hay estaciones disponibles, selecciona la primera por defecto
   */
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const response = await fetch("/api/stations", {
          headers: { 'Cache-Control': 'public, max-age=20' } // Cache por 20 segundos
        })
        const result = await response.json()
        if (result.success) {
          setStations(result.data)
          // Auto-seleccionar la primera estación si no hay ninguna seleccionada
          if (result.data.length > 0 && !selectedStation) {
            setSelectedStation(result.data[0])
          }
          // Inicializar estaciones visibles con todas las estaciones
          if (result.data.length > 0 && visibleStations.length === 0) {
            setVisibleStations(result.data.map(s => s.id))
          }
        }
      } catch (error) {
        console.error("[v0] Error cargando estaciones:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStations()
    const interval = setInterval(fetchStations, 30000) // Reducido de 10s a 30s
    return () => clearInterval(interval) // Limpiar intervalo al desmontar componente
  }, [])

  /**
   * Effect 2: Carga de lecturas históricas (optimizado con debouncing)
   * - Obtiene los datos históricos de la estación seleccionada
   * - Filtra por el periodo seleccionado (semana o mes)
   * - Formatea las fechas en español para los gráficos
   * - Se ejecuta cuando cambia la estación o el periodo con debouncing
   */
  useEffect(() => {
    if (!selectedStation) return

    const timeoutId = setTimeout(async () => {
      setChartLoading(true) // Activar indicador de carga
      try {
        const response = await fetch(
          `/api/readings?stationId=${selectedStation.id}&period=${selectedPeriod}`,
          {
            headers: { 'Cache-Control': 'public, max-age=60' } // Cache por 1 minuto
          }
        )
        const result = await response.json()

        if (result.success) {
          // Formatear datos para los gráficos con fechas en español (memoizado)
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
      } finally {
        setChartLoading(false) // Desactivar indicador de carga
      }
    }, 300) // Debounce de 300ms

    return () => clearTimeout(timeoutId)
  }, [selectedStation, selectedPeriod])

  /**
   * Effect 3: Carga de datos históricos de TODAS las estaciones (DESHABILITADO TEMPORALMENTE)
   * - Esta función consume muchos recursos y ralentiza la app
   * - Se puede habilitar bajo demanda cuando el usuario solicite comparativas
   */
  /* 
  useEffect(() => {
    const fetchAllStationsData = async () => {
      if (stations.length === 0) return

      try {
        // Obtener datos de todas las estaciones en paralelo
        const promises = stations.map(async (station) => {
          const response = await fetch(`/api/readings?stationId=${station.id}&period=${selectedPeriod}`)
          const result = await response.json()
          
          if (result.success) {
            return {
              stationId: station.id,
              stationName: station.name,
              data: result.data.map((reading) => ({
                timestamp: reading.timestamp,
                time: new Date(reading.timestamp).toLocaleDateString("es-ES", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                temperature: reading.temperature,
                humidity: reading.humidity,
              }))
            }
          }
          return null
        })

        const results = await Promise.all(promises)
        const validResults = results.filter(result => result !== null)
        setAllStationsData(validResults)
      } catch (error) {
        console.error("[v0] Error cargando datos de todas las estaciones:", error)
      }
    }

    fetchAllStationsData()
  }, [stations, selectedPeriod])
  */

  // Cálculo de estadísticas globales del sistema (optimizado y memoizado)
  const stats = useMemo(() => {
    if (stations.length === 0) {
      return { avgTemperature: 0, avgHumidity: 0, activeStations: 0 }
    }

    const validStations = stations.filter(s => 
      s.temperature !== null && 
      s.temperature !== undefined && 
      s.humidity !== null && 
      s.humidity !== undefined
    )
    
    const avgTemperature = validStations.length > 0 
      ? Math.round((validStations.reduce((acc, s) => acc + (s.temperature || 0), 0) / validStations.length) * 10) / 10
      : 0
    
    const avgHumidity = validStations.length > 0 
      ? Math.round((validStations.reduce((acc, s) => acc + (s.humidity || 0), 0) / validStations.length) * 10) / 10
      : 0
    
    const activeStations = stations.filter((s) => s.status === "online").length

    return { avgTemperature, avgHumidity, activeStations }
  }, [stations])

  // Filtrar datos de estaciones según la selección del usuario
  const filteredStationsData = useMemo(() => {
    return allStationsData.filter(station => visibleStations.includes(station.stationId))
  }, [allStationsData, visibleStations])

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
      <main className="container mx-auto px-3 md:px-4 py-4 md:py-8">
        {/* Panel de estadísticas generales - 2x2 en mobile, 4 columnas en desktop */}
        <div className="mb-6 md:mb-8 grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
          <StatsOverview
            title="Estaciones Activas"
            value={stats.activeStations}
            total={stations.length}
            icon={Radio}
            trend={`${stats.activeStations}/${stations.length}`}
          />
          <StatsOverview
            title="Temperatura Promedio"
            value={`${stats.avgTemperature.toFixed(1)}°C`}
            icon={Thermometer}
            trend="Tiempo real"
          />
          <StatsOverview
            title="Humedad Promedio"
            value={`${stats.avgHumidity.toFixed(1)}%`}
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
        <div className="mb-6 md:mb-8">
          <Suspense fallback={
            <div className="h-64 md:h-80 bg-muted rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                <p className="mt-2 text-sm text-muted-foreground">Cargando mapa...</p>
              </div>
            </div>
          }>
            <StationsMap stations={stations} onStationClick={handleStationClick} />
          </Suspense>
        </div>

        {/* Controles de selección mejorados - Layout optimizado */}
        <div className="mb-6 md:mb-8 space-y-4 md:space-y-0">
          {/* Controles en mobile: apilados verticalmente */}
          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
            <StationSelector 
              stations={stations} 
              selectedStation={selectedStation} 
              onSelectStation={handleStationSelect} 
            />
            <PeriodSelector 
              selectedPeriod={selectedPeriod} 
              onSelectPeriod={handlePeriodSelect} 
            />
          </div>
          
          {/* Información contextual mejorada */}
          {selectedStation && (
            <div className="mt-3 md:mt-4 p-3 md:p-4 bg-muted/30 rounded-lg border border-dashed border-muted-foreground/20">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${selectedStation.status === "online" ? "bg-green-500" : "bg-gray-500"}`} />
                  <span className="font-semibold text-sm">{selectedStation.name}</span>
                  <span className="text-xs text-muted-foreground">({selectedStation.mac})</span>
                </div>
                
                <QuickMetrics 
                  metrics={[
                    {
                      label: "Temperatura",
                      value: `${selectedStation.temperature}°C`,
                      color: "#ef4444",
                      icon: Thermometer
                    },
                    {
                      label: "Humedad", 
                      value: `${selectedStation.humidity}%`,
                      color: "#06b6d4",
                      icon: Droplets
                    },
                    {
                      label: "Periodo",
                      value: selectedPeriod === "week" ? "7 días" : "30 días",
                      color: "#8b5cf6",
                      icon: Activity
                    }
                  ]}
                />
                
                {chartLoading && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-lg">
                    <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                    <span className="text-xs font-medium text-primary">Actualizando datos...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Gráfico unificado mejorado - Solo se muestra si hay una estación seleccionada */}
        {selectedStation && (
          <div id="historical-chart" className="mb-6 md:mb-8">
            <div className="mb-4 md:mb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-foreground">
                    Análisis Histórico - {selectedStation.name}
                  </h2>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {selectedPeriod === "week" ? "Datos de los últimos 7 días" : "Datos de los últimos 30 días"}
                    {chartData.length > 0 && ` • ${chartData.length} registros`}
                    {chartLoading && " • Actualizando..."}
                  </p>
                </div>
                
                {/* Indicadores de estado en tiempo real */}
                <div className="flex flex-wrap gap-3 md:gap-4">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                    <Thermometer className="h-3 w-3" />
                    <span className="text-xs font-medium">{selectedStation.temperature}°C</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                    <Droplets className="h-3 w-3" />
                    <span className="text-xs font-medium">{selectedStation.humidity}%</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300">
                    <Activity className="h-3 w-3" />
                    <span className="text-xs font-medium">{selectedStation.status === "online" ? "Activa" : "Inactiva"}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Gráfico con indicador de carga mejorado */}
            {chartLoading ? (
              <div className="h-64 md:h-80 bg-muted/30 rounded-lg flex items-center justify-center border border-dashed border-muted-foreground/20">
                <div className="text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                  <p className="mt-3 text-sm text-muted-foreground font-medium">Cargando datos históricos...</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedPeriod === "week" ? "Últimos 7 días" : "Últimos 30 días"}
                  </p>
                </div>
              </div>
            ) : chartData.length > 0 ? (
              <UnifiedChart 
                data={chartData}
                title={`Temperatura y Humedad - ${selectedPeriod === "week" ? "Última Semana" : "Último Mes"}`}
                period={selectedPeriod}
              />
            ) : (
              <div className="h-64 md:h-80 bg-muted/30 rounded-lg flex items-center justify-center border border-dashed border-muted-foreground/20">
                <div className="text-center">
                  <Activity className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground font-medium">No hay datos disponibles</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Intenta seleccionar un período diferente o verifica la conexión de la estación
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gráficos de todas las estaciones */}
        {/* {allStationsData.length > 0 && (
          <div className="mb-6 md:mb-8 space-y-4 md:space-y-6">
            <div className="mb-3 md:mb-4">
              <h2 className="text-lg md:text-xl font-bold text-foreground">Comparativa Global de Estaciones</h2>
              <p className="text-xs md:text-sm text-muted-foreground">
                Datos de {selectedPeriod === "week" ? "la última semana" : "el último mes"} - Comparación entre estaciones
              </p>
            </div>
            
            Controles de filtrado */}
            {/* <StationFilters
              stations={stations}
              visibleStations={visibleStations}
              onStationToggle={handleStationToggle}
              onToggleAll={handleToggleAllStations}
            /> */}
            
            {/* Grid responsivo para los gráficos */}
            {/* {filteredStationsData.length > 0 ? (
              <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
                <MultiStationChart
                  data={filteredStationsData}
                  dataKey="temperature"
                  title="Temperatura"
                  unit="°C"
                  icon={Thermometer}
                  color="#ef4444"
                />
                
                <MultiStationChart
                  data={filteredStationsData}
                  dataKey="humidity"
                  title="Humedad"
                  unit="%"
                  icon={Droplets}
                  color="#06b6d4"
                />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Selecciona al menos una estación para ver los gráficos</p>
              </div>
            )}
          </div>
        )} */}

        {/* Lista de tarjetas de estaciones conectadas */}
        <div>
          <div className="mb-3 md:mb-4 flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-bold text-foreground">Estaciones Conectadas</h2>
            <span className="rounded-md md:rounded-lg bg-secondary px-2 md:px-3 py-1 text-xs md:text-sm font-medium text-secondary-foreground">
              {stations.length} {stations.length === 1 ? "estación" : "estaciones"}
            </span>
          </div>
          <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stations.map((station) => (
              <OptimizedStationCard key={station.id} station={station} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
