"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Settings2, Eye, EyeOff } from "lucide-react"

export function StationFilters({ stations, visibleStations, onStationToggle, onToggleAll }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const allVisible = visibleStations.length === stations.length
  const someVisible = visibleStations.length > 0 && visibleStations.length < stations.length

  return (
    <Card className="border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Filtros de Estaciones
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleAll}
              className="h-7 px-2 text-xs"
            >
              {allVisible ? (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Ocultar todas
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Mostrar todas
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 px-2 text-xs"
            >
              {isExpanded ? "Contraer" : "Expandir"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stations.map((station) => {
              const isVisible = visibleStations.includes(station.id)
              return (
                <Button
                  key={station.id}
                  variant={isVisible ? "default" : "outline"}
                  size="sm"
                  onClick={() => onStationToggle(station.id)}
                  className="justify-start h-8 px-3 text-xs"
                >
                  <div className={`h-2 w-2 rounded-full mr-2 ${
                    station.status === 'online' 
                      ? 'bg-emerald-400' 
                      : 'bg-slate-400'
                  } ${isVisible ? 'animate-pulse' : ''}`} />
                  <span className="truncate">{station.name}</span>
                  {isVisible ? (
                    <Eye className="h-3 w-3 ml-auto" />
                  ) : (
                    <EyeOff className="h-3 w-3 ml-auto opacity-50" />
                  )}
                </Button>
              )
            })}
          </div>
          
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Mostrando {visibleStations.length} de {stations.length} estaciones
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  )
}