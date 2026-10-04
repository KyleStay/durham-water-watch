import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';

const root = resolve(import.meta.dirname, '..');
await mkdir(join(root, 'outputs'), { recursive: true });
const temporary = await mkdtemp(join(root, 'outputs/hydration-'));
let WaterWatch;
try {
  await build({ entryPoints: [join(root, 'app/water-watch.tsx')], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: join(temporary, 'component.mjs'), logLevel: 'silent' });
  WaterWatch = (await import(pathToFileURL(join(temporary, 'component.mjs')).href)).default;
} finally { await rm(temporary, { recursive: true, force: true }); }
const snapshot = JSON.parse(await readFile(join(root, 'public/data/dashboard.json'), 'utf8'));

test('stage changes render appropriate guidance without requiring Stage 2 content', () => {
  for (const value of [1, 2, 3, 4, null]) {
    const data = structuredClone(snapshot);
    data.stage.value = value;
    const html = renderToString(createElement(WaterWatch, { snapshot: data }));
    if (value === 2) {
      assert.match(html, /Illustrative scenario explorer/);
      assert.match(html, /No landscape spray irrigation/);
    } else {
      assert.doesNotMatch(html, /Illustrative scenario explorer|No landscape spray irrigation/);
      assert.match(html, /complete official rules control/);
    }
  }
});

for (const [endDate, startLabel, endLabel] of [
  ['2026-10-02', 'Sep 3', 'Oct 2'],
  ['2027-01-01', 'Dec 3', 'Jan 1'],
  ['2028-02-29', 'Jan 31', 'Feb 29'],
]) test(`hydration, period controls and Spanish work for ${endDate}`, async (t) => {
  const data = structuredClone(snapshot);
  data.generatedAt = `${endDate}T12:00:00Z`;
  data.streamflow.flat.value = 12.5;
  data.streamflow.flat.observedAt = data.generatedAt;
  data.streamflow.flat.retrievalStatus = 'verified';
  data.streamflow.flat.validationResult = 'accepted';
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(`${endDate}T16:00:00Z`) });
  // Pass dated fixtures explicitly. The checked-in ledger grows every day and
  // must not move the window (or year button) expected by this interaction test.
  const history = { schemaVersion: 3, days: [{ date: endDate, capturedAt: data.generatedAt, values: {
    stage: 2, drought: 'D1', supply: { accessible: null, belowIntakes: null, quarry: null, total: null },
    reservoirs: { michie: null, little: null }, streamflow: { flat: null, little: null },
  } }] };
  const comparison = { schemaVersion: 1, year: Number(endDate.slice(0, 4)), updatedAt: data.generatedAt,
    stations: Object.fromEntries(['flat', 'little'].map(key => [key, {
      site: key, name: key, status: 'unavailable', sourceUrl: 'https://example.test/', historicalPeriod: null, days: [],
    }])) };
  const element = createElement(WaterWatch, { snapshot: data, history, comparison });
  const dom = new JSDOM(`<div id="root">${renderToString(element)}</div>`, { url: 'https://example.test/durham-water-watch/' });
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const errors = [];
  let hydrated;
  try {
    const container = document.getElementById('root');
    await act(async () => { hydrated = hydrateRoot(container, element, { onRecoverableError: error => errors.push(error.message) }); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.deepEqual(errors, []);
    assert.ok(document.querySelector('svg title').textContent.includes('Lake Michie'));
    await act(async () => { [...document.querySelectorAll('.period-controls button')].find(b => b.textContent === '30 days').click(); });
    assert.ok(document.querySelector('.period-note').textContent.includes(`${startLabel} – ${endLabel}`));
    assert.equal(document.querySelector('.period-controls button').getAttribute('aria-pressed'), 'true');
    await act(async () => { [...document.querySelectorAll('.period-controls button')].find(b => b.textContent === endDate.slice(0, 4)).click(); });
    assert.match(document.querySelector('.period-note').textContent, /Jan 1.*Dec 31/);
    assert.ok(document.querySelector('.flow-card').querySelector('.status.stale'), 'A reading older than three hours must display stale after hydration');
    assert.ok(document.querySelector('.geographic-map[role="region"]'), 'The map must remain an accessible interactive region');
    await act(async () => { document.querySelector('button[aria-expanded="false"]').click(); });
    assert.ok(document.querySelector('.map-expanded'));
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })); });
    assert.equal(document.querySelector('.map-expanded'), null);
    assert.equal(document.body.style.overflow, '');
    await act(async () => { document.querySelector('button[aria-label="Cambiar a español"]').click(); });
    assert.equal(document.documentElement.lang, 'es');
    assert.match(container.textContent, /Instantánea publicada/);
    assert.doesNotMatch(container.textContent, /corrections@example.org|every 30 minutes/);
    assert.deepEqual(errors, []);
  } finally {
    if (hydrated) await act(async () => hydrated.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
