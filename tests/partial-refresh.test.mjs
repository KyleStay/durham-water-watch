import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { cachePageEvidence } from '../scripts/official-page-evidence.mjs';
import { cityPages } from '../scripts/city-readings.mjs';
const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

test('all-source refresh retains independent successful stations and lakes, and uses validated City evidence', async (t) => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'durham-partial-refresh-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await cp(resolve(root, 'scripts'), resolve(fixture, 'scripts'), { recursive: true });
  await mkdir(resolve(fixture, 'public/data'), { recursive: true });
  await mkdir(resolve(fixture, 'data'));
  for (const file of ['dashboard.json', 'history.json', 'streamflow-history.json']) {
    await cp(resolve(root, 'public/data', file), resolve(fixture, 'public/data', file));
  }
  await writeFile(resolve(fixture, 'data/quarantine.json'), '[]');
  const original = JSON.parse(await readFile(resolve(fixture, 'public/data/dashboard.json')));
  for (const metric of [original.stage, ...Object.values(original.supply), ...Object.values(original.reservoirs), ...Object.values(original.streamflow)]) {
    metric.observedAt = '2020-01-01';
    metric.verifiedAt = '2020-01-01T12:00:00Z';
  }
  Object.assign(original.supply.accessible, {value:96}); Object.assign(original.supply.belowIntakes, {value:44});
  Object.assign(original.supply.quarry, {value:20}); Object.assign(original.supply.total, {value:160});
  original.reservoirs.michie.value=331.57; original.reservoirs.little.value=339.66;
  original.streamflow.flat.value=1.58; original.streamflow.little.value=0.81;
  await writeFile(resolve(fixture, 'public/data/dashboard.json'), JSON.stringify(original));
  const initialComparison=JSON.parse(await readFile(resolve(fixture,'public/data/streamflow-history.json')));
  for(const station of Object.values(initialComparison.stations)) delete station.tenYearAverage;
  await writeFile(resolve(fixture,'public/data/streamflow-history.json'),JSON.stringify(initialComparison));
  execFileSync('git', ['init', '--quiet'], { cwd: fixture });
  await cachePageEvidence(resolve(fixture, '.git'), { pages: [
    { url: cityPages.stage, retrievedAt: '2026-10-12T09:59:00Z', text: 'Durham Saves Water. Stage 2 in Effect Effective June 15, 2026. Durham is under a Stage 2 Water Shortage Response.' },
    { url: cityPages.supply, retrievedAt: '2026-10-12T09:59:00Z', text: 'Days of Supply. As of October 8, 2026. Days of supply of easily accessible water remaining: 92. Days of less accessible water below the intake structures remaining: 45. Days remaining in Teer Quarry (emergency storage): 19. Total days of supply: 156.' },
  ] }, new Date('2026-10-12T10:00:00Z'));
  const bootstrap = resolve(fixture, 'mock-fetch.mjs');
  await writeFile(bootstrap, `
const NativeDate = Date;
globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-12T10:00:00Z'])); } static now() { return new NativeDate('2026-10-12T10:00:00Z').getTime(); } };
globalThis.fetch = async (url) => {
  let body = '{}', status = 403;
  if (url.includes('/nwis/iv/')) { status = 200; body = JSON.stringify({value:{timeSeries:[{ sourceInfo:{siteCode:[{value:'02085500'}]}, variable:{variableCode:[{value:'00060'}],unit:{unitCode:'ft3/s'}}, values:[{value:[{value:'2.5',dateTime:'2026-10-12T05:45:00-04:00'}]}] }]}}); }
  if (url.includes('/nwis/dv/') && url.includes('sites=02085500')) {
    const decade=url.includes('startDT=2016-01-01');
    const values=decade ? Array.from({length:10},(_,i)=>({value:'10',dateTime:(2016+i)+'-01-01T00:00:00',qualifiers:['A']})) : [{value:'1',dateTime:'2026-10-11T00:00:00',qualifiers:['P']}];
    status=200; body=JSON.stringify({value:{timeSeries:[{name:'USGS:02085500:00060:00003',sourceInfo:{siteCode:[{value:'02085500'}]},variable:{variableCode:[{value:'00060'}],unit:{unitCode:'ft3/s'}},values:[{value:values}]}]}});
  }
  if (url.includes('/nwis/stat/') && url.includes('sites=02085500')) {
    // Make the main comparison finish after the independently fetched decade.
    await new Promise(resolve=>setTimeout(resolve,50));
    status=200;
    const tab=String.fromCharCode(9), newline=String.fromCharCode(10);
    const lines=[['agency_cd','site_no','month_nu','day_nu','mean_va','count_nu','begin_yr','end_yr'].join(tab),'5s'+tab+'15s'];
    for(let i=0;i<366;i++) {const date=new NativeDate(Date.UTC(2000,0,1+i));lines.push(['USGS','02085500',date.getUTCMonth()+1,date.getUTCDate(),10,36,1990,2025].join(tab));}
    body=lines.join(newline);
  }
  if (url.includes('/1225/Lake-Levels')) { status = 200; body = 'Current Conditions October 8, 2026. Lake Michie Elevation: 330.96 feet. Lake Michie is full at 341.00 feet.'; }
  const response = new Response(body, {status});
  Object.defineProperty(response, 'url', {value: url});
  return response;
};`);
  await run(process.execPath, ['--import', bootstrap, 'scripts/refresh-data.mjs', '--all'], { cwd: fixture });
  const after = JSON.parse(await readFile(resolve(fixture, 'public/data/dashboard.json')));
  assert.equal(after.streamflow.flat.value, 2.5);
  assert.equal(after.streamflow.flat.retrievalStatus, 'verified');
  assert.equal(after.streamflow.little.value, original.streamflow.little.value);
  assert.equal(after.streamflow.little.retrievalStatus, 'failed');
  assert.equal(after.reservoirs.michie.value, 330.96);
  assert.equal(after.reservoirs.michie.retrievalStatus, 'verified');
  assert.equal(after.reservoirs.little.value, original.reservoirs.little.value);
  assert.equal(after.reservoirs.little.retrievalStatus, 'failed');
  assert.equal(after.supply.total.value, 156);
  assert.equal(after.supply.total.retrievalMethod, 'official-page-text');
  assert.equal(after.stage.retrievalStatus, 'verified');
  assert.equal(after.refreshReport.length, 15);
  const refreshedComparison=JSON.parse(await readFile(resolve(fixture,'public/data/streamflow-history.json')));
  assert.equal(refreshedComparison.stations.flat.days.length,365);
  assert.equal(refreshedComparison.stations.flat.tenYearAverage.status,'fresh');
  assert.equal(refreshedComparison.stations.flat.tenYearAverage.days.find(day=>day.monthDay==='01-01').value,10);
  assert.equal(refreshedComparison.stations.little.tenYearAverage.status,'unavailable');
  assert.equal(after.refreshReport.find(row => row.key === 'supply.total').previousValue, original.supply.total.value);
  assert.match(after.refreshReport.find(row => row.key === 'streamflow.little').reason, /0208521324/);
  const history = JSON.parse(await readFile(resolve(fixture, 'public/data/history.json')));
  assert.equal(history.days.find(day => day.date === '2026-10-08').values.supply.total, 156);
  assert.equal(history.days.find(day => day.date === '2026-10-12').values.supply.total, null);
});
