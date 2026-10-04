<p align="center">
  ➡️
  <a href="#example-output">Example Output</a> |
  <a href="#online-version">Online Version</a> |
  <a href="#installation">Installation</a> |
  <a href="#configuration">Configuration</a>
  ⬅️
  <br /><br />
  <img src="docs/images/gtfs-to-blocks-logo.svg" alt="GTFS-to-blocks" />
  <br /><br />
  <a href="https://www.npmjs.com/package/gtfs-to-blocks" rel="nofollow"><img src="https://img.shields.io/npm/v/gtfs-to-blocks.svg?style=flat" style="max-width: 100%;"></a>
  <a href="https://www.npmjs.com/package/gtfs-to-blocks" rel="nofollow"><img src="https://img.shields.io/npm/dm/gtfs-to-blocks.svg?style=flat" style="max-width: 100%;"></a>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg">
  <br /><br />
  Reads transit data from GTFS and exports all trip segments sorted by block_id and their departure times in CSV format.
  <br /><br />
  <a href="https://nodei.co/npm/gtfs-to-blocks/" rel="nofollow"><img src="https://nodei.co/npm/gtfs-to-blocks.png?downloads=true" alt="NPM" style="max-width: 100%;"></a>
</p>

<hr>

GTFS-to-blocks exports all trip segments sorted by block_id and their departure times to a CSV file.

What is a block? A block is a group of trips that are part of the same transit service usually operated by a single vehicle. Two trips which overlap in time can&apos;t be part of the same block as a vehicle can only operate one trip at a time.

This tool is useful for auditing all blocks for a specific day. By reviewing trips grouped by block in chronological order, you can ensure that no trips overlap for a specific block and find gaps where additional trips could be added.

## Example Output

```csv
Block ID,Trip ID,Days,Departure Location,Arrival Location,Departure Time,Arrival Time
1,t_1960920_b_33130_tn_0,Mon-Fri,Oakland Ferry Terminal,San Francisco Ferry Building Gate G,06:30:00,06:55:00
1,t_1989797_b_33130_tn_0,Mon-Fri,San Francisco Ferry Building Gate G,Oakland Ferry Terminal,07:05:00,07:30:00
1,t_1960965_b_33130_tn_0,Mon-Fri,Oakland Ferry Terminal,San Francisco Ferry Building Gate G,07:35:00,08:00:00
1,t_1989799_b_33130_tn_0,Mon-Fri,San Francisco Ferry Building Gate G,Oakland Ferry Terminal,08:10:00,08:35:00
1,t_1960967_b_33130_tn_0,Mon-Fri,Oakland Ferry Terminal,San Francisco Ferry Building Gate G,08:40:00,09:05:00
1,t_1960893_b_33130_tn_0,Mon-Fri,San Francisco Ferry Building Gate E,Richmond Ferry Terminal,09:55:00,10:30:00
1,t_1960879_b_33130_tn_0,Mon-Fri,Richmond Ferry Terminal,San Francisco Ferry Building Gate E,10:40:00,11:15:00
2,t_1962122_b_33130_tn_0,Mon-Fri,Alameda Seaplane Lagoon Ferry Terminal,San Francisco Ferry Building Gate F,07:00:00,07:20:00
2,t_1989798_b_33130_tn_0,Mon-Fri,San Francisco Ferry Building Gate G,Oakland Ferry Terminal,07:30:00,07:55:00
2,t_1960966_b_33130_tn_0,Mon-Fri,Oakland Ferry Terminal,San Francisco Ferry Building Gate G,08:00:00,08:25:00
2,t_1989800_b_33130_tn_0,Mon-Fri,San Francisco Ferry Building Gate G,Oakland Ferry Terminal,08:35:00,09:00:00
2,t_1960968_b_33130_tn_0,Mon-Fri,Oakland Ferry Terminal,San Francisco Ferry Building Gate G,09:05:00,09:30:00
2,t_1962145_b_33130_tn_0,Mon-Fri,San Francisco Ferry Building Gate F,Alameda Seaplane Lagoon Ferry Terminal,09:40:00,10:00:00
2,t_1962143_b_33130_tn_0,Mon-Fri,Alameda Seaplane Lagoon Ferry Terminal,San Francisco Ferry Building Gate F,10:10:00,10:30:00
2,t_1960934_b_33130_tn_0,Mon-Fri,San Francisco Ferry Building Gate G,Main Street Alameda Ferry Terminal,11:20:00,11:40:00
2,t_1993271_b_33130_tn_0,Mon-Fri,Main Street Alameda Ferry Terminal,Oakland Ferry Terminal,11:45:00,11:55:00
2,t_1962159_b_33130_tn_0,Mon-Fri,Oakland Ferry Terminal,San Francisco Ferry Building Gate G,12:05:00,12:30:00
```

