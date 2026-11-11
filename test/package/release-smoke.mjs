import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, symlink, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { fixture } from '../helpers/fixture.mjs';

test('packed ESM entry, types, CLI and samples', async (t) => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const temp = await mkdtemp(path.join(tmpdir(), 'blocks-package-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const packed = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        '--json',
        '--cache',
        path.join(temp, 'npm-cache'),
        '--pack-destination',
        temp,
        '--ignore-scripts',
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  );
  const [pack] = Object.values(packed);
  const installed = path.join(temp, 'node_modules', 'gtfs-to-blocks');
  await mkdir(installed, { recursive: true });
  execFileSync('tar', [
    '-xzf',
    path.join(temp, pack.filename),
    '--strip-components=1',
    '-C',
    installed,
  ]);
  await symlink(
    path.join(root, 'node_modules'),
    path.join(installed, 'node_modules'),
    'dir',
  );
  for (const file of [
    'LICENSE.txt',
    'CITATION.cff',
    'dist/index.d.ts',
    'config-sample.json',
    'config-sample-full.json',
  ]) {
    assert.ok(await readFile(path.join(installed, file)));
  }
  assert.ok(
    pack.files.every(
      (file) =>
        !/^config.*\.json$/.test(file.path) ||
        ['config-sample.json', 'config-sample-full.json'].includes(file.path),
    ),
  );
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {exportBlocks} from 'gtfs-to-blocks';if(typeof exportBlocks!=='function') { process.exit(1); }",
    ],
    { cwd: temp },
  );
  const { config } = await fixture(t);
  const cli = path.join(installed, 'dist/bin/gtfs-to-blocks.js');
  assert.equal(
    execFileSync(process.execPath, [cli, '-v'], { encoding: 'utf8' }).trim(),
    pack.version,
  );
  execFileSync(
    process.execPath,
    [
      cli,
      '--input',
      config.sources[0].schedule.path,
      '--service-date',
      '20261110',
      '--output',
      path.join(temp, 'out'),
      '--log-level',
      'silent',
    ],
    { cwd: temp },
  );
  const csv = await readFile(path.join(temp, 'out/blocks.csv'), 'utf8');
  assert.equal(csv.trimEnd().split('\n').length, 4);
  assert.match(csv, /24:50:00,25:10:00/);
  assert.ok(
    !pack.files.some((file) => /^(test|src|node_modules)\//.test(file.path)),
  );
});
