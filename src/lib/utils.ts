import { stringify } from 'csv-stringify'
import { DateTime } from 'luxon'

/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig) {
  const defaults = {
    timeFormat: 'HH:mm:ss',
    date: DateTime.local().toFormat('yyyyMMdd'),
    includeDeadheads: true,
    overwriteExistingFiles: true,
  }

  const config = Object.assign(defaults, initialConfig)

  return config
}

/*
 * Generate the CSV of trip segments
 */
export async function generateCSV(tripSegments) {
  const lines = []

  lines.push([
    'Block ID',
    'Route ID',
    'Route',
    'Trip ID',
    'Direction ID',
    'Days',
    'Departure Location',
    'Arrival Location',
    'Departure Time',
    'Arrival Time',
    'Trip Headsign',
    'Stop Headsign',
    'Is Deadhead',
  ])

  for (const tripSegment of tripSegments) {
    lines.push([
      tripSegment.blockId,
      tripSegment.routeId,
      tripSegment.routeName,
      tripSegment.tripId,
      tripSegment.directionId,
      tripSegment.dayList,
      tripSegment.departureLocation,
      tripSegment.arrivalLocation,
      tripSegment.departureTime,
      tripSegment.arrivalTime,
      tripSegment.tripHeadsign,
      tripSegment.stopHeadsign,
      tripSegment.isDeadhead,
    ])
  }

  return stringify(lines)
}

/*
 * Convert a GTFS time to a clock time, wrapping hours at 24.
 */
export function fromGTFSTime(timeString: string | null) {
  const [hours, minutes, seconds] = (timeString ?? '00:00:00')
    .split(':')
    .map(Number)

  // Use a fixed UTC date so clock times are unaffected by DST or today's date.
  return DateTime.utc(1970, 1, 1, hours % 24, minutes, seconds)
}
