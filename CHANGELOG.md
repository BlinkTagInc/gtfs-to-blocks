# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Breaking: adopt node-GTFS v5 configuration groups and a named `exportBlocks()` API.
- Move exporter settings under `export`, rename options, and use numeric `serviceDate` values.
- Replace camel-case CLI flags with `--config`, `--input`, `--url`, `--database`, `--source-id`, `--service-date`, `--output`, `--overwrite`, `--no-deadheads`, `--time-format`, and `--log-level`.
- Add source and service IDs to CSV output; default to extended GTFS times and opt-in overwriting.
- Align source layout, ESM exports, build, lint, formatting, CI, release checks, dependencies, and package files with node-GTFS v5 and GTFS-to-GeoJSON.

### Fixed

- Respect weekdays and source-scoped calendar exceptions when selecting service.
- Sort after-midnight times chronologically and keep missing times blank.
- Keep block IDs distinct during sorting and separate operations locations from stops with identical IDs.
- Publish CSV atomically, preserve unrelated files, and retain prior output when generation fails.
- Reject active frequency templates rather than exporting them as scheduled vehicle trips.
- Remove process-wide error-handler side effects and honor structured reporting levels.

## [0.4.0] - 2026-11-10

### Updated

- Add Trip Short Name output
- Updated to node-gtfs v5
- Dependency updates

## [0.3.15] - 2026-10-03

### Updated

- Replace Moment with Luxon; custom `timeFormat` values now use Luxon tokens.
- Dependency updates

## [0.3.14] - 2026-08-25

### Updated

- Dependency updates

## [0.3.13] - 2026-07-28

### Updated

- Dependency updates
- Removed eslint

## [0.3.12] - 2026-06-18

### Updated

- Dependency updates
- Switch to tsdown

## [0.3.11] - 2026-04-22

### Added

- Support for calendar_dates.txt

## [0.3.10] - 2026-04-05

### Updated

- Dependency updates

## [0.3.9] - 2026-03-29

### Updated

- Dependency updates

## [0.3.8] - 2026-01-21

### Updated

- Dependency updates

## [0.3.7] - 2025-10-07

### Updated

- Dependency updates
- eslint updates

## [0.3.6] - 2025-06-10

### Updated

- Dependency updates

## [0.3.5] - 2025-04-22

### Updated

- Dependency updates

## [0.3.4] - 2025-03-24

### Changed

- Add column for Route name

### Updated

- Dependency updates

## [0.3.3] - 2025-02-25

### Updated

- Dependency updates

## [0.3.2] - 2024-11-18

### Updated

- Dependency updates

## [0.3.1] - 2024-10-24

### Added

- outputPath config options
- return path to csv from function

## [0.3.0] - 2024-10-24

### Updated

- Renamed to gtfs-to-blocks
- Dependency updates
- Improved logging

## [0.2.0] - 2024-10-18

### Added

- Add date parameter
- Deadheads from ODS
- direction_id, route_id, trip_headsign, stop_headsign as fields
- includeDeadheads config option
- Convert to typescript

### Updated

- Dependency updates

## [0.1.0]

### Added

- Initial Commit
