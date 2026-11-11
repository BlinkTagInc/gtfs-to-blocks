import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers/fixture.mjs';
import { execFileSync } from 'node:child_process';
import { Gtfs } from 'gtfs';
import { openSqliteDatabase, closeSqliteDatabase } from 'gtfs/sqlite';
import { exportBlocks } from '../dist/index.js';

async function rows(config) {
  const path = await exportBlocks(config);
  assert.equal(path, join(config.export.outputDirectory, 'blocks.csv'));
  return (await readFile(path, 'utf8'))
    .trimEnd()
    .split('\n')
    .map((line) => line.split(','));
}

test('active weekday service, exceptions, extended times and deadheads', async (t) => {
  const { config } = await fixture(t);
  const result = await rows(config);
  assert.equal(result.length, 4);
  assert.equal(result[0].length, 16);
  assert.deepEqual(
    result.slice(1).map((row) => [row[0], row[1], row[5], row[11], row[12]]),
    [
      ['North', 's', 'd', '23:00:00', '23:30:00'],
      ['North', 's', 't', '24:50:00', '25:10:00'],
      ['North', 'added', 'added', '10:00:00', '10:30:00'],
    ],
  );
  assert.equal(
    (await rows({ ...config, export: { ...config.export, deadheads: false } }))
      .length,
    3,
  );
  const weekend = await rows({
    ...config,
    export: { ...config.export, serviceDate: 20261114 },
  });
  assert.ok(weekend.some((row) => row[5] === 'weekend'));
  assert.ok(!weekend.some((row) => row[5] === 't'));
});

test('source collisions, mixed import/reuse and database-only exports', async (t) => {
  const north = await fixture(t);
  const south = await fixture(t, 'South');
  const config = {
    ...north.config,
    database: { path: join(north.root, 'gtfs.sqlite') },
    sources: [...north.config.sources, ...south.config.sources],
  };
  const imported = await rows(config);
  assert.equal(imported.length, 7);
  for (const row of imported.slice(1)) {
    assert.ok(row[9].startsWith(row[0]));
    assert.ok(row[10].startsWith(row[0]));
  }
  assert.deepEqual(
    await rows({
      ...config,
      sources: [{ sourceId: 'North' }, { sourceId: 'South' }],
    }),
    imported,
  );
  assert.deepEqual(
    await rows({
      ...config,
      sources: [{ sourceId: 'North' }, south.config.sources[0]],
    }),
    imported,
  );
  const selected = await rows({
    ...config,
    sources: undefined,
    export: { ...config.export, sourceId: 'South' },
  });
  assert.equal(selected.length, 4);
  assert.ok(selected.slice(1).every((row) => row[0] === 'South'));
});

test('safe overwrite preserves other files and previous output on failure', async (t) => {
  const { config } = await fixture(t);
  await rows(config);
  const file = join(config.export.outputDirectory, 'blocks.csv');
  const before = await readFile(file, 'utf8');
  await writeFile(join(config.export.outputDirectory, 'keep.txt'), 'keep');
  await assert.rejects(
    exportBlocks({ ...config, export: { ...config.export, overwrite: false } }),
    { code: 'EEXIST' },
  );
  await writeFile(
    join(config.sources[0].schedule.path, 'frequencies.txt'),
    'trip_id,start_time,end_time,headway_secs\nt,06:00:00,10:00:00,600\n',
  );
  await assert.rejects(exportBlocks(config), /Frequency-based/);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.equal(
    await readFile(join(config.export.outputDirectory, 'keep.txt'), 'utf8'),
    'keep',
  );
});

test('instances close on success and failed import', async (t) => {
  const { config, root } = await fixture(t);
  const closed = [];
  const original = Gtfs.prototype.close;
  t.mock.method(Gtfs.prototype, 'close', async function () {
    await original.call(this);
    closed.push(this.isClosed);
  });
  await rows(config);
  await assert.rejects(
    exportBlocks({
      ...config,
      sources: [{ schedule: { path: join(root, 'missing') } }],
    }),
  );
  assert.deepEqual(closed, [true, true]);
});

test('unsuccessful import cannot publish output', async (t) => {
  const { config } = await fixture(t);
  t.mock.method(Gtfs.prototype, 'import', async () => ({
    success: false,
    errors: [{ message: 'failed source' }],
  }));
  await assert.rejects(exportBlocks(config), /failed source/);
  await assert.rejects(
    readFile(join(config.export.outputDirectory, 'blocks.csv')),
    { code: 'ENOENT' },
  );
});

test('rejects legacy config, malformed dates and duplicate sources', async (t) => {
  const { config } = await fixture(t);
  await assert.rejects(
    exportBlocks({ ...config, agencies: [] }),
    /Unknown configuration option: agencies/,
  );
  await assert.rejects(
    exportBlocks({
      ...config,
      sources: [...config.sources, ...config.sources],
    }),
    /distinct/,
  );
  for (const serviceDate of ['20261110', 20260230, 20261301, 0]) {
    await assert.rejects(
      exportBlocks({ ...config, export: { ...config.export, serviceDate } }),
      /real numeric/,
    );
  }
  await assert.rejects(
    exportBlocks({
      ...config,
      export: { ...config.export, includeDeadheads: true },
    }),
    /Unknown export option/,
  );
  await assert.rejects(
    exportBlocks({ database: { path: ':memory:' } }),
    /persistent database/,
  );
});

