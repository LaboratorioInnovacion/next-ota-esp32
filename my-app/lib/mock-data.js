/**
 * Sistema de datos inteligente que integra APIs reales con datos mock de respaldo
 * - Prioriza datos de APIs reales cuando están disponibles
 * - Usa caché en memoria para optimizar rendimiento
 * - Proporciona datos mock de respaldo si las APIs fallan
 */

// =====================================================
// CONFIGURACIÓN Y CACHÉ
// =====================================================

const CACHE_DURATION = 5000 // 5 segundos de caché
const cache = {
  stations: { data: null, timestamp: 0 },
  readings: new Map(), // Map por stationId
}

// =====================================================
// DATOS MOCK DE RESPALDO (solo si APIs no responden)
// =====================================================

const mockStations = [
  {
    id: "1",
    mac: "0C:B8:15:C4:F8:34",
    name: "ESP32_Meteo",
    status: "active",
    latitude: -28.88,
    longitude: -65.77,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "2",
    mac: "0C:B8:15:C4:F8:35",
    name: "ESP32_Exterior",
    status: "active",
    latitude: -28.9,
    longitude: -65.75,
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(),
  },
]

const mockReadings = []

/**
 * Genera datos históricos de ejemplo para demostración
 * Se ejecuta solo una vez al cargar el módulo
 */
const generateHistoricalData = () => {
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

  for (let i = 0; i < 720; i++) {
    // 720 lecturas (30 días, cada hora)
    const timestamp = new Date(thirtyDaysAgo + i * 60 * 60 * 1000)
    const hour = timestamp.getHours()

    // Simular variación de temperatura según hora del día
    const baseTemp = 20 + Math.sin(((hour - 6) / 12) * Math.PI) * 8
    const tempVariation = Math.random() * 4 - 2

    mockReadings.push({
      id: `reading-${i}-1`,
      stationId: "1",
      temperature: Number((baseTemp + tempVariation).toFixed(1)),
      humidity: Number((45 + Math.random() * 20).toFixed(1)),
      timestamp: timestamp,
    })

    mockReadings.push({
      id: `reading-${i}-2`,
      stationId: "2",
      temperature: Number((baseTemp + tempVariation - 2).toFixed(1)),
      humidity: Number((50 + Math.random() * 15).toFixed(1)),
      timestamp: timestamp,
    })
  }
}

generateHistoricalData()

// =====================================================
// UTILIDADES
// =====================================================

/**
 * Verifica si los datos en caché aún son válidos
 */
const isCacheValid = (timestamp) => {
  return Date.now() - timestamp < CACHE_DURATION
}

/**
 * Realiza fetch con timeout y manejo de errores
 */
const fetchWithTimeout = async (url, timeout = 5000) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

// =====================================================
// FUNCIONES PARA ACCESO A DATOS REALES
// =====================================================

/**
 * Obtiene estaciones desde la API o caché
 * Incluye la última lectura de cada estación
 */
const fetchStationsFromAPI = async () => {
  // Verificar caché primero
  if (isCacheValid(cache.stations.timestamp) && cache.stations.data) {
    console.log("[mockDb] Usando estaciones desde caché")
    return cache.stations.data
  }

  try {
    console.log("[mockDb] Obteniendo estaciones desde API...")
    const response = await fetchWithTimeout("/api/stations")

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()

    if (result.success && result.data) {
      // Actualizar caché
      cache.stations = {
        data: result.data,
        timestamp: Date.now(),
      }
      console.log(`[mockDb] ${result.data.length} estaciones obtenidas desde API`)
      return result.data
    }

    throw new Error("Respuesta de API inválida")
  } catch (error) {
    console.warn("[mockDb] Error obteniendo estaciones desde API, usando datos mock:", error.message)
    return mockStations
  }
}

/**
 * Obtiene lecturas de una estación desde la API o caché
 */
const fetchReadingsFromAPI = async (stationId, period = "week") => {
  const cacheKey = `${stationId}-${period}`

  // Verificar caché
  const cachedReadings = cache.readings.get(cacheKey)
  if (cachedReadings && isCacheValid(cachedReadings.timestamp)) {
    console.log(`[mockDb] Usando lecturas desde caché para estación ${stationId}`)
    return cachedReadings.data
  }

  try {
    console.log(`[mockDb] Obteniendo lecturas desde API para estación ${stationId}...`)
    const response = await fetchWithTimeout(`/api/readings?stationId=${stationId}&period=${period}`)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()

    if (result.success && result.data) {
      // Actualizar caché
      cache.readings.set(cacheKey, {
        data: result.data,
        timestamp: Date.now(),
      })
      console.log(`[mockDb] ${result.data.length} lecturas obtenidas desde API`)
      return result.data
    }

    throw new Error("Respuesta de API inválida")
  } catch (error) {
    console.warn(
      `[mockDb] Error obteniendo lecturas desde API para estación ${stationId}, usando datos mock:`,
      error.message,
    )
    // Filtrar lecturas mock por estación y periodo
    const startDate = new Date()
    if (period === "week") {
      startDate.setDate(startDate.getDate() - 7)
    } else if (period === "month") {
      startDate.setDate(startDate.getDate() - 30)
    }

    return mockReadings.filter((r) => r.stationId === stationId && r.timestamp >= startDate)
  }
}

// =====================================================
// INTERFAZ COMPATIBLE CON PRISMA (mockDb)
// =====================================================

