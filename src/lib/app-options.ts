import { createConsoleReporter } from 'gtfs'
import type { GtfsInstanceOptions, GtfsScheduleSourceConfig } from 'gtfs'
import { untildify } from './file-utils.js'

export interface AgencyConfig {
  agency_key?: string
  sourceId?: string
  path?: string
  url?: string
  headers?: Record<string, string>
  exclude?: string[]
  agencyId?: string
  fillEmptyAgencyId?: string
}

/** Application settings; deliberately independent of node-GTFS configuration. */
export interface BlocksConfig {
  agencies?: AgencyConfig[]
  sqlitePath?: string
  skipImport?: boolean
  date?: string
  timeFormat?: string
  includeDeadheads?: boolean
  outputPath?: string
  overwriteExistingFiles?: boolean
  verbose?: boolean
  logFunction?: (message: string, levelOrOverwrite?: string | boolean) => void
  logLevel?: 'verbose' | 'info' | 'warning' | 'error' | 'silent'
  downloadTimeout?: number
  ignoreDuplicates?: boolean
  csvOptions?: { skip_empty_lines?: boolean; relax_quotes?: boolean }
}

export function toGtfsOptions(config: BlocksConfig): GtfsInstanceOptions {
  const allowed = new Set([
    'agencies',
    'sqlitePath',
    'skipImport',
    'date',
    'timeFormat',
    'includeDeadheads',
    'outputPath',
    'overwriteExistingFiles',
    'verbose',
    'logFunction',
    'logLevel',
    'downloadTimeout',
    'ignoreDuplicates',
    'csvOptions',
  ])
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw new Error(
        `Unsupported configuration option: ${key}. V5 does not accept legacy node-GTFS options directly.`,
      )
    }
  }
  if (!config.agencies?.length) {
    throw new Error('No agencies defined in `config.json`')
  }
  if (
    config.skipImport &&
    (!config.sqlitePath || config.sqlitePath === ':memory:')
  ) {
    throw new Error('skipImport requires a persistent v5 sqlitePath')
  }
  for (const key of Object.keys(config.csvOptions ?? {})) {
    if (!['skip_empty_lines', 'relax_quotes'].includes(key)) {
      throw new Error(`Unsupported csvOptions option: ${key}`)
    }
  }
  const ids = new Set<string>()
  const sources = config.agencies.map((agency) => {
    for (const key of Object.keys(agency)) {
      if (
        ![
          'agency_key',
          'sourceId',
          'path',
          'url',
          'headers',
          'exclude',
          'agencyId',
          'fillEmptyAgencyId',
        ].includes(key)
      ) {
        throw new Error(
          `Unsupported agency option: ${key}. Prefixes and realtime settings are not supported by this exporter.`,
        )
      }
    }
    const sourceId = agency.sourceId ?? agency.agency_key
    if (!sourceId?.trim() || ids.has(sourceId)) {
      throw new Error(
        'Each feed requires a unique, stable sourceId or agency_key',
      )
    }
    ids.add(sourceId)
    if (config.skipImport) {
      return { sourceId }
    }
    if (Boolean(agency.path) === Boolean(agency.url)) {
      throw new Error(`Source ${sourceId} requires exactly one path or url`)
    }
    const common = {
      excludeFiles: agency.exclude?.map((name) =>
        name.includes('.') ? name : `${name}.txt`,
      ) as GtfsScheduleSourceConfig['excludeFiles'],
      defaultAgencyId: agency.agencyId ?? agency.fillEmptyAgencyId,
      import: {
        csv: config.csvOptions
          ? {
              skipEmptyLines: config.csvOptions.skip_empty_lines,
              relaxQuotes: config.csvOptions.relax_quotes,
            }
          : undefined,
        validation: {
          onDuplicateKey: config.ignoreDuplicates
            ? ('keep-first' as const)
            : ('reject' as const),
        },
      },
    }
    const schedule: GtfsScheduleSourceConfig = agency.path
      ? { ...common, path: untildify(agency.path) }
      : {
          ...common,
          url: agency.url!,
          requestHeaders: agency.headers,
          timeoutMs: config.downloadTimeout,
        }
    return { sourceId, schedule }
  })
  return {
    database: {
      path: config.sqlitePath ? untildify(config.sqlitePath) : ':memory:',
    },
    sources,
    extensions: ['tods-v1'],
    reporting: {
      level: config.logLevel
        ? config.logLevel === 'warning'
          ? 'warn'
          : config.logLevel === 'verbose'
            ? 'info'
            : config.logLevel
        : config.verbose === false
          ? 'warn'
          : 'info',
      reporter: config.logFunction
        ? (event) => {
            if ('message' in event) {
              config.logFunction!(
                event.message,
                event.level === 'warn' ? 'warning' : event.level,
              )
            }
          }
        : createConsoleReporter(),
    },
  }
}
