const stationFields = ["id", "mac", "name", "status", "lastUpdate", "temperature", "humidity", "latitude", "longitude"]

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
  return {
    id: station.id, mac: station.mac, name: station.name, status: station.status,
    lastUpdate: reading?.timestamp ?? null,
    temperature: reading?.temperature ?? null, humidity: reading?.humidity ?? null,
    latitude: station.latitude ?? null, longitude: station.longitude ?? null,
  }
}
