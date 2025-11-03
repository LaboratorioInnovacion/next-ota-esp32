"use client"

import { Card } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { TrendingUp, TrendingDown } from "lucide-react"

export function AdvancedChart({ data, title, dataKey, unit, icon: Icon, color }) {
  if (!data || data.length === 0) {
    return (
      <Card className="border-border bg-card p-6">
        <div className="flex h-[400px] items-center justify-center">
          <p className="text-muted-foreground">No hay datos disponibles</p>
        </div>
      </Card>
    )
  }

  // Calcular estadísticas
  const values = data.map((d) => d[dataKey])
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const max = Math.max(...values)
  const min = Math.min(...values)
  const trend = values[values.length - 1] - values[0]

  return (
    <Card className="border-border bg-card p-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{data.length} lecturas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trend > 0 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className={`text-sm font-medium ${trend > 0 ? "text-green-500" : "text-red-500"}`}>
            {trend > 0 ? "+" : ""}
            {trend.toFixed(1)}
            {unit}
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-xs text-muted-foreground">Promedio</p>
          <p className="text-xl font-bold text-foreground">
            {avg.toFixed(1)}
            {unit}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-xs text-muted-foreground">Máximo</p>
          <p className="text-xl font-bold text-foreground">
            {max.toFixed(1)}
            {unit}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-xs text-muted-foreground">Mínimo</p>
          <p className="text-xl font-bold text-foreground">
            {min.toFixed(1)}
            {unit}
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0 0)" />
          <XAxis dataKey="time" stroke="oklch(0.60 0 0)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="oklch(0.60 0 0)" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "oklch(0.16 0 0)",
              border: "1px solid oklch(0.24 0 0)",
              borderRadius: "8px",
              color: "oklch(0.98 0 0)",
            }}
            formatter={(value) => [`${value.toFixed(1)}${unit}`, title]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey={dataKey}
            name={title}
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
