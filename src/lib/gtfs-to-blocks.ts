import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { sortBy } from 'lodash-es'
import {
  openDb,
  importGtfs,
  getStoptimes,
  getDeadheadTimes,
  getRoutes,
  Config,
  ConfigAgency,
  Calendar,
} from 'gtfs'
import sanitize from 'sanitize-filename'
import Timer from 'timer-machine'

import { prepDirectory } from './file-utils.js'
import { progressBar, log, logStats } from './log-utils.ts'
import { fromGTFSTime, generateCSV, setDefaultConfig } from './utils.ts'
import { formatTripSegments } from './formatters.js'
import moment from 'moment'
import untildify from 'untildify'

const gtfsToBlocks = async (initialConfig: Config) => {
  const config = setDefaultConfig(initialConfig)
  const timer = new Timer()

  timer.start()

  const db = openDb({ sqlitePath: config.sqlitePath })

  if (!config.agencies || config.agencies.length === 0) {
    throw new Error('No agencies defined in `config.json`')
  }

  if (!config.skipImport) {
    // Import GTFS
    await importGtfs(config)
  }

  const agencyKey = config.agencies
    .map((agency: ConfigAgency & { agency_key?: string }) => agency.agency_key)
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

  const calendars = db
    .prepare(
      'SELECT DISTINCT service_id FROM calendar WHERE start_date <= ? AND end_date >= ?',
    )
    .all([config.date, config.date])

  if (calendars.length === 0) {
    throw new Error(
      `No calendars found for ${moment(config.date, 'YYYYMMDD').format(
        'MMM D, YYYY',
      )}`,
    )
  }

  const routes = getRoutes()

  const serviceIds = calendars.map((calendar: Calendar) => calendar.service_id)
  const trips = db
    .prepare(
      `SELECT trip_id, direction_id, service_id, block_id, route_id, trip_headsign FROM trips where service_id IN (${serviceIds
        .map(() => '?')
        .join(', ')})`,
    )
    .all(serviceIds)
  const deadheads = config.includeDeadheads
    ? db
        .prepare(
          `SELECT deadhead_id, service_id, block_id FROM deadheads where service_id IN (${serviceIds
            .map(() => '?')
            .join(', ')})`,
        )
        .all(serviceIds)
    : []
  const tripSegments = []

  const bar = progressBar(
    `${agencyKey}: Generating trip segments {bar} {value}/{total}`,
    trips.length,
    config,
  )

  for (const trip of trips) {
    try {
      const stoptimes = getStoptimes(
        { trip_id: trip.trip_id },
        [],
        [['stop_sequence', 'ASC']],
      )

      for (const [index, stoptime] of stoptimes.entries()) {
        if (index < stoptimes.length - 1) {
          tripSegments.push({
            blockId: trip.block_id,
            routeId: trip.route_id,
            route: routes.find((route) => route.route_id === trip.route_id),
            tripId: trip.trip_id,
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
      const deadheadTimes = await getDeadheadTimes(
        { deadhead_id: deadhead.deadhead_id },
        [],
        [['location_sequence', 'ASC']],
      )

      for (const [index, deadheadTime] of deadheadTimes.entries()) {
        if (index < deadheadTimes.length - 1) {
          tripSegments.push({
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

  const sortedTripSegments = sortBy(tripSegments, [
    // Sort by integer else alphabetically
    (tripSegment) => parseInt(tripSegment.blockId, 10) || tripSegment.blockId,
    (tripSegment) => fromGTFSTime(tripSegment.departureTime),
  ])

  const formattedTripSegments = formatTripSegments(sortedTripSegments, config)

  await prepDirectory(outputPath, config)
  config.assetPath = '../'

  const csv = await generateCSV(formattedTripSegments)
  const csvPath = join(outputPath, 'blocks.csv')
  await writeFile(csvPath, csv)

  // Print stats
  log(config)(
    `${agencyKey}: block export for ${moment(config.date, 'YYYYMMDD').format(
      'MMM D, YYYY',
    )} created at ${csvPath}`,
  )

  logStats(config)(outputStats)

  const seconds = Math.round(timer.time() / 1000)
  log(config)(
    `${agencyKey}: block export generation required ${seconds} seconds`,
  )

  timer.stop()

  return csvPath
}

export default gtfsToBlocks
