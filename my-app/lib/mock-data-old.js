const stations = [
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

const readings = []

// Generar datos históricos de ejemplo
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

    readings.push({
      id: `reading-${i}-1`,
      stationId: "1",
      temperature: Number((baseTemp + tempVariation).toFixed(1)),
      humidity: Number((45 + Math.random() * 20).toFixed(1)),
      timestamp: timestamp,
    })

    readings.push({
      id: `reading-${i}-2`,
      stationId: "2",
      temperature: Number((baseTemp + tempVariation - 2).toFixed(1)),
      humidity: Number((50 + Math.random() * 15).toFixed(1)),
      timestamp: timestamp,
    })
  }
}

generateHistoricalData()

export const mockDb = {
  stations: {
    findMany: async (options = {}) => {
      let result = [...stations]

      if (options.orderBy) {
        const field = Object.keys(options.orderBy)[0]
        const order = options.orderBy[field]
        result.sort((a, b) => {
          if (order === "asc") return a[field] > b[field] ? 1 : -1
          return a[field] < b[field] ? 1 : -1
        })
      }

      if (options.include?.readings) {
        result = result.map((station) => ({
          ...station,
          readings: readings
            .filter((r) => r.stationId === station.id)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, options.include.readings.take || 1),
        }))
      }

      return result
    },
    findUnique: async ({ where }) => {
      return stations.find((s) => s.id === where.id || s.mac === where.mac)
    },
    create: async ({ data }) => {
      const newStation = {
        id: String(stations.length + 1),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      stations.push(newStation)
      return newStation
    },
    update: async ({ where, data }) => {
      const index = stations.findIndex((s) => s.id === where.id)
      if (index !== -1) {
        stations[index] = { ...stations[index], ...data, updatedAt: new Date() }
        return stations[index]
      }
      return null
    },
  },
  reading: {
    findMany: async (options = {}) => {
      let result = [...readings]

      if (options.where) {
        if (options.where.stationId) {
          result = result.filter((r) => r.stationId === options.where.stationId)
        }
        if (options.where.timestamp?.gte) {
          result = result.filter((r) => r.timestamp >= options.where.timestamp.gte)
        }
      }

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
    create: async ({ data }) => {
      const newReading = {
        id: `reading-${Date.now()}-${Math.random()}`,
        ...data,
        timestamp: data.timestamp || new Date(),
      }
      readings.push(newReading)
      return newReading
    },
  },
}
