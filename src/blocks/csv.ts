import type { formatTripSegments } from './format.ts';
import { stringify } from 'csv-stringify/sync';
import { DateTime } from 'luxon';

/*
 * Generate the CSV of trip segments
 */
export function generateCSV(
  tripSegments: Awaited<ReturnType<typeof formatTripSegments>>,
) {
  const lines = [];

  lines.push([
    'Source ID',
    'Service ID',
    'Block ID',
    'Route ID',
    'Route',
    'Trip ID',
    'Trip Short Name',
    'Direction ID',
    'Days',
    'Departure Location',
    'Arrival Location',
    'Departure Time',
    'Arrival Time',
    'Trip Headsign',
    'Stop Headsign',
    'Is Deadhead',
  ]);

  for (const tripSegment of tripSegments) {
    lines.push([
      tripSegment.sourceId,
      tripSegment.serviceId,
      tripSegment.blockId,
      tripSegment.routeId,
      tripSegment.routeName,
      tripSegment.tripId,
      tripSegment.tripShortName,
      tripSegment.directionId,
      tripSegment.dayList,
      tripSegment.departureLocation,
      tripSegment.arrivalLocation,
      tripSegment.departureTime,
      tripSegment.arrivalTime,
      tripSegment.tripHeadsign,
      tripSegment.stopHeadsign,
      tripSegment.isDeadhead,
    ]);
  }

  return stringify(lines);
}

/** Numeric GTFS service-day time, independent of clock wrap and DST. */
export function serviceSeconds(value: string | null) {
  if (value === null || value === '') {
    return Infinity;
  }
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error('Invalid GTFS time: ' + value);
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function formatTime(value: string | null, format?: string) {
  if (value === null || value === '') {
    return '';
  }
  const seconds = serviceSeconds(value);
  if (!format) {
    return value.padStart(8, '0');
  }
  return DateTime.utc(1970, 1, 1).plus({ seconds }).toFormat(format);
}
