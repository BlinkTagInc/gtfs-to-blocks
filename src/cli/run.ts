import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createConsoleReporter, type GtfsReportingLevel } from 'gtfs';
import pkg from '../../package.json' with { type: 'json' };
import { exportBlocks } from '../export.ts';
import type { BlocksConfig } from '../config.ts';

const help = `Usage: gtfs-to-blocks [options]

  -c, --config <file>      Read configuration (default: ./config.json)
      --input <path>       GTFS ZIP or directory
      --url <url>          GTFS download URL
      --database <path>    SQLite database
      --source-id <id>     Source for direct input or database-only export
      --output <path>      Destination directory
      --service-date <day> Service on YYYYMMDD
      --overwrite          Replace a previous export
      --no-deadheads       Exclude TODS v1 deadhead movements
      --time-format <fmt>  Optional Luxon clock format
  -l, --log-level <level>  silent, error, warn, info
  -h, --help               Show help
  -v, --version            Print version
`;
export async function run(args: string[]) {
  const { values: v, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      config: { type: 'string', short: 'c' },
      input: { type: 'string' },
      url: { type: 'string' },
      database: { type: 'string' },
      'source-id': { type: 'string' },
      output: { type: 'string' },
      'service-date': { type: 'string' },
      overwrite: { type: 'boolean' },
      'no-deadheads': { type: 'boolean' },
      'time-format': { type: 'string' },
      'log-level': { type: 'string', short: 'l' },
    },
  });
  if (v.version) {
    console.log(pkg.version);
    return;
  }
  if (v.help) {
    console.log(help);
    return;
  }
  if (
    positionals.length &&
    (positionals.length !== 1 || positionals[0] !== 'export')
  ) {
    throw new Error(
      'Unexpected positional argument. Use --input for a GTFS file or see --help.',
    );
  }
  if (v.input !== undefined && v.url !== undefined) {
    throw new Error('Choose --input or --url.');
  }
  let config: BlocksConfig = {};
  try {
    config = JSON.parse(await readFile(v.config ?? 'config.json', 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Expected a JSON configuration object.');
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        'Invalid JSON in ' + (v.config ?? 'config.json') + ': ' + error.message,
        { cause: error },
      );
    }
    if (
      v.config !== undefined ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error;
    }
  }
  const direct = v.input !== undefined || v.url !== undefined;
  if (v.database !== undefined) {
    config.database = {
      path: v.database,
      ...(config.database?.durability && {
        durability: config.database.durability,
      }),
    };
  }
  if (
    config.export !== undefined &&
    (!config.export ||
      typeof config.export !== 'object' ||
      Array.isArray(config.export))
  ) {
    throw new Error('export must be an object.');
  }
  const output = { ...config.export };
  if (direct) {
    const sourceId = v['source-id'] ?? 'default';
    config.sources = [
      {
        sourceId,
        schedule:
          v.url !== undefined ? { url: v.url } : { path: v.input ?? '' },
      },
    ];
    output.sourceId = sourceId;
  } else if (v['source-id'] !== undefined) {
    output.sourceId = v['source-id'];
  }
  if (v.output !== undefined) {
    output.outputDirectory = v.output;
  }
  if (v['service-date'] !== undefined) {
    output.serviceDate = Number(v['service-date']);
  }
  if (v.overwrite) {
    output.overwrite = true;
  }
  if (v['no-deadheads']) {
    output.deadheads = false;
  }
  if (v['time-format'] !== undefined) {
    output.timeFormat = v['time-format'];
  }
  const file = await exportBlocks({
    ...config,
    export: output,
    reporting: {
      ...config.reporting,
      reporter: createConsoleReporter(),
      ...(v['log-level'] !== undefined && {
        level: v['log-level'] as GtfsReportingLevel,
      }),
    },
  });
  if (
    !['silent', 'error', 'warn'].includes(
      v['log-level'] ?? config.reporting?.level ?? 'info',
    )
  ) {
    console.log('Wrote ' + file);
  }
}
