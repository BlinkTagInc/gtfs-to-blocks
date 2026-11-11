# GTFS-to-Blocks

Export transit movements as a CSV grouped by source and vehicle block, then sorted by departure time. Use it to audit a day's work, spot overlapping trips, and find gaps between trips.

A block is a sequence of trips operated by the same vehicle. Each CSV row describes a movement between consecutive stops or TODS v1 operations locations. Trips without a block ID are included with a blank Block ID.

Built on [node-GTFS v5](https://github.com/BlinkTagInc/node-gtfs). Requires Node.js 22.18+, 24, or 26 (ES modules).

## Quick start

```sh
npm install -g gtfs-to-blocks
gtfs-to-blocks --input ./gtfs.zip --service-date 20261110
```

This creates `./blocks/blocks.csv`. Use `--overwrite` to replace an existing CSV. ZIP files, unzipped GTFS directories, and download URLs are supported:

```sh
gtfs-to-blocks --url https://example.com/gtfs.zip --output ./exports --service-date 20261110
gtfs-to-blocks --config ./config.json
```

Run `gtfs-to-blocks --help` for all flags. With no `--config`, the CLI reads `./config.json` if present; explicit flags override its settings. Paths are relative to the working directory. The hosted [online version](https://blocks.blinktag.com) is maintained separately and may use a different configuration format.

## Configuration

Start with [config-sample.json](config-sample.json), or see [config-sample-full.json](config-sample-full.json) for a larger example.

```json
{
  "sources": [{ "sourceId": "bus", "schedule": { "path": "./gtfs.zip" } }],
  "export": {
    "serviceDate": 20261110,
    "outputDirectory": "./blocks",
    "overwrite": false,
    "deadheads": true
  }
}
```

Shared options use node-GTFS v5's structure unchanged: `database`, `sources`, `extensions`, `reporting`, and `realtime`. This exporter imports Schedule feeds; it does not refresh Realtime data. Sources with `schedule` are imported on each run. Sources without `schedule` query an already imported v5 database. Each source needs an explicit, distinct `sourceId` when more than one is configured; a single unnamed source uses `default`.

Use `sources[].schedule.url` instead of `path` for a download, with optional `requestHeaders` and `timeoutMs`. Import settings belong under `sources[].schedule.import`. See the [node-GTFS configuration reference](https://github.com/BlinkTagInc/node-gtfs/blob/main/docs/configuration.md) for shared options.

| Export option     | Default                             | Meaning                                                                                                  |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `serviceDate`     | Today, in the host's local timezone | Numeric `YYYYMMDD`; selects service active on that day, including weekday flags and calendar exceptions. |
| `sourceId`        | All configured sources              | Export only this source.                                                                                 |
| `outputDirectory` | `./blocks`                          | Directory containing `blocks.csv`.                                                                       |
| `overwrite`       | `false`                             | Replace only `blocks.csv`, after generation succeeds; other files are preserved.                         |
| `deadheads`       | `true`                              | Include TODS v1 deadhead movements; enables the `tods-v1` extension automatically.                       |
| `timeFormat`      | GTFS time                           | Optional Luxon clock format, such as `h:mm a`. Omit to preserve extended hours like `25:10:00`.          |

The default database is in memory. To retain imported feeds, set `database.path`. To reuse them without importing:

```json
{
  "database": { "path": "./gtfs.sqlite" },
  "sources": [{ "sourceId": "bus" }],
  "export": { "serviceDate": 20261110, "overwrite": true }
}
```

Or use `gtfs-to-blocks --database ./gtfs.sqlite --source-id bus` from a directory without an import config. Existing databases must match node-GTFS v5 and the enabled extensions. Reimport older databases into a new file.

## JavaScript / TypeScript

```sh
npm install gtfs-to-blocks
```

```js
import { exportBlocks } from 'gtfs-to-blocks';

const csvPath = await exportBlocks({
  sources: [{ sourceId: 'bus', schedule: { path: './gtfs.zip' } }],
  export: { serviceDate: 20261110, outputDirectory: './blocks' },
});
```

`exportBlocks()` resolves to the absolute CSV path and closes every database instance it creates, including on failure. Types `BlocksConfig` and `BlocksExportOptions` are exported. Library calls use node-GTFS reporting; pass `reporting.reporter` for structured events. The CLI installs `createConsoleReporter()` and accepts `--log-level silent|error|warn|info`. Errors go to stderr with a nonzero exit status.

## CSV output

See [examples/blocks.csv](examples/blocks.csv). Columns are:

```text
Source ID,Service ID,Block ID,Route ID,Route,Trip ID,Trip Short Name,Direction ID,Days,Departure Location,Arrival Location,Departure Time,Arrival Time,Trip Headsign,Stop Headsign,Is Deadhead
```

Sources remain separate even when their identifiers overlap. Blocks sort naturally (`2` before `10`); times sort by elapsed service-day seconds, so `25:00:00` follows `23:00:00`. Missing times remain blank and sort after known times within a block. Custom time formats change display only. `Days` describes the regular calendar, not exceptions; exception-only services have a blank value. A day with no movements produces a header-only CSV.

Frequency-based trips are rejected when active on the selected date because their template times do not describe individual vehicle movements. Missing stops or operations locations also fail the export instead of silently publishing an incomplete result. Intermediate stops with no time remain present; this tool does not interpolate times or infer vehicle assignments.

## Migrating from 0.x

This major release intentionally removes the old default export, flat settings, and camel-case CLI flags.

| Before                                      | Now                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Default `gtfsToBlocks(config)` import       | Named `exportBlocks(config)` import                                             |
| `agencies[].agency_key`                     | `sources[].sourceId`                                                            |
| `agencies[].path` / `url`                   | `sources[].schedule.path` / `url`                                               |
| `agencies[].headers` / `exclude`            | `sources[].schedule.requestHeaders` / `excludeFiles` (filenames with `.txt`)    |
| `agencies[].agencyId` / `fillEmptyAgencyId` | `sources[].schedule.defaultAgencyId`                                            |
| `sqlitePath`                                | `database.path`                                                                 |
| `skipImport`                                | Omit `schedule` from sources and use a persistent database                      |
| `date` (string)                             | `export.serviceDate` (number); now respects weekdays                            |
| `includeDeadheads`                          | `export.deadheads`                                                              |
| `outputPath`                                | `export.outputDirectory` (default is now `./blocks`)                            |
| `overwriteExistingFiles`                    | `export.overwrite` (default is now `false`)                                     |
| `timeFormat`                                | `export.timeFormat` (default preserves hours beyond 24)                         |
| `verbose`, `logLevel`, `logFunction`        | `reporting.level` and `reporting.reporter`                                      |
| `downloadTimeout`                           | `sources[].schedule.timeoutMs`                                                  |
| `ignoreDuplicates`                          | `sources[].schedule.import.validation.onDuplicateKey`: `keep-first` or `reject` |
| `csvOptions`                                | `sources[].schedule.import.csv` with camel-case keys                            |
| `--configPath`, `-c`                        | `--config`, `-c`                                                                |
| `--skipImport`, `-s`                        | Database-only configuration as shown above                                      |

Update CSV consumers for the new Source ID and Service ID columns. Unknown config options fail with an error. Replacing output no longer attempts to clear a whole directory.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and release preparation. Licensed under the [MIT license](LICENSE.txt).
