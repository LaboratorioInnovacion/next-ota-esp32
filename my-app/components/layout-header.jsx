"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Radio, MapPin, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LayoutHeader() {
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  // Obtener lista de estaciones para el navbar
  useEffect(() => {
    let mounted = true
    const fetchStations = async () => {
      try {
        const res = await fetch('/api/stations')
        const json = await res.json()
        if (!mounted) return
        if (json && json.success && Array.isArray(json.data)) {
          setStations(json.data)
        }
      } catch (err) {
        console.error('Error cargando estaciones para header:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchStations()
    return () => { mounted = false }
  }, [])

  // Determinar si estamos en una página de detalle de estación
  const isStationDetail = pathname?.startsWith('/station/')
  const currentStationId = isStationDetail ? pathname.split('/')[2] : null

  // Obtener estadísticas rápidas
  const activeStations = stations.filter(s => s.status === 'online').length

  return (
    <header className="border-b border-border bg-card shadow-sm sticky top-0 z-50 backdrop-blur-sm">
      {/* Header principal */}
      <div className="border-b border-border/50">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            {/* Logo y título - Compacto en mobile */}
            <Link href="/" className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg md:rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg">
                <Activity className="h-5 w-5 md:h-7 md:w-7 text-primary-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg md:text-2xl font-bold text-foreground">Centro Meteorológico</h1>
                <p className="text-xs md:text-sm text-muted-foreground">Sistema de Monitoreo</p>
              </div>
              <div className="block sm:hidden">
                <h1 className="text-base font-bold text-foreground">Meteorológico</h1>
              </div>
            </Link>

            {/* Botón de menú móvil */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1">
                <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {activeStations}/{stations.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="h-9 w-9 p-0"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>

            {/* Indicadores de estado - Desktop */}
            <div className="hidden md:flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary shadow-lg shadow-primary/50" />
                <span className="text-sm font-semibold text-foreground">
                  {activeStations}/{stations.length} Activas
                </span>
              </div>
              
              {/* Navegación principal */}
              <div className="flex items-center gap-2">
                <Button
                  asChild
                  variant={pathname === '/' ? 'default' : 'ghost'}
                  size="sm"
                >
                  <Link href="/">
                    <Activity className="h-4 w-4 mr-2" />
                    Dashboard
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Menú móvil desplegable */}
          {mobileMenuOpen && (
            <div className="mt-4 md:hidden border-t border-border pt-4">
              <div className="flex flex-col gap-3">
                <Button
                  asChild
                  variant={pathname === '/' ? 'default' : 'ghost'}
                  size="sm"
                  className="justify-start"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/">
                    <Activity className="h-4 w-4 mr-2" />
                    Dashboard Principal
                  </Link>
                </Button>
                
                {/* Lista de estaciones en móvil */}
                {stations.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
                      Estaciones
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {stations.map((station) => (
                        <Link
                          key={station.id}
                          href={`/station/${station.id}`}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                            currentStationId === station.id
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <div className={`h-2 w-2 rounded-full ${
                            station.status === 'online' 
                              ? 'bg-emerald-400' 
                              : 'bg-slate-400'
                          }`} />
                          <span className="flex-1">{station.name}</span>
                          {station.status === 'online' && (
                            <span className="text-xs text-emerald-600">Online</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navbar horizontal de estaciones - Solo desktop */}
      {stations.length > 0 && (
        <nav className="bg-card/50 hidden md:block">
          <div className="container mx-auto px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4 shrink-0">
                <Radio className="h-4 w-4" />
                <span>Estaciones:</span>
              </div>
              
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
              }}>
                <style jsx>{`
                  div::-webkit-scrollbar {
                    display: none;
                  }
                `}</style>
                {stations.map((station) => (
                  <Link
                    key={station.id}
                    href={`/station/${station.id}`}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 whitespace-nowrap ${
                      currentStationId === station.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <div className={`h-2 w-2 rounded-full ${
                      station.status === 'online' 
                        ? 'bg-emerald-400 animate-pulse' 
                        : 'bg-slate-400'
                    }`} />
                    {station.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Loading state del navbar - Solo desktop */}
      {loading && (
        <nav className="bg-card/50 hidden md:block">
          <div className="container mx-auto px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
                <Radio className="h-4 w-4" />
                <span>Cargando...</span>
              </div>
              <div className="flex gap-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-7 w-20 bg-muted/50 rounded-md animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </nav>
      )}
    </header>
  )
}