import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export async function fixture(t, name = 'North') {
  const root = await mkdtemp(join(tmpdir(), 'blocks-v5-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const feed = join(root, 'feed');
  await mkdir(feed);
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
  };
  for (const [file, content] of Object.entries(files)) {
    await writeFile(join(feed, file), content);
  }
  return {
    root,
    config: {
      sources: [{ sourceId: name, schedule: { path: feed } }],
      reporting: { level: 'silent' },
      export: {
        serviceDate: 20261110,
        outputDirectory: join(root, 'output'),
        overwrite: true,
      },
    },
  };
}
