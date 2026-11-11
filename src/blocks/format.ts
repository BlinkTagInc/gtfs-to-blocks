import type { Gtfs, Calendar, Stops, OpsLocations, Routes } from 'gtfs';
import type { ExportSettings } from '../config.ts';
import { formatTime } from './csv.ts';

export interface TripSegment {
  sourceId: string;
  blockId: string | null;
  departureIsOps?: boolean;
  arrivalIsOps?: boolean;
  routeId?: string;
  route?: Routes;
  tripId: string;
  tripShortName?: string | null;
  tripHeadsign?: string | null;
  stopHeadsign?: string | null;
  directionId?: number | null;
  serviceId: string;
  departureStopId: string | null;
  arrivalStopId: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  isDeadhead: boolean;
}

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
] as const;
export function formatDays(calendar: Calendar | undefined) {
  const daysShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let daysInARow = 0;
  let dayString = '';

  if (!calendar) {
    return '';
  }

  for (let i = 0; i <= 6; i += 1) {
    const currentDayOperating =
      calendar[days[i] as (typeof days)[number]] === 1;
    const previousDayOperating =
      i > 0 ? calendar[days[i - 1] as (typeof days)[number]] === 1 : false;
    const nextDayOperating =
      i < 6 ? calendar[days[i + 1] as (typeof days)[number]] === 1 : false;

    if (currentDayOperating) {
      if (dayString.length > 0) {
        if (!previousDayOperating) {
          dayString += ', ';
        } else if (daysInARow === 1) {
          dayString += '-';
        }
      }

      daysInARow += 1;

      if (
        dayString.length === 0 ||
        !nextDayOperating ||
        i === 6 ||
        !previousDayOperating
      ) {
        dayString += daysShort[i];
      }
    } else {
      daysInARow = 0;
    }
  }

  if (dayString.length === 0) {
    dayString = 'No regular service days';
  }

  return dayString;
}

export async function formatTripSegments(
  tripSegments: TripSegment[],
  config: ExportSettings,
  gtfs: Gtfs,
) {
  const sources = new Set(tripSegments.map((segment) => segment.sourceId));
  const stops: Stops[] = [];
  const opsLocations: OpsLocations[] = [];
  const calendars: Calendar[] = [];
  for (const sourceId of sources) {
    const scope = { source_id: sourceId };
    stops.push(...(await gtfs.schedule.stops.where(scope).all()));
    if (config.deadheads) {
      opsLocations.push(...(await gtfs.todsV1.opsLocations.where(scope).all()));
    }
    calendars.push(...(await gtfs.schedule.calendar.where(scope).all()));
  }

  return tripSegments.map((tripSegment) => {
    const calendar = calendars.find(
      (calendar) =>
        calendar.source_id === tripSegment.sourceId &&
        calendar.service_id === tripSegment.serviceId,
    );
    const departureStop =
      stops.find(
        (stop) =>
          !tripSegment.departureIsOps &&
          stop.source_id === tripSegment.sourceId &&
          stop.stop_id === tripSegment.departureStopId,
      ) ??
      opsLocations.find(
        (opsLocation) =>
          tripSegment.departureIsOps &&
          opsLocation.source_id === tripSegment.sourceId &&
          opsLocation.ops_location_id === tripSegment.departureStopId,
      );
    const arrivalStop =
      stops.find(
        (stop) =>
          !tripSegment.arrivalIsOps &&
          stop.source_id === tripSegment.sourceId &&
          stop.stop_id === tripSegment.arrivalStopId,
      ) ??
      opsLocations.find(
        (opsLocation) =>
          tripSegment.arrivalIsOps &&
          opsLocation.source_id === tripSegment.sourceId &&
          opsLocation.ops_location_id === tripSegment.arrivalStopId,
      );

    if (!departureStop || !arrivalStop) {
      throw new Error(
        `Missing stop or operations location for source ${tripSegment.sourceId}, trip ${tripSegment.tripId}`,
      );
    }
    return {
      sourceId: tripSegment.sourceId,
      serviceId: tripSegment.serviceId,
      blockId: tripSegment.blockId,
      routeId: tripSegment.routeId,
      routeName:
        tripSegment.route?.route_short_name ||
        tripSegment.route?.route_long_name ||
        '',
      tripId: tripSegment.tripId,
      tripShortName: tripSegment.tripShortName,
      directionId: tripSegment.directionId,
      departureTime: formatTime(tripSegment.departureTime, config.timeFormat),
      arrivalTime: formatTime(tripSegment.arrivalTime, config.timeFormat),
      dayList: formatDays(calendar),
      departureLocation:
        'stop_name' in departureStop
          ? departureStop.stop_name
          : departureStop.ops_location_name,
      arrivalLocation:
        'stop_name' in arrivalStop
          ? arrivalStop.stop_name
          : arrivalStop.ops_location_name,
      tripHeadsign: tripSegment.tripHeadsign,
      stopHeadsign: tripSegment.stopHeadsign,
      isDeadhead: tripSegment.isDeadhead.toString(),
    };
  });
}
