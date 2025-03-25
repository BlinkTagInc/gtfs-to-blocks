import { getCalendars, getOpsLocations, getStops } from 'gtfs'
import { uniq } from 'lodash-es'
import { fromGTFSTime } from './utils.ts'

/*
 * Format a calendar's list of days for display using abbreviated day names.
 */
const days = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]
export function formatDays(calendar) {
  const daysShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  let daysInARow = 0
  let dayString = ''

  if (!calendar) {
    return ''
  }

  for (let i = 0; i <= 6; i += 1) {
    const currentDayOperating = calendar[days[i]] === 1
    const previousDayOperating = i > 0 ? calendar[days[i - 1]] === 1 : false
    const nextDayOperating = i < 6 ? calendar[days[i + 1]] === 1 : false

    if (currentDayOperating) {
      if (dayString.length > 0) {
        if (!previousDayOperating) {
          dayString += ', '
        } else if (daysInARow === 1) {
          dayString += '-'
        }
      }

      daysInARow += 1

      if (
        dayString.length === 0 ||
        !nextDayOperating ||
        i === 6 ||
        !previousDayOperating
      ) {
        dayString += daysShort[i]
      }
    } else {
      daysInARow = 0
    }
  }

  if (dayString.length === 0) {
    dayString = 'No regular service days'
  }

  return dayString
}

export function formatTripSegments(tripSegments, config) {
  const stopIds = uniq(
    tripSegments.flatMap((tripSegment) => [
      tripSegment.departureStopId,
      tripSegment.arrivalStopId,
    ]),
  )
  const serviceIds = uniq(
    tripSegments.map((tripSegment) => tripSegment.serviceId),
  )

  const stops = getStops({ stop_id: stopIds })
  const opsLocations = getOpsLocations({ ops_location_id: stopIds })
  const calendars = getCalendars({ service_id: serviceIds })

  return tripSegments.map((tripSegment) => {
    const calendar = calendars.find(
      (calendar) => calendar.service_id === tripSegment.serviceId,
    )
    const departureStop =
      stops.find((stop) => stop.stop_id === tripSegment.departureStopId) ??
      opsLocations.find(
        (opsLocation) =>
          opsLocation.ops_location_id === tripSegment.departureStopId,
      )
    const arrivalStop =
      stops.find((stop) => stop.stop_id === tripSegment.arrivalStopId) ??
      opsLocations.find(
        (opsLocation) =>
          opsLocation.ops_location_id === tripSegment.arrivalStopId,
      )

    return {
      blockId: tripSegment.blockId,
      routeId: tripSegment.routeId,
      routeName:
        tripSegment.route?.route_short_name ??
        tripSegment.route?.route_long_name ??
        '',
      tripId: tripSegment.tripId,
      directionId: tripSegment.directionId,
      departureTime: fromGTFSTime(tripSegment.departureTime).format(
        config.timeFormat,
      ),
      arrivalTime: fromGTFSTime(tripSegment.arrivalTime).format(
        config.timeFormat,
      ),
      dayList: formatDays(calendar),
      departureLocation:
        departureStop.stop_name ?? departureStop.ops_location_name,
      arrivalLocation: arrivalStop.stop_name ?? arrivalStop.ops_location_name,
      tripHeadsign: tripSegment.tripHeadsign,
      stopHeadsign: tripSegment.stopHeadsign,
      isDeadhead: tripSegment.isDeadhead.toString(),
    }
  })
}
