"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "lucide-react"

export function PeriodSelector({ selectedPeriod, onSelectPeriod }) {
  const periods = [
    { value: "week", label: "Última Semana", days: 7 },
    { value: "month", label: "Último Mes", days: 30 },
  ]

  return (
    <Card className="border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
          <Calendar className="h-4 w-4 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-card-foreground">Período de Tiempo</h3>
          <p className="text-xs text-muted-foreground">Selecciona el rango de datos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {periods.map((period) => (
          <Button
            key={period.value}
            variant={selectedPeriod === period.value ? "default" : "outline"}
            className="w-full"
            onClick={() => onSelectPeriod(period.value)}
          >
            <div className="text-center">
              <div className="font-medium">{period.label}</div>
              <div className="text-xs opacity-70">{period.days} días</div>
            </div>
          </Button>
        ))}
      </div>
    </Card>
  )
}
