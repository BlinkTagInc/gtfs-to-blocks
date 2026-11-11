import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { sortBy } from 'lodash-es'
import { DateTime } from 'luxon'
import { Gtfs } from 'gtfs'
import { toGtfsOptions, type BlocksConfig } from './app-options.js'
import sanitize from 'sanitize-filename'
import Timer from 'timer-machine'

import { prepDirectory, untildify } from './file-utils.js'
import { progressBar, log, logStats } from './log-utils.ts'
import { fromGTFSTime, generateCSV, setDefaultConfig } from './utils.ts'
import { formatTripSegments, type TripSegment } from './formatters.js'

const gtfsToBlocks = async (initialConfig: BlocksConfig) => {
  const config = setDefaultConfig(initialConfig)
  const timer = new Timer()

  timer.start()

  const options = toGtfsOptions(config)
  const gtfs = new Gtfs(options)
  try {
    if (!config.skipImport) {
      const result = await gtfs.import()
      if (!result.success) {
        throw new Error(
          `GTFS import failed: ${result.errors.map((error) => error.message).join('; ')}`,
        )
      }
    }

    const agencyKey = config
      .agencies!.map((agency) => agency.agency_key ?? agency.sourceId)
      .join('-')
    const outputPath = config.outputPath
      ? untildify(config.outputPath)
      : join(process.cwd(), 'output', sanitize(agencyKey))

    const outputStats = {
      trips: 0,
      tripSegments: 0,
      warnings: [],
    } as {
      trips: number
      tripSegments: number
      warnings: string[]
    }

    const tripSegments: TripSegment[] = []
    let hasServices = false
    for (const source of options.sources!) {
      const sourceId = source.sourceId!
      const scope = { source_id: sourceId }
      // Preserve the public date-range behavior, including inactive weekdays.
      const calendars = (
        await gtfs.schedule.calendar.where(scope).all()
      ).filter(
        (calendar) =>
          calendar.start_date <= Number(config.date) &&
          calendar.end_date >= Number(config.date),
      )
      const calendarDates = await gtfs.schedule.calendarDates
        .where({ ...scope, date: Number(config.date) })
        .all()
      const serviceIds = new Set(
        calendars.map((calendar) => calendar.service_id),
      )
      for (const calendarDate of calendarDates) {
        if (calendarDate.exception_type === 1) {
          serviceIds.add(calendarDate.service_id)
        } else if (calendarDate.exception_type === 2) {
          serviceIds.delete(calendarDate.service_id)
        }
      }
      if (serviceIds.size === 0) {
        continue
      }
      hasServices = true
      const routes = await gtfs.schedule.routes.where(scope).all()
      const trips = (await gtfs.schedule.trips.where(scope).all()).filter(
        (trip) => serviceIds.has(trip.service_id),
      )
      const deadheads = config.includeDeadheads
        ? (await gtfs.todsV1.deadheads.where(scope).all()).filter((trip) =>
            serviceIds.has(trip.service_id),
          )
        : []

      const bar = progressBar(
        `${agencyKey}: Generating trip segments {bar} {value}/{total}`,
        trips.length,
        config,
      )

      for (const trip of trips) {
        try {
          const stoptimes = await gtfs.schedule.stopTimes
            .where({ ...scope, trip_id: trip.trip_id })
            .orderBy([{ field: 'stop_sequence', direction: 'asc' }])
            .all()

          for (const [index, stoptime] of stoptimes.entries()) {
            if (index < stoptimes.length - 1) {
              tripSegments.push({
                sourceId,
                blockId: trip.block_id,
                routeId: trip.route_id,
                route: routes.find((route) => route.route_id === trip.route_id),
                tripId: trip.trip_id,
                tripShortName: trip.trip_short_name,
                tripHeadsign: trip.trip_headsign,
                stopHeadsign: stoptime.stop_headsign,
                directionId: trip.direction_id,
                serviceId: trip.service_id,
                departureStopId: stoptime.stop_id,
                arrivalStopId: stoptimes[index + 1].stop_id,
                departureTime: stoptime.departure_time,
                arrivalTime: stoptimes[index + 1].arrival_time,
                isDeadhead: false,
              })

              outputStats.tripSegments += 1
            }
          }

          outputStats.trips += 1

          bar?.increment()
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          outputStats.warnings.push(errorMessage)
          bar?.interrupt(errorMessage)
        }
      }

      for (const deadhead of deadheads) {
        try {
          const deadheadTimes = await gtfs.todsV1.deadheadTimes
            .where({ ...scope, deadhead_id: deadhead.deadhead_id })
            .orderBy([{ field: 'location_sequence', direction: 'asc' }])
            .all()

          for (const [index, deadheadTime] of deadheadTimes.entries()) {
            if (index < deadheadTimes.length - 1) {
              tripSegments.push({
                sourceId,
                blockId: deadhead.block_id,
                tripId: deadhead.deadhead_id,
                serviceId: deadhead.service_id,
                departureStopId:
                  deadheadTime.ops_location_id ?? deadheadTime.stop_id,
                arrivalStopId:
                  deadheadTimes[index + 1].ops_location_id ??
                  deadheadTimes[index + 1].stop_id,
                departureTime: deadheadTime.departure_time,
                arrivalTime: deadheadTimes[index + 1].arrival_time,
                isDeadhead: true,
              })

              outputStats.tripSegments += 1
            }
          }

          outputStats.trips += 1

          bar?.increment()
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          outputStats.warnings.push(errorMessage)
          bar?.interrupt(errorMessage)
        }
      }
    }
    if (!hasServices) {
      throw new Error(
        `No calendar or calendar dates found for ${DateTime.fromFormat(config.date, 'yyyyMMdd').toFormat('MMM d, yyyy')}`,
      )
    }

    const sortedTripSegments = sortBy(tripSegments, [
      // Sort by integer else alphabetically
      (tripSegment) =>
        parseInt(tripSegment.blockId ?? '', 10) || tripSegment.blockId,
      (tripSegment) => fromGTFSTime(tripSegment.departureTime),
    ])

    const formattedTripSegments = await formatTripSegments(
      sortedTripSegments,
      config,
      gtfs,
    )

    await prepDirectory(outputPath, config)

    const csv = await generateCSV(formattedTripSegments)
    const csvPath = join(outputPath, 'blocks.csv')
    await writeFile(csvPath, csv)

    // Print stats
    log(config)(
      `${agencyKey}: block export for ${DateTime.fromFormat(
        config.date,
        'yyyyMMdd',
      ).toFormat('MMM d, yyyy')} created at ${csvPath}`,
    )

    logStats(config)(outputStats)

    const seconds = Math.round(timer.time() / 1000)
    log(config)(
      `${agencyKey}: block export generation required ${seconds} seconds`,
    )

    return csvPath
  } finally {
    timer.stop()
    await gtfs.close()
  }
}

export default gtfsToBlocks
