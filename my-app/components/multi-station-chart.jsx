"use client"

import { useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

// Colores predefinidos para diferentes estaciones
const STATION_COLORS = [
  "#3b82f6", // Blue
  "#ef4444", // Red
  "#22c55e", // Green
  "#f59e0b", // Yellow
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#84cc16", // Lime
  "#ec4899", // Pink
  "#6b7280", // Gray
]

export function MultiStationChart({ 
  data, 
  dataKey, 
  title, 
  unit, 
  icon: Icon,
  color = "#3b82f6" 
}) {
  // Procesar datos para el gráfico combinado
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return []

    // Obtener todos los timestamps únicos
    const allTimestamps = new Set()
    data.forEach(station => {
      station.data.forEach(reading => {
        allTimestamps.add(reading.timestamp)
      })
    })

    // Convertir a array y ordenar
    const sortedTimestamps = Array.from(allTimestamps).sort()

    // Crear estructura de datos para el gráfico
    return sortedTimestamps.map(timestamp => {
      const point = {
        timestamp,
        time: new Date(timestamp).toLocaleDateString("es-ES", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      }

      // Agregar datos de cada estación para este timestamp
      data.forEach((station, index) => {
        const reading = station.data.find(r => r.timestamp === timestamp)
        point[station.stationId] = reading ? reading[dataKey] : null
        point[`${station.stationId}_name`] = station.stationName
      })

      return point
    })
  }, [data, dataKey])

  // Tooltip personalizado
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-foreground mb-2">{label}</p>
          {payload
            .filter(entry => entry.value !== null && entry.value !== undefined)
            .map((entry, index) => {
              const stationName = processedData.find(d => d.time === label)?.[`${entry.dataKey}_name`] || entry.dataKey
              return (
                <p key={index} className="text-xs" style={{ color: entry.color }}>
                  <span className="font-medium">{stationName}:</span> {entry.value?.toFixed(1)}{unit}
                </p>
              )
            })
          }
        </div>
      )
    }
    return null
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {Icon && <Icon className="h-4 w-4" />}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No hay datos disponibles
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium text-foreground">
          {Icon && <Icon className="h-5 w-5" style={{ color }} />}
          {title} - Todas las Estaciones
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] md:h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={processedData}
              margin={{
                top: 5,
                right: 10,
                left: 10,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis 
                dataKey="time" 
                stroke="#6b7280"
                fontSize={11}
                tick={{ fill: '#6b7280' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={11}
                tick={{ fill: '#6b7280' }}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                iconType="line"
              />
              
              {/* Renderizar una línea por cada estación */}
              {data.map((station, index) => (
                <Line
                  key={station.stationId}
                  type="monotone"
                  dataKey={station.stationId}
                  stroke={STATION_COLORS[index % STATION_COLORS.length]}
                  strokeWidth={2}
                  dot={{ fill: STATION_COLORS[index % STATION_COLORS.length], strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, stroke: STATION_COLORS[index % STATION_COLORS.length], strokeWidth: 2 }}
                  name={station.stationName}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}