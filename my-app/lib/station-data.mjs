import { stationHealth } from "./diagnostics.mjs"

const stationFields = ["id", "mac", "name", "status", "lastUpdate", "temperature", "humidity", "latitude", "longitude",
  "lastSeenAt", "lastValidReadingAt", "sensorStatus", "sensorErrorCode", "firmwareVersion", "reason"]

export function sameStation(a, b) {
  return !!a && !!b && stationFields.every((key) => a[key] === b[key])
}

export function reconcileStations(previous, incoming) {
  const byId = new Map(previous.map((station) => [station.id, station]))
  const next = incoming.map((station) => sameStation(byId.get(station.id), station) ? byId.get(station.id) : station)
  return next.length === previous.length && next.every((station, index) => station === previous[index]) ? previous : next
}

export function selectStationId(currentId, stations) {
  return stations.some((station) => station.id === currentId) ? currentId : stations[0]?.id ?? null
}

export function stationWithLatestReading(station) {
  const reading = station.readings[0]
  const health = stationHealth({ ...station, lastUpdate: reading?.timestamp ?? null })
  return {
    id: station.id, mac: station.mac, name: station.name, ...health,
    lastValidReadingAt: reading?.timestamp ?? null,
    sensorErrorCode: station.sensorErrorCode ?? null,
    firmwareVersion: station.firmwareVersion ?? null,
    lastUpdate: reading?.timestamp ?? null,
    temperature: reading?.temperature ?? null, humidity: reading?.humidity ?? null,
    latitude: station.latitude ?? null, longitude: station.longitude ?? null,
  }
}
