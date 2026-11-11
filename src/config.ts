import type { GtfsInstanceOptions } from 'gtfs';
import { DateTime } from 'luxon';

export interface BlocksExportOptions {
  sourceId?: string;
  outputDirectory?: string;
  overwrite?: boolean;
  /** A numeric YYYYMMDD; defaults to today in the host's local timezone. */
  serviceDate?: number;
  /** Include TODS v1 deadhead movements. Defaults to true. */
  deadheads?: boolean;
  /** Optional Luxon clock format. Omit to preserve GTFS hours beyond 24. */
  timeFormat?: string;
}

export type BlocksConfig = Omit<GtfsInstanceOptions, 'database' | 'export'> & {
  database?: GtfsInstanceOptions['database'];
  export?: BlocksExportOptions;
};

export function resolveExport(options: BlocksExportOptions = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('export must be an object.');
  }
  for (const key of Object.keys(options)) {
    if (
      ![
        'sourceId',
        'outputDirectory',
        'overwrite',
        'serviceDate',
        'deadheads',
        'timeFormat',
      ].includes(key)
    ) {
      throw new Error('Unknown export option: ' + key);
    }
  }
  const settings = {
    outputDirectory: './blocks',
    overwrite: false,
    serviceDate: Number(DateTime.local().toFormat('yyyyMMdd')),
    deadheads: true,
    ...options,
  };
  if (
    typeof settings.outputDirectory !== 'string' ||
    !settings.outputDirectory.trim()
  ) {
    throw new Error('Expected export.outputDirectory.');
  }
  if (
    typeof settings.overwrite !== 'boolean' ||
    typeof settings.deadheads !== 'boolean'
  ) {
    throw new Error('export.overwrite and export.deadheads must be booleans.');
  }
  if (
    settings.sourceId !== undefined &&
    (typeof settings.sourceId !== 'string' || !settings.sourceId.trim())
  ) {
    throw new Error('Expected a nonempty export.sourceId.');
  }
  if (
    settings.timeFormat !== undefined &&
    (typeof settings.timeFormat !== 'string' || !settings.timeFormat.trim())
  ) {
    throw new Error('Expected a nonempty export.timeFormat.');
  }
  const date = DateTime.fromFormat(String(settings.serviceDate), 'yyyyMMdd', {
    zone: 'UTC',
  });
  if (
    !Number.isInteger(settings.serviceDate) ||
    !date.isValid ||
    date.toFormat('yyyyMMdd') !== String(settings.serviceDate)
  ) {
    throw new Error('Expected a real numeric export.serviceDate (YYYYMMDD).');
  }
  return {
    ...settings,
    weekday: date.toFormat('cccc').toLowerCase() as
      | 'monday'
      | 'tuesday'
      | 'wednesday'
      | 'thursday'
      | 'friday'
      | 'saturday'
      | 'sunday',
  };
}
export type ExportSettings = ReturnType<typeof resolveExport>;
