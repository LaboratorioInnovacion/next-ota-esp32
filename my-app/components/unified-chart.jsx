"use client"

import { Card } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { TrendingUp, TrendingDown, Thermometer, Droplets } from "lucide-react"

export function UnifiedChart({ data, title, period = "week" }) {
  if (!data || data.length === 0) {
    return (
      <Card className="border-border bg-card p-6">
        <div className="flex h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">No hay datos disponibles</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {period === "week" ? "Últimos 7 días" : "Últimos 30 días"}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  // Calcular estadísticas para temperatura
  const tempValues = data.map((d) => d.temperature).filter(v => v !== null && v !== undefined)
  const tempAvg = tempValues.length > 0 ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length : 0
  const tempMax = tempValues.length > 0 ? Math.max(...tempValues) : 0
  const tempMin = tempValues.length > 0 ? Math.min(...tempValues) : 0
  const tempTrend = tempValues.length > 1 ? tempValues[tempValues.length - 1] - tempValues[0] : 0

  // Calcular estadísticas para humedad
  const humValues = data.map((d) => d.humidity).filter(v => v !== null && v !== undefined)
  const humAvg = humValues.length > 0 ? humValues.reduce((a, b) => a + b, 0) / humValues.length : 0
  const humMax = humValues.length > 0 ? Math.max(...humValues) : 0
  const humMin = humValues.length > 0 ? Math.min(...humValues) : 0
  const humTrend = humValues.length > 1 ? humValues[humValues.length - 1] - humValues[0] : 0

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: entry.color }}
              />
              <span>
                {entry.name}: {entry.value != null ? entry.value.toFixed(1) : "--"}{entry.dataKey === 'temperature' ? '°C' : '%'}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <Card className="border-border bg-card p-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Thermometer className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">
              {data.length} lecturas • {period === "week" ? "Últimos 7 días" : "Últimos 30 días"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {tempTrend > 0 ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-blue-500" />
            )}
            <span className={`text-sm font-medium ${tempTrend > 0 ? "text-red-500" : "text-blue-500"}`}>
              {tempTrend > 0 ? "+" : ""}
              {tempTrend.toFixed(1)}°C
            </span>
          </div>
          <div className="flex items-center gap-2">
            {humTrend > 0 ? (
              <TrendingUp className="h-4 w-4 text-cyan-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-orange-500" />
            )}
            <span className={`text-sm font-medium ${humTrend > 0 ? "text-cyan-500" : "text-orange-500"}`}>
              {humTrend > 0 ? "+" : ""}
              {humTrend.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="mb-6 grid grid-cols-2 gap-6">
        {/* Temperatura */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Temperatura</h4>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Promedio</p>
              <p className="text-lg font-bold text-foreground">{tempAvg.toFixed(1)}°C</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Máximo</p>
              <p className="text-lg font-bold text-foreground">{tempMax.toFixed(1)}°C</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Mínimo</p>
              <p className="text-lg font-bold text-foreground">{tempMin.toFixed(1)}°C</p>
            </div>
          </div>
        </div>

        {/* Humedad */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-cyan-500" />
            <h4 className="text-sm font-semibold text-foreground">Humedad</h4>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Promedio</p>
              <p className="text-lg font-bold text-foreground">{humAvg.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Máximo</p>
              <p className="text-lg font-bold text-foreground">{humMax.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Mínimo</p>
              <p className="text-lg font-bold text-foreground">{humMin.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0 0)" />
          <XAxis 
            dataKey="time" 
            stroke="oklch(0.60 0 0)" 
            fontSize={11} 
            tickLine={false} 
            axisLine={false} 
          />
          <YAxis 
            yAxisId="temp"
            orientation="left"
            stroke="oklch(0.65 0.24 264)" 
            fontSize={11} 
            tickLine={false} 
            axisLine={false}
            domain={['dataMin - 2', 'dataMax + 2']}
          />
          <YAxis 
            yAxisId="hum"
            orientation="right"
            stroke="oklch(0.55 0.2 200)" 
            fontSize={11} 
            tickLine={false} 
            axisLine={false}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            name="Temperatura"
            stroke="oklch(0.65 0.24 264)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "oklch(0.65 0.24 264)" }}
            connectNulls={false}
          />
          <Line
            yAxisId="hum"
            type="monotone"
            dataKey="humidity"
            name="Humedad"
            stroke="oklch(0.55 0.2 200)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "oklch(0.55 0.2 200)" }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}