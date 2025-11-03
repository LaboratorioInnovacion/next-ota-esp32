import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"

export function StatsOverview({ title, value, total, icon: Icon, trend }) {
  const isPositive = trend?.startsWith("+")
  const isNegative = trend?.startsWith("-")

  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-2xl font-bold text-foreground">{value}</h3>
            {total && <span className="text-sm text-muted-foreground">/ {total}</span>}
          </div>
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              {isPositive && <TrendingUp className="h-3 w-3 text-primary" />}
              {isNegative && <TrendingDown className="h-3 w-3 text-destructive" />}
              <span
                className={`text-xs font-medium ${
                  isPositive ? "text-primary" : isNegative ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {trend}
              </span>
            </div>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  )
}
