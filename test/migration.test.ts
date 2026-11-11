import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { Gtfs } from 'gtfs'
import { openSqliteDatabase, closeSqliteDatabase } from 'gtfs/sqlite'
import gtfsToBlocks from '../dist/index.js'

async function fixture(t, name = 'North') {
  const root = await mkdtemp(join(tmpdir(), 'blocks-v5-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const feed = join(root, 'feed')
  await mkdir(feed)
  const files = {
    'agency.txt': `agency_id,agency_name,agency_url,agency_timezone\na,${name},https://example.com,America/Los_Angeles\n`,
    'routes.txt': `route_id,agency_id,route_long_name,route_type\nr,a,${name} Route,3\n`,
    'stops.txt': `stop_id,stop_name,stop_lat,stop_lon\na,${name} A,37,-122\nb,${name} B,38,-122\n`,
    'calendar.txt':
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,0,0,20260101,20261231\nw,0,0,0,0,0,1,1,20260101,20261231\nremoved,1,1,1,1,1,1,1,20260101,20261231\n',
    'calendar_dates.txt':
      'service_id,date,exception_type\nremoved,20261110,2\nadded,20261110,1\n',
    'trips.txt':
      'route_id,service_id,trip_id,block_id,direction_id,trip_short_name,trip_headsign\nr,s,t,1,0,01,Outbound\nr,w,weekend,2,1,,Weekend\nr,removed,removed,3,0,,Removed\nr,added,added,4,0,,Added\n',
    'stop_times.txt':
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign\nt,25:10:00,25:10:00,b,20,\nt,24:50:00,24:50:00,a,10,Stop sign\nweekend,08:00:00,08:00:00,a,1,\nweekend,08:30:00,08:30:00,b,2,\nremoved,09:00:00,09:00:00,a,1,\nremoved,09:30:00,09:30:00,b,2,\nadded,10:00:00,10:00:00,a,1,\nadded,10:30:00,10:30:00,b,2,\n',
    'ops_locations.txt': `ops_location_id,ops_location_name,ops_location_lat,ops_location_lon\nyard,${name} Yard,37,-122\n`,
    'deadheads.txt': 'deadhead_id,service_id,block_id\nd,s,1\n',
    'deadhead_times.txt':
      'deadhead_id,arrival_time,departure_time,ops_location_id,stop_id,location_sequence\nd,23:30:00,23:30:00,,a,2\nd,23:00:00,23:00:00,yard,,1\n',
  }
  for (const [file, content] of Object.entries(files)) {
    await writeFile(join(feed, file), content)
  }
  return {
    root,
    config: {
      agencies: [{ agency_key: name, path: feed }],
      date: '20261110',
      verbose: false,
      outputPath: join(root, 'output'),
    },
  }
}

async function rows(config) {
  const path = await gtfsToBlocks(config)
  assert.equal(path, join(config.outputPath, 'blocks.csv'))
  return (await readFile(path, 'utf8'))
    .trimEnd()
    .split('\n')
    .map((line) => line.split(','))
}

test('in-memory export preserves columns, date-range selection, exceptions, order and ODS fallbacks', async (t) => {
  const { config } = await fixture(t)
  const result = await rows(config)
  assert.equal(result.length, 5)
  assert.equal(result[0].length, 14)
  assert.deepEqual(result.slice(1), [
    [
      '1',
      'r',
      'North Route',
      't',
      '01',
      '0',
      'Mon-Fri',
      'North A',
      'North B',
      '00:50:00',
      '01:10:00',
      'Outbound',
      'Stop sign',
      'false',
    ],
    [
      '1',
      '',
      '',
      'd',
      '',
      '',
      'Mon-Fri',
      'North Yard',
      'North A',
      '23:00:00',
      '23:30:00',
      '',
      '',
      'true',
    ],
    [
      '2',
      'r',
      'North Route',
      'weekend',
      '',
      '1',
      'Sat-Sun',
      'North A',
      'North B',
      '08:00:00',
      '08:30:00',
      'Weekend',
      '',
      'false',
    ],
    [
      '4',
      'r',
      'North Route',
      'added',
      '',
      '0',
      '',
      'North A',
      'North B',
      '10:00:00',
      '10:30:00',
      'Added',
      '',
      'false',
    ],
  ])
  assert.equal((await rows({ ...config, includeDeadheads: false })).length, 4)
})

test('overlapping IDs stay source-scoped through all lookups and persistent reopen', async (t) => {
  const north = await fixture(t)
  const south = await fixture(t, 'South')
  const config = {
    ...north.config,
    agencies: [...north.config.agencies, ...south.config.agencies],
    sqlitePath: join(north.root, 'v5.sqlite'),
  }
  const imported = await rows(config)
  assert.equal(imported.length, 9)
  for (const name of ['North', 'South']) {
    const trips = imported.slice(1).filter((row) => row[2] === `${name} Route`)
    assert.equal(trips.length, 3)
    assert.ok(
      trips.every((row) => row[7] === `${name} A` && row[8] === `${name} B`),
    )
    assert.ok(
      imported.some(
        (row) => row[7] === `${name} Yard` && row[8] === `${name} A`,
      ),
    )
  }
  assert.deepEqual(await rows({ ...config, skipImport: true }), imported)
  const onlySouth = await rows({
    ...config,
    agencies: south.config.agencies,
    skipImport: true,
  })
  assert.equal(onlySouth.length, 5)
  assert.ok(onlySouth.slice(1).every((row) => row[7].startsWith('South')))
})

test('CLI imports and reopens with the existing configPath and skipImport flags', async (t) => {
  const { config, root } = await fixture(t)
  const path = join(root, 'settings.json')
  await writeFile(
    path,
    JSON.stringify({ ...config, sqlitePath: join(root, 'v5.sqlite') }),
  )
  execFileSync(process.execPath, [
    'dist/bin/gtfs-to-blocks.js',
    '--configPath',
    path,
  ])
  const before = await readFile(join(config.outputPath, 'blocks.csv'), 'utf8')
  execFileSync(process.execPath, [
    'dist/bin/gtfs-to-blocks.js',
    '-c',
    path,
    '-s',
  ])
  assert.equal(
    await readFile(join(config.outputPath, 'blocks.csv'), 'utf8'),
    before,
  )
})

test('owned instances close after success, import failure and output failure', async (t) => {
  const { config, root } = await fixture(t)
  const closed = []
  const original = Gtfs.prototype.close
  t.mock.method(Gtfs.prototype, 'close', async function () {
    await original.call(this)
    closed.push(this.isClosed)
  })
  await rows(config)
  await assert.rejects(
    gtfsToBlocks({
      ...config,
      agencies: [{ agency_key: 'bad', path: join(root, 'missing') }],
    }),
  )
  await assert.rejects(
    gtfsToBlocks({ ...config, overwriteExistingFiles: false }),
    /not empty/,
  )
  assert.deepEqual(closed, [true, true, true])
})

test('unsuccessful import results cannot publish output', async (t) => {
  const { config } = await fixture(t)
  t.mock.method(Gtfs.prototype, 'import', async () => ({
    success: false,
    errors: [{ message: 'failed source' }],
  }))
  await assert.rejects(
    gtfsToBlocks(config),
    /GTFS import failed: failed source/,
  )
  await assert.rejects(readFile(join(config.outputPath, 'blocks.csv')), {
    code: 'ENOENT',
  })
})

test('rejects removed options, ambiguous sources and in-memory skipImport', async (t) => {
  const { config } = await fixture(t)
  await assert.rejects(
    gtfsToBlocks({ ...config, ignoreErrors: true }),
    /Unsupported configuration option: ignoreErrors/,
  )
  await assert.rejects(
    gtfsToBlocks({
      ...config,
      agencies: [{ ...config.agencies[0], prefix: 'old' }],
    }),
    /Unsupported agency option: prefix/,
  )
  await assert.rejects(
    gtfsToBlocks({
      ...config,
      agencies: [...config.agencies, ...config.agencies],
    }),
    /unique, stable/,
  )
  await assert.rejects(
    gtfsToBlocks({ ...config, skipImport: true }),
    /persistent v5/,
  )
})

test('v4-shaped databases are rejected without replacing their rows', async (t) => {
  const { config, root } = await fixture(t)
  const sqlitePath = join(root, 'v4.sqlite')
  const db = openSqliteDatabase({ path: sqlitePath })
  db.exec(
    "CREATE TABLE routes (route_id TEXT PRIMARY KEY); INSERT INTO routes VALUES ('rollback')",
  )
  closeSqliteDatabase(db)
  await assert.rejects(gtfsToBlocks({ ...config, sqlitePath }))
  const reopened = openSqliteDatabase({ path: sqlitePath })
  try {
    assert.deepEqual(reopened.prepare('SELECT * FROM routes').all(), [
      { route_id: 'rollback' },
    ])
  } finally {
    closeSqliteDatabase(reopened)
  }
})

test('calendar removals affect only their source, even with overlapping service IDs', async (t) => {
  const north = await fixture(t)
  const south = await fixture(t, 'South')
  await writeFile(
    join(south.config.agencies[0].path, 'calendar_dates.txt'),
    'service_id,date,exception_type\ns,20261110,2\nremoved,20261110,2\nadded,20261110,1\n',
  )
  const result = await rows({
    ...north.config,
    agencies: [...north.config.agencies, ...south.config.agencies],
  })
  assert.equal(result.length, 7)
  assert.ok(result.some((row) => row[3] === 't' && row[2] === 'North Route'))
  assert.ok(!result.some((row) => row[3] === 't' && row[2] === 'South Route'))
  assert.ok(!result.some((row) => row[7] === 'South Yard'))
})
