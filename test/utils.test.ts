import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DateTime, Settings } from 'luxon'
import { sortBy } from 'lodash-es'
import { fromGTFSTime, setDefaultConfig } from '../src/lib/utils.ts'

test('default configuration uses the local date and preserves overrides', () => {
  assert.equal(setDefaultConfig({}).date, DateTime.local().toFormat('yyyyMMdd'))
  assert.equal(setDefaultConfig({}).timeFormat, 'HH:mm:ss')
  assert.equal(setDefaultConfig({ date: '20260505' }).date, '20260505')
})

test('GTFS times preserve clock values and wrap hours beyond midnight', () => {
  for (const [input, expected] of [
    ['00:00:00', '00:00:00'],
    ['7:05:09', '07:05:09'],
    ['23:59:59', '23:59:59'],
    ['24:00:00', '00:00:00'],
    ['25:14:30', '01:14:30'],
    ['49:14:30', '01:14:30'],
  ]) {
    assert.equal(fromGTFSTime(input).toFormat('HH:mm:ss'), expected)
  }
})

test('custom time formats use Luxon tokens', () => {
  assert.equal(fromGTFSTime('13:14:30').toFormat('h:mm a'), '1:14 PM')
  assert.equal(fromGTFSTime('24:00:00').toFormat('h:mm a'), '12:00 AM')
})

test('missing GTFS times retain the existing midnight fallback', () => {
  assert.equal(fromGTFSTime(null).toFormat('HH:mm:ss'), '00:00:00')
})

test('clock times remain stable on a local DST transition date', () => {
  const originalNow = Settings.now
  const originalZone = Settings.defaultZone
  try {
    Settings.defaultZone = 'America/Los_Angeles'
    Settings.now = () => Date.UTC(2026, 2, 8, 12)
    assert.equal(fromGTFSTime('02:30:00').toFormat('HH:mm:ss'), '02:30:00')
    assert.equal(fromGTFSTime('26:30:00').toFormat('HH:mm:ss'), '02:30:00')
  } finally {
    Settings.now = originalNow
    Settings.defaultZone = originalZone
  }
})

test('Luxon clock times retain the existing wrapped-time sort order', () => {
  assert.deepEqual(sortBy(['23:00:00', '25:00:00', '07:00:00'], fromGTFSTime), [
    '25:00:00',
    '07:00:00',
    '23:00:00',
  ])
})
