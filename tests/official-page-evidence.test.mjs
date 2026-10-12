import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { cachePageEvidence, evidencePath, readPageEvidence } from '../scripts/official-page-evidence.mjs';
import { cityPages, citySupply, cityReservoir, officialDate } from '../scripts/city-readings.mjs';

const now = new Date('2026-10-12T10:00:00Z');
const text = 'Days of Supply. As of October 8, 2026. Days of supply of easily accessible water remaining: 92. Days of less accessible water below the intake structures remaining: 45. Days remaining in Teer Quarry (emergency storage): 19. Total days of supply: 156.';

test('official page evidence preserves source text, validates freshness and refuses reuse or tampering', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'durham-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = { pages: [{ url: cityPages.supply, retrievedAt: now.toISOString(), text }] };
  await cachePageEvidence(directory, input, now);
  const page = await readPageEvidence(directory, cityPages.supply, now);
  assert.equal(page.text, text);
  assert.equal(citySupply(page.text).values.total, 156);
  assert.equal(citySupply(page.text).observedAt, '2026-10-08');
  assert.equal(await readPageEvidence(directory, cityPages.stage, now), null);
  await assert.rejects(cachePageEvidence(directory, input, now), { code: 'EEXIST' });
  await assert.rejects(readPageEvidence(directory, cityPages.supply, new Date('2026-10-12T12:01:00Z')), /retrieval time/);
  const path = evidencePath(directory, now), record = JSON.parse(await readFile(path));
  record.pages[0].text = text.replace('156', '999');
  await writeFile(path, JSON.stringify(record));
  await assert.rejects(readPageEvidence(directory, cityPages.supply, now), /content/);
});

test('evidence refuses other hosts, earlier Eastern dates and inconsistent City totals', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'durham-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const page of [
    { url: 'https://example.test/1214/Current-Data', retrievedAt: now.toISOString(), text },
    { url: cityPages.supply, retrievedAt: '2026-10-12T03:59:00Z', text },
  ]) await assert.rejects(cachePageEvidence(directory, { pages: [page] }, now), /invalid source/);
  assert.throws(() => citySupply(text.replace('156', '999')), /inconsistent/);
  assert.throws(() => officialDate('February 31, 2026'), /did not validate/);
  assert.throws(() => cityReservoir('Current Conditions October 8, 2026. Lake Michie Elevation: 330.96 feet. Lake Michie is full at 355 feet.', 'michie'), /full-pool/);
});
