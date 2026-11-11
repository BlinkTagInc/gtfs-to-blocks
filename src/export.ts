import { Gtfs } from 'gtfs';
import { resolveExport, type BlocksConfig } from './config.ts';
import { formatTripSegments, type TripSegment } from './blocks/format.ts';
import { generateCSV, serviceSeconds } from './blocks/csv.ts';
import { writeCSV } from './io/output.ts';

/** Import configured feeds (or reuse a database) and export one service day's movements. */
export async function exportBlocks(config: BlocksConfig) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Expected a configuration object.');
  }
  const {
    database = { path: ':memory:' },
    sources: configuredSources,
    export: options,
    ...shared
  } = config;
  for (const key of Object.keys(shared)) {
    if (!['reporting', 'extensions', 'realtime'].includes(key)) {
      throw new Error('Unknown configuration option: ' + key);
    }
  }
  const settings = resolveExport(options);
  const sources =
    configuredSources ??
    (config.database ? [{ sourceId: settings.sourceId ?? 'default' }] : []);
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error('Configure at least one Schedule source in sources.');
  }
  const ids = new Set<string>();
  for (const source of sources) {
    const id = source?.sourceId ?? 'default';
    if (
      !source ||
      typeof source !== 'object' ||
      typeof id !== 'string' ||
      !id.trim() ||
      ids.has(id) ||
      (sources.length > 1 && !source.sourceId)
    ) {
      throw new Error(
        'Multiple sources require distinct, explicit sourceId values.',
      );
    }
    ids.add(id);
  }
  if (settings.sourceId !== undefined && !ids.has(settings.sourceId)) {
    throw new Error('Unknown export.sourceId: ' + settings.sourceId);
  }
  const extensions = [...(shared.extensions ?? [])];
  if (settings.deadheads && !extensions.includes('tods-v1')) {
    extensions.push('tods-v1');
  }
  const formatted: Awaited<ReturnType<typeof formatTripSegments>> = [];
  for (const source of sources) {
    const sourceId = source.sourceId ?? 'default';
    if (settings.sourceId !== undefined && settings.sourceId !== sourceId) {
      continue;
    }
    if (
      !source.schedule &&
      (!config.database ||
        ('path' in database &&
          (!database.path || database.path === ':memory:')))
    ) {
      throw new Error(
        'Database-only export requires a persistent database with imported Schedule data.',
      );
    }
    const gtfs = new Gtfs({
      ...shared,
      database,
      extensions,
      sources: [source],
    });
    try {
      if (source.schedule) {
        const result = await gtfs.import();
        if (!result.success) {
          throw new Error(
            `GTFS import failed: ${result.errors.map((error) => error.message).join('; ')}`,
          );
        }
      } else if (
        !(await gtfs.schedule.agency.where({ source_id: sourceId }).all())
          .length
      ) {
        throw new Error('No imported Schedule data for ' + sourceId);
      }
      const scope = { source_id: sourceId };
      const calendars = await gtfs.schedule.calendar.where(scope).all();
      const serviceIds = new Set(
        calendars
          .filter(
            (calendar) =>
              calendar.start_date <= settings.serviceDate &&
              calendar.end_date >= settings.serviceDate &&
              calendar[settings.weekday] === 1,
          )
          .map((calendar) => calendar.service_id),
      );
      for (const exception of await gtfs.schedule.calendarDates
        .where({ ...scope, date: settings.serviceDate })
        .all()) {
        if (exception.exception_type === 1) {
          serviceIds.add(exception.service_id);
        } else if (exception.exception_type === 2) {
          serviceIds.delete(exception.service_id);
        }
      }
      const routes = new Map(
        (await gtfs.schedule.routes.where(scope).all()).map((route) => [
          route.route_id,
          route,
        ]),
      );
      const trips = (await gtfs.schedule.trips.where(scope).all()).filter(
        (trip) => serviceIds.has(trip.service_id),
      );
      const activeTrips = new Set(trips.map((trip) => trip.trip_id));
      if (
        (await gtfs.schedule.frequencies.where(scope).all()).some((frequency) =>
          activeTrips.has(frequency.trip_id),
        )
      ) {
        throw new Error(
          `Frequency-based trips are not supported for source ${sourceId}; no output was written.`,
        );
      }
      const segments: TripSegment[] = [];
      for (const trip of trips) {
        const times = await gtfs.schedule.stopTimes
          .where({ ...scope, trip_id: trip.trip_id })
          .orderBy([{ field: 'stop_sequence', direction: 'asc' }])
          .all();
        if (times.length < 2) {
          gtfs.reporting.log({
            level: 'warn',
            message: `${sourceId}: trip ${trip.trip_id} has fewer than two stops.`,
          });
        }
        for (const [index, from] of times.entries()) {
          const to = times[index + 1];
          if (!to) {
            continue;
          }
          const route = routes.get(trip.route_id);
          segments.push({
            sourceId,
            serviceId: trip.service_id,
            blockId: trip.block_id,
            tripId: trip.trip_id,
            routeId: trip.route_id,
            ...(route ? { route } : {}),
            tripShortName: trip.trip_short_name,
            tripHeadsign: trip.trip_headsign,
            stopHeadsign: from.stop_headsign,
            directionId: trip.direction_id,
            departureStopId: from.stop_id,
            arrivalStopId: to.stop_id,
            departureTime: from.departure_time,
            arrivalTime: to.arrival_time,
            isDeadhead: false,
          });
        }
      }
      if (settings.deadheads) {
        const deadheads = (
          await gtfs.todsV1.deadheads.where(scope).all()
        ).filter((trip) => serviceIds.has(trip.service_id));
        for (const trip of deadheads) {
          const times = await gtfs.todsV1.deadheadTimes
            .where({ ...scope, deadhead_id: trip.deadhead_id })
            .orderBy([{ field: 'location_sequence', direction: 'asc' }])
            .all();
          if (times.length < 2) {
            gtfs.reporting.log({
              level: 'warn',
              message: `${sourceId}: deadhead ${trip.deadhead_id} has fewer than two locations.`,
            });
          }
          for (const [index, from] of times.entries()) {
            const to = times[index + 1];
            if (!to) {
              continue;
            }
            segments.push({
              sourceId,
              serviceId: trip.service_id,
              blockId: trip.block_id,
              tripId: trip.deadhead_id,
              departureStopId: from.ops_location_id ?? from.stop_id,
              arrivalStopId: to.ops_location_id ?? to.stop_id,
              departureIsOps: from.ops_location_id !== null,
              arrivalIsOps: to.ops_location_id !== null,
              departureTime: from.departure_time,
              arrivalTime: to.arrival_time,
              isDeadhead: true,
            });
          }
        }
      }
      const collator = new Intl.Collator('en', { numeric: true });
      segments.sort(
        (a, b) =>
          collator.compare(a.blockId ?? '', b.blockId ?? '') ||
          (a.blockId ?? '').localeCompare(b.blockId ?? '', 'en') ||
          serviceSeconds(a.departureTime) - serviceSeconds(b.departureTime),
      );
      formatted.push(...(await formatTripSegments(segments, settings, gtfs)));
      gtfs.reporting.log({
        level: 'info',
        message: `${sourceId}: generated ${segments.length} segments for ${settings.serviceDate}.`,
      });
    } finally {
      await gtfs.close();
    }
  }
  return writeCSV(
    settings.outputDirectory,
    settings.overwrite,
    generateCSV(formatted),
  );
}
