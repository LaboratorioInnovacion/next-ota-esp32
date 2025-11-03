import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Thermometer, Droplets, Radio, Clock } from "lucide-react"

export function StationCard({ station }) {
  const getStatusColor = (status) => {
    switch (status) {
      case "online":
        return "bg-primary"
      case "offline":
        return "bg-destructive"
      default:
        return "bg-muted"
    }
  }

  const formatTime = (date) => {
    const dateObj = new Date(date)
    const now = new Date()
    const diff = Math.floor((now - dateObj) / 1000)
    if (diff < 60) return `Hace ${diff}s`
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`
    return dateObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <Link href={`/station/${station.id}`}>
      <Card className="overflow-hidden border-border bg-card p-0 transition-all hover:border-primary/50 hover:shadow-lg cursor-pointer">
        <div className="border-b border-border bg-secondary/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-card-foreground">{station.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${getStatusColor(station.status)}`} />
              <span className="text-xs text-muted-foreground capitalize">{station.status}</span>
            </div>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{station.mac}</p>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Thermometer className="h-4 w-4" />
                <span className="text-xs font-medium">Temperatura</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">{station.temperature.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">°C</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Droplets className="h-4 w-4" />
                <span className="text-xs font-medium">Humedad</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">{station.humidity.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{formatTime(station.lastUpdate)}</span>
          </div>
        </div>
      </Card>
    </Link>
  )
}
