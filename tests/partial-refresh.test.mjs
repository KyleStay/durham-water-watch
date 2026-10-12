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
  await writeFile(resolve(fixture, 'public/data/dashboard.json'), JSON.stringify(original));
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
  assert.equal(after.refreshReport.length, 13);
  assert.equal(after.refreshReport.find(row => row.key === 'supply.total').previousValue, original.supply.total.value);
  assert.match(after.refreshReport.find(row => row.key === 'streamflow.little').reason, /0208521324/);
  const history = JSON.parse(await readFile(resolve(fixture, 'public/data/history.json')));
  assert.equal(history.days.find(day => day.date === '2026-10-08').values.supply.total, 156);
  assert.equal(history.days.find(day => day.date === '2026-10-12').values.supply.total, null);
});
