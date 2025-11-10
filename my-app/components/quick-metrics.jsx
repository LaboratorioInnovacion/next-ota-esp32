"use client"

import { Card } from "@/components/ui/card"

/**
 * Componente para mostrar métricas rápidas con íconos y colores
 */
export function QuickMetrics({ metrics }) {
  return (
    <div className="flex flex-wrap gap-2 md:gap-3">
      {metrics.map((metric, index) => (
        <Card key={index} className="px-3 py-2 bg-linear-to-r from-background to-muted/50 border-l-2" style={{ borderLeftColor: metric.color }}>
          <div className="flex items-center gap-2">
            {metric.icon && (
              <metric.icon className="h-3 w-3" style={{ color: metric.color }} />
            )}
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-foreground">
                {metric.label}:
              </span>
              <span className="text-xs font-bold" style={{ color: metric.color }}>
                {metric.value}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}