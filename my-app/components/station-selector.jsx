"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Radio, Check } from "lucide-react"

export function StationSelector({ stations, selectedStation, onSelectStation }) {
  return (
    <Card className="border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Radio className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-card-foreground">Seleccionar Estación</h3>
          <p className="text-xs text-muted-foreground">
            {stations.length} {stations.length === 1 ? "estación disponible" : "estaciones disponibles"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {stations.map((station) => (
          <Button
            key={station.id}
            variant={selectedStation?.id === station.id ? "default" : "outline"}
            className="w-full justify-between"
            onClick={() => onSelectStation(station)}
          >
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${station.status === "online" ? "bg-green-500" : "bg-gray-500"}`} />
              <div className="text-left">
                <div className="font-medium">{station.name}</div>
                <div className="text-xs opacity-70">{station.mac}</div>
              </div>
            </div>
            {selectedStation?.id === station.id && <Check className="h-4 w-4" />}
          </Button>
        ))}
      </div>
    </Card>
  )
}
