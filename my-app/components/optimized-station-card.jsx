"use client"

import { memo } from "react"
import { StationCard } from "@/components/station-card"
import { sameStation } from "@/lib/station-data.mjs"

const OptimizedStationCard = memo(StationCard, (previous, next) => sameStation(previous.station, next.station))
OptimizedStationCard.displayName = "OptimizedStationCard"

export { OptimizedStationCard }
