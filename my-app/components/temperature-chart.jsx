"use client"

import { Card } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Thermometer } from "lucide-react"

export function TemperatureChart({ data }) {
  return (
    <Card className="border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Thermometer className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-card-foreground">Temperatura</h3>
            <p className="text-xs text-muted-foreground">Últimas 24 horas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">°C</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.24 0 0)" />
          <XAxis dataKey="time" stroke="oklch(0.60 0 0)" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="oklch(0.60 0 0)" fontSize={12} tickLine={false} axisLine={false} domain={[15, 35]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "oklch(0.16 0 0)",
              border: "1px solid oklch(0.24 0 0)",
              borderRadius: "8px",
              color: "oklch(0.98 0 0)",
            }}
            formatter={(value) => [`${value.toFixed(1)}°C`, "Temperatura"]}
          />
          <Line
            type="monotone"
            dataKey="temperature"
            stroke="oklch(0.65 0.24 264)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "oklch(0.65 0.24 264)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