## Online Version

You can either run gtfs-to-blocks as a command-line tool (see below) or you can use the [online version](https://blocks.blinktag.com). The online version allows you to use it entirely within your browser - no downloads or command line necessary. It is limited to smaller GTFS files.

[blocks.blinktag.com](https://blocks.blinktag.com)

## Installation

    npm install

## Setup

Configuration is read a JSON file. To get started, copy `config-sample.json` to `config.json` and then add your project's configuration to `config.json`.

    cp config-sample.json config.json

Ensure that your config.json is [valid JSON](https://jsonformatter.curiousconcept.com) before proceeding.

All files starting with `config*.json` are .gitignored - so you can create multiple configuration files such as `config-caltrain.json`.

| option                                              | type    | description                                                                                  |
| --------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| [`agencies`](#agencies)                             | array   | An array of GTFS files to be imported.                                                       |
| [`date`](#date)                                     | string  | The date to use for generating blocks.                                                       |
| [`includeDeadheads`](#includedeadheads)             | boolean | Whether or not to include deadhead trips from ODS format.                                    |
| [`outputPath`](#outputpath)                         | string  | The path to the folder to write the csv file to. Optional, defaults to `output/<agencyKey>`. |
| [`overwriteExistingFiles`](#overwriteexistingfiles) | boolean | Whether or not to overwrite existing files in the `outputPath` directory.                    |
| [`timeFormat`](#timeformat)                         | string  | A string defining time format using Luxon tokens.                                            |

### agencies

{Array} Specify the GTFS files to be imported in an `agencies` array. GTFS files can be imported via a `url` or a local `path`.

Each file needs an `agency_key`, a short name you create that is specific to that GTFS file. For GTFS files that contain more than one agency, you only need to list each GTFS file once in the `agencies` array, not once per agency that it contains.

To find an agency's GTFS file, visit [transitfeeds.com](http://transitfeeds.com). You can use the
URL from the agency's website or you can use a URL generated from the transitfeeds.com
API along with your API token.

- Specify a download URL:

```json
{
  "agencies": [
    {
      "agency_key": "county-connection",
      "url": "http://cccta.org/GTFS/google_transit.zip"
    }
  ]
}
```

- Specify a path to a zipped GTFS file:

```json
{
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/gtfs.zip"
    }
  ]
}
```

- Specify a path to an unzipped GTFS file:

```json
{
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/"
    }
  ]
}
```

- Exclude files - if you don't want all GTFS files to be imported, you can specify an array of files to exclude.

```json
{
  "agencies": [
    {
      "agency_key": "myAgency",
      "path": "/path/to/the/unzipped/gtfs/",
      "exclude": ["shapes", "stops"]
    }
  ]
}
```

### date

{String} The date to use for generating blocks in YYYYMMDD format. Blocks will be generated for all calendars in calendar.txt that overlap with this date. So if a date specified is a weekday, weekend blocks will be generated as well for all calendar.txt entries that overlap the date specified. Defaults to today's date.

```json
"date": "20200505"
```

### includeDeadheads

{Boolean} Whether or not to include deadheads from ODS data. Defaults to true.

```json
"includeDeadheads": true
```

### outputPath

\{String\} The path to write the CSV file to. Optional, defaults to a folder named `output/<agencyKey>` in the current directory.

```json
"outputPath": "/path/to/output"
```

### overwriteExistingFiles

\{Boolean\} Whether or not to overwrite existing files in the `outputPath` folder. Optional, defaults to `true`.

```json
"overwriteExistingFiles": true
```

### timeFormat​

{String} A string defining time format using Luxon tokens. [See full list of formatting options](https://moment.github.io/luxon/#/formatting?id=table-of-tokens). Defaults to HH:mm:ss which yields "13:14:30". For 12-hour time, use `h:mm a` (for example, "1:14 PM"). Existing Moment formats must be updated to Luxon tokens, such as `A` to `a` for AM/PM. GTFS times beyond 24 hours wrap to clock time, so "25:14:30" displays as "01:14:30".

```json
"timeFormat": "HH:mm:ss"
```

## Quick Start

### Command-line example

    ./bin/gtfs-to-blocks.js --configPath /path/to/your/custom-config.json
