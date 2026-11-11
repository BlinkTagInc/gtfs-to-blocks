import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTime, serviceSeconds } from '../src/blocks/csv.ts';

test('missing times are blank and extended hours sort chronologically', () => {
  assert.equal(formatTime(null), '');
  assert.equal(formatTime(''), '');
  assert.equal(formatTime('25:14:30'), '25:14:30');
  assert.equal(formatTime('7:05:09'), '07:05:09');
  assert.equal(formatTime('25:14:30', 'h:mm a'), '1:14 AM');
  assert.deepEqual(
    ['25:00:00', '23:00:00', '07:00:00'].sort(
      (a, b) => serviceSeconds(a) - serviceSeconds(b),
    ),
    ['07:00:00', '23:00:00', '25:00:00'],
  );
  assert.throws(() => formatTime('12:60:00'), /Invalid GTFS time/);
});