test('calendar removals remain scoped to their source', async (t) => {
  const north = await fixture(t);
  const south = await fixture(t, 'South');
  await writeFile(
    join(south.config.sources[0].schedule.path, 'calendar_dates.txt'),
    'service_id,date,exception_type\ns,20261110,2\nremoved,20261110,2\nadded,20261110,1\n',
  );
  const result = await rows({
    ...north.config,
    sources: [...north.config.sources, ...south.config.sources],
  });
  assert.equal(result.length, 5);
  assert.ok(!result.some((row) => row[0] === 'South' && row[1] === 's'));
});

test('v4 databases are rejected without replacing their rows', async (t) => {
  const { config, root } = await fixture(t);
  const path = join(root, 'old.sqlite');
  const db = openSqliteDatabase({ path });
  db.exec(
    "CREATE TABLE routes (route_id TEXT PRIMARY KEY); INSERT INTO routes VALUES ('rollback')",
  );
  closeSqliteDatabase(db);
  await assert.rejects(exportBlocks({ ...config, database: { path } }));
  const reopened = openSqliteDatabase({ path });
  try {
    assert.deepEqual(reopened.prepare('SELECT * FROM routes').all(), [
      { route_id: 'rollback' },
    ]);
  } finally {
    closeSqliteDatabase(reopened);
  }
});

test('CLI config, direct input, help, version and errors', async (t) => {
  const { config, root } = await fixture(t);
  const cli = ['dist/bin/gtfs-to-blocks.js'];
  const run = (args) =>
    execFileSync(process.execPath, [...cli, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  const file = join(root, 'config.json');
  await writeFile(file, JSON.stringify(config));
  assert.equal(run(['--config', file]), '');
  assert.match(run(['--help']), /--service-date/);
  assert.match(run(['--version']), /^\d+\.\d+\.\d+/);
  assert.equal(
    run([
      '--config',
      file,
      '--input',
      config.sources[0].schedule.path,
      '--source-id',
      'Direct',
      '--overwrite',
      '--log-level',
      'silent',
    ]),
    '',
  );
  assert.throws(() => run(['--configPath', file]), /Unknown option/);
  assert.throws(() => run(['--config', join(root, 'missing.json')]), /ENOENT/);
});

test('no active service produces a header-only CSV', async (t) => {
  const { config } = await fixture(t);
  assert.equal(
    (
      await rows({
        ...config,
        export: { ...config.export, serviceDate: 20270101 },
      })
    ).length,
    1,
  );
});

test('operations locations cannot collide with passenger stops', async (t) => {
  const { config } = await fixture(t);
  const feed = config.sources[0].schedule.path;
  const stops = await readFile(join(feed, 'stops.txt'), 'utf8');
  await writeFile(
    join(feed, 'stops.txt'),
    stops + 'yard,Passenger Yard,37,-122\n',
  );
  const result = await rows(config);
  assert.equal(result.find((row) => row[5] === 'd')[9], 'North Yard');
});

test('untimed intermediate stops remain blank and CSV fields are escaped', async (t) => {
  const { config } = await fixture(t);
  const feed = config.sources[0].schedule.path;
  const times = await readFile(join(feed, 'stop_times.txt'), 'utf8');
  await writeFile(join(feed, 'stop_times.txt'), times + 't,,,middle,15,\n');
  const stops = await readFile(join(feed, 'stops.txt'), 'utf8');
  await writeFile(
    join(feed, 'stops.txt'),
    stops + 'middle,"Middle, Station",37,-122\n',
  );
  const file = await exportBlocks(config);
  const csv = await readFile(file, 'utf8');
  assert.match(csv, /North A,"Middle, Station",24:50:00,,/);
  assert.match(csv, /"Middle, Station",North B,,25:10:00,/);
});

test('default overwrite refuses an existing CSV, including concurrent exports', async (t) => {
  const { config } = await fixture(t);
  delete config.export.overwrite;
  const results = await Promise.allSettled([
    exportBlocks(config),
    exportBlocks(config),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(
    results.find((result) => result.status === 'rejected').reason.code,
    'EEXIST',
  );
});

test('reporting uses node-GTFS events and respects silent', async (t) => {
  const { config } = await fixture(t);
  const events = [];
  await exportBlocks({
    ...config,
    reporting: { level: 'info', reporter: (event) => events.push(event) },
  });
  assert.ok(
    events.some((event) => event.message?.includes('generated 3 segments')),
  );
  events.length = 0;
  await exportBlocks({
    ...config,
    reporting: { level: 'silent', reporter: (event) => events.push(event) },
  });
  assert.equal(events.length, 0);
});

test('empty route short names fall back to the long name', async (t) => {
  const { config } = await fixture(t);
  await writeFile(
    join(config.sources[0].schedule.path, 'routes.txt'),
    'route_id,agency_id,route_short_name,route_long_name,route_type\nr,a,,Long Route,3\n',
  );
  const result = await rows(config);
  assert.equal(result.find((row) => row[5] === 't')[4], 'Long Route');
});

test('both documented samples run with local Schedule sources', async (t) => {
  const { config, root } = await fixture(t);
  for (const sample of ['config-sample.json', 'config-sample-full.json']) {
    const settings = JSON.parse(await readFile(sample, 'utf8'));
    settings.sources = settings.sources.map((source) => ({
      ...source,
      schedule: { ...source.schedule, path: config.sources[0].schedule.path },
    }));
    settings.database = { path: join(root, sample + '.sqlite') };
    settings.reporting = { level: 'silent' };
    settings.export = {
      ...settings.export,
      serviceDate: 20261110,
      outputDirectory: join(root, sample),
    };
    assert.equal(
      (await rows(settings)).length,
      1 + settings.sources.length * 3,
    );
  }
});
