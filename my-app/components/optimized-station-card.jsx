"use client"

import { memo } from "react"
import { StationCard } from "@/components/station-card"

/**
 * Componente memoizado para las tarjetas de estaciones
 * Previene re-renders innecesarios cuando las props no cambian
 */
const OptimizedStationCard = memo(({ station }) => {
  return <StationCard station={station} />
}, (prevProps, nextProps) => {
  // Solo re-renderizar si los datos relevantes de la estación han cambiado
  return (
    prevProps.station.id === nextProps.station.id &&
    prevProps.station.temperature === nextProps.station.temperature &&
    prevProps.station.humidity === nextProps.station.humidity &&
    prevProps.station.status === nextProps.station.status &&
    prevProps.station.lastUpdate === nextProps.station.lastUpdate
  )
})

OptimizedStationCard.displayName = "OptimizedStationCard"

export { OptimizedStationCard }