export const mockDb = {
  /**
   * Métodos para manejo de estaciones
   */
  stations: {
    /**
     * Obtiene múltiples estaciones con opciones de filtrado
     * Compatible con Prisma: findMany
     */
    findMany: async (options = {}) => {
      let result = await fetchStationsFromAPI()

      // Aplicar ordenamiento si se especifica
      if (options.orderBy) {
        const field = Object.keys(options.orderBy)[0]
        const order = options.orderBy[field]
        result = [...result].sort((a, b) => {
          if (order === "asc") return a[field] > b[field] ? 1 : -1
          return a[field] < b[field] ? 1 : -1
        })
      }

      // Incluir lecturas si se solicitan
      if (options.include?.readings) {
        const stationsWithReadings = await Promise.all(
          result.map(async (station) => {
            try {
              const readings = await fetchReadingsFromAPI(station.id, "month")
              const sortedReadings = readings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
              const limitedReadings = sortedReadings.slice(0, options.include.readings.take || 1)

              return {
                ...station,
                readings: limitedReadings,
              }
            } catch (error) {
              console.error(`[mockDb] Error obteniendo lecturas para estación ${station.id}:`, error)
              return {
                ...station,
                readings: [],
              }
            }
          }),
        )
        return stationsWithReadings
      }

      return result
    },

    /**
     * Busca una estación específica por ID o MAC
     * Compatible con Prisma: findUnique
     */
    findUnique: async ({ where }) => {
      const stations = await fetchStationsFromAPI()
      return stations.find((s) => s.id === where.id || s.mac === where.mac) || null
    },

    /**
     * Crea una nueva estación
     * Compatible con Prisma: create
     */
    create: async ({ data }) => {
      const stations = await fetchStationsFromAPI()
      const newStation = {
        id: String(stations.length + 1),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Agregar a datos mock (solo en memoria durante esta sesión)
      mockStations.push(newStation)

      // Invalidar caché
      cache.stations.timestamp = 0

      console.log(`[mockDb] Nueva estación creada: ${newStation.name} (${newStation.mac})`)
      return newStation
    },

    /**
     * Actualiza una estación existente
     * Compatible con Prisma: update
     */
    update: async ({ where, data }) => {
      const stations = await fetchStationsFromAPI()
      const station = stations.find((s) => s.id === where.id)

      if (!station) {
        console.error(`[mockDb] Estación con ID ${where.id} no encontrada`)
        return null
      }

      // Actualizar en datos mock
      const mockIndex = mockStations.findIndex((s) => s.id === where.id)
      if (mockIndex !== -1) {
        mockStations[mockIndex] = {
          ...mockStations[mockIndex],
          ...data,
          updatedAt: new Date(),
        }
      }

      // Invalidar caché
      cache.stations.timestamp = 0

      const updatedStation = { ...station, ...data, updatedAt: new Date() }
      console.log(`[mockDb] Estación actualizada: ${updatedStation.name}`)
      return updatedStation
    },
  },

  /**
   * Métodos para manejo de lecturas
   */
  reading: {
    /**
     * Obtiene múltiples lecturas con filtros
     * Compatible con Prisma: findMany
     */
    findMany: async (options = {}) => {
      let result = []

      // Si hay filtro por estación, usar la API
      if (options.where?.stationId) {
        const period = options.where.timestamp?.gte ? "month" : "week"
        result = await fetchReadingsFromAPI(options.where.stationId, period)

        // Aplicar filtro de fecha si existe
        if (options.where.timestamp?.gte) {
          result = result.filter((r) => new Date(r.timestamp) >= options.where.timestamp.gte)
        }
      } else {
        // Sin filtro de estación, usar datos mock
        result = [...mockReadings]

        if (options.where?.timestamp?.gte) {
          result = result.filter((r) => r.timestamp >= options.where.timestamp.gte)
        }
      }

      // Aplicar ordenamiento
      if (options.orderBy) {
        const field = Object.keys(options.orderBy)[0]
        const order = options.orderBy[field]
        result.sort((a, b) => {
          if (order === "asc") return a[field] > b[field] ? 1 : -1
          return a[field] < b[field] ? 1 : -1
        })
      }

      return result
    },

    /**
     * Crea una nueva lectura
     * Compatible con Prisma: create
     */
    create: async ({ data }) => {
      const newReading = {
        id: `reading-${Date.now()}-${Math.random()}`,
        ...data,
        timestamp: data.timestamp || new Date(),
      }

      // Agregar a datos mock
      mockReadings.push(newReading)

      // Invalidar caché de lecturas de esta estación
      const cacheKeys = Array.from(cache.readings.keys()).filter((key) => key.startsWith(data.stationId))
      cacheKeys.forEach((key) => cache.readings.delete(key))

      console.log(`[mockDb] Nueva lectura creada para estación ${data.stationId}`)
      return newReading
    },
  },
}

// =====================================================
// UTILIDADES EXPORTADAS
// =====================================================

/**
 * Limpia toda la caché (útil para forzar actualización)
 */
export const clearCache = () => {
  cache.stations.timestamp = 0
  cache.readings.clear()
  console.log("[mockDb] Caché limpiada")
}

/**
 * Obtiene estadísticas del sistema de caché
 */
export const getCacheStats = () => {
  return {
    stations: {
      cached: cache.stations.data !== null,
      age: cache.stations.timestamp ? Date.now() - cache.stations.timestamp : null,
      valid: isCacheValid(cache.stations.timestamp),
    },
    readings: {
      entries: cache.readings.size,
    },
  }
}
