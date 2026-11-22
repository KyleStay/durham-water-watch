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

test('stage targets and contributing readings share one chart and county drought uses a separate step chart', () => {
  const data = structuredClone(snapshot);
  data.stage = { ...data.stage, value: 2, verifiedAt: data.generatedAt, retrievalStatus: 'verified', validationResult: 'accepted' };
  data.reservoirStorage = { ...data.reservoirStorage, value: 28, observedAt: '2026-11-16', retrievalStatus: 'failed' };
  const renderCharts = () => {
    const dom = new JSDOM(renderToString(createElement(WaterWatch, { snapshot: data })));
    const charts = dom.window.document.querySelector('#stage-proximity');
    assert.match(charts.querySelector('.stage-trigger-note').textContent,
      /Stage 3 forecast trigger.*10% chance.*25% combined usable reservoir storage.*8 weeks/);
    const graphs = [...charts.querySelectorAll('figure svg')];
    assert.equal(graphs.length, 1);
    for (const graph of graphs) {
      assert.ok(graph.querySelector('circle title').textContent.includes('Aug 4, 2026: 52.20'));
      assert.ok([...graph.querySelectorAll('circle title')].some((point) => point.textContent.includes('Nov 16, 2026: 28.00')));
      const dots = new Set([...graph.querySelectorAll('circle')].map(dot => `${dot.getAttribute('cx')},${dot.getAttribute('cy')}`));
      const connectors = [...graph.querySelectorAll('.chart-gap-connector')];
      assert.ok(connectors.length > 0);
      for (const connector of connectors) {
        assert.ok(dots.has(`${connector.getAttribute('x1')},${connector.getAttribute('y1')}`));
        assert.ok(dots.has(`${connector.getAttribute('x2')},${connector.getAttribute('y2')}`));
      }
    }
    assert.equal(graphs[0].querySelectorAll('line[stroke-dasharray]').length, 5);
    assert.match(graphs[0].textContent, /Accessible supply \(days\).*Weekly river flow \(ft³\/s\)/);
    assert.ok([...graphs[0].querySelectorAll("circle title")].some((point) => point.textContent.includes("Flat River")));
    const drought = dom.window.document.querySelector('#drought-trend svg');
    assert.ok(drought.querySelectorAll('circle').length >= 37);
    assert.match(drought.textContent, /Jun 9, 2026: D4/);
    assert.match(drought.querySelector('path').getAttribute('d'), /H[\d.]+V[\d.]+/);
    const content = charts.textContent;
    dom.window.close();
    return content;
  };
  const charts = renderCharts();
  assert.match(charts, /28% storage reported by Durham.*November 16, 2026.*Last known/);
  assert.match(charts, /Stage 3.*3 percentage points above.*10% chance of 25% usable storage in 8 weeks/);
  assert.match(charts, /67 percentage points below.*95% chance of 95% usable storage in 10 weeks/);
  delete data.reservoirStorage;
  const unavailable = renderCharts();
  assert.match(unavailable, /City storage reading unavailable/);
  assert.doesNotMatch(unavailable, /percentage points (above|below)/);
});

test('stage changes render appropriate guidance without requiring Stage 2 content', () => {
  for (const value of [1, 2, 3, 4, null]) {
    const data = structuredClone(snapshot);
    data.stage.value = value;
    const html = renderToString(createElement(WaterWatch, { snapshot: data }));
    const dom = new JSDOM(html);
    const guide = dom.window.document.querySelector('#restriction-levels');
    const rows = [...guide.querySelectorAll('.level-row')];
    assert.equal(rows.length, 4, 'All stages remain available regardless of the current reading');
    for (const [index, trigger] of [
      '30% chance of 45% usable storage in 12 weeks',
      '20% chance of 35% usable storage in 10 weeks',
      '10% chance of 25% usable storage in 8 weeks',
      '5% chance of 15% usable storage in 4 weeks',
    ].entries()) {
      assert.ok(rows[index].textContent.includes(trigger));
    }
    assert.match(rows[2].textContent, /Hand and drip landscape watering also stop.*container plants.*commercial plants for sale/);
    assert.match(rows[3].textContent, /Vehicle washing stops.*minimum health and safety/);
    assert.equal(dom.window.document.querySelectorAll('.drought-level-table tbody tr').length, 6);
    dom.window.close();
    if (value === 2) {
      assert.match(html, /Illustrative scenario explorer/);
      assert.match(html, /No landscape spray irrigation/);
      assert.match(html, /Hand watering and drip irrigation are allowed/);
    } else {
      assert.doesNotMatch(html, /Illustrative scenario explorer|No landscape spray irrigation/);
      assert.match(html, /complete official rules control/);
    }
  }
});

test('stale Stage 2 links to the City instead of offering stage-specific actions', () => {
  const data = structuredClone(snapshot);
  data.stage = { ...data.stage, value: 2, retrievalStatus: 'failed' };
  const dom = new JSDOM(renderToString(createElement(WaterWatch, { snapshot: data })));
  const briefing = dom.window.document.querySelector('.restriction-brief');
  assert.match(briefing.textContent, /Stage 2.*Stale.*Check the City’s current water-use rules/);
  assert.equal(briefing.querySelector('.restriction-brief-cta').href, data.stage.sourceUrl);
  assert.doesNotMatch(dom.window.document.querySelector('main').textContent, /Hand watering and drip irrigation are allowed|Stage 2 water-use rules|Illustrative scenario explorer/);
  dom.window.close();
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
    assert.ok(document.querySelector('#trends svg title').textContent.includes('Lake Michie'));
    await act(async () => { [...document.querySelectorAll('.period-controls button')].find(b => b.textContent === '30 days').click(); });
    assert.ok(document.querySelector('.period-note').textContent.includes(`${startLabel} – ${endLabel}`));
    assert.equal(document.querySelector('.period-controls button').getAttribute('aria-pressed'), 'true');
    await act(async () => { [...document.querySelectorAll('.period-controls button')].find(b => b.textContent === endDate.slice(0, 4)).click(); });
    assert.match(document.querySelector('.period-note').textContent, /Jan 1.*Dec 31/);
    assert.ok(document.querySelector('.flow-card').querySelector('.status.stale'), 'A reading older than three hours must display stale after hydration');
    const map = document.querySelector('.geographic-map[role="region"]');
    assert.ok(map, 'The map must remain an accessible interactive region');
    const mapDialog = map.closest('dialog');
    const fullScreen = mapDialog.querySelector('button[aria-expanded="false"]');
    assert.ok(mapDialog.open, 'The server-rendered map is visible inline');
    let modal = false;
    mapDialog.close = function () { this.open = false; modal = false; };
    mapDialog.showModal = function () {
      assert.equal(this.open, false, 'showModal requires a closed dialog');
      this.open = true;
      modal = true;
    };
    const rainToggle = mapDialog.querySelector('input[type="checkbox"]');
    await act(async () => { rainToggle.click(); fullScreen.focus(); fullScreen.click(); });
    assert.ok(modal);
    assert.ok(mapDialog.classList.contains('map-expanded'));
    assert.equal(document.activeElement, fullScreen);
    assert.equal(fullScreen.textContent, 'Close full screen');
    assert.equal(rainToggle.checked, false);
    assert.equal(mapDialog.querySelector('.geographic-map'), map);
    assert.equal(document.body.style.overflow, 'hidden');
    rainToggle.focus();
    assert.equal(document.activeElement, rainToggle);
    const escape = new dom.window.Event('cancel', { cancelable: true });
    await act(async () => { mapDialog.dispatchEvent(escape); });
    assert.equal(escape.defaultPrevented, true);
    assert.ok(mapDialog.open, 'Closing the modal restores the inline map');
    assert.equal(modal, false);
    assert.equal(mapDialog.classList.contains('map-expanded'), false);
    assert.equal(document.activeElement, fullScreen);
    assert.equal(fullScreen.textContent, 'Full screen');
    assert.equal(rainToggle.checked, false);
    assert.equal(mapDialog.querySelector('.geographic-map'), map);
    assert.equal(document.body.style.overflow, '');
    await act(async () => { document.querySelector('button[aria-label="Cambiar a español"]').click(); });
    assert.equal(document.documentElement.lang, 'es');
    assert.match(document.querySelector('#overview h1').textContent, /El agua de Durham/);
    assert.match(document.querySelector('.restriction-brief-cta').textContent, /reglas oficiales de Durham/);
    const menu = document.querySelector('.mobile-nav');
    const menuTrigger = menu.querySelector('summary');
    const rulesLink = menu.querySelector('a[href="#actions"]');
    assert.equal(menuTrigger.textContent, 'Secciones');
    menu.open = true;
    rulesLink.focus();
    await act(async () => { rulesLink.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    assert.equal(menu.open, false);
    assert.equal(document.activeElement, menuTrigger);
    menu.open = true;
    await act(async () => { rulesLink.click(); });
    assert.equal(menu.open, false);
    assert.match(document.querySelector('#restriction-levels').textContent, /Etapas de restricción.*20% de probabilidad de 35% de almacenamiento utilizable en 10 semanas/);
    assert.match(document.querySelector('.drought-level-table').textContent, /D0 · Anormalmente seco.*D4 · Sequía excepcional/);
    assert.match(document.querySelector('#drought').textContent, /al menos el 25%/);
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

test('chart inspection exposes hover, tap, missing dates, keyboard values and historical series', async () => {
  const data = structuredClone(snapshot);
  data.generatedAt = '2026-10-03T12:00:00Z';
  const days = ['2026-10-01', '2026-10-02', '2026-10-03'].map((date, index) => ({
    date, capturedAt: data.generatedAt, values: { stage: 2, drought: 'D2',
      supply: { accessible: null, belowIntakes: null, quarry: null, total: index === 2 ? null : 156 },
      reservoirs: { michie: [330.96, 331.5, null][index], little: null }, streamflow: { flat: null, little: null },
    },
  }));
  const station = { tenYearAverage: { startYear: 2016, endYear: 2025, status: 'fresh', sourceUrl: 'https://example.test/', verifiedAt: data.generatedAt, days: ['10-01', '10-02', '10-03'].map((monthDay,index) => ({ monthDay, value: [20,30,40][index], count: [10,9,10][index], expectedCount: 10 })) }, site: 'flat', name: 'Flat River', status: 'fresh', sourceUrl: 'https://example.test/', historicalPeriod: '2000–2025', verifiedAt: data.generatedAt,
    days: days.map((day, index) => ({ date: day.date, currentYear: [10, null, 20][index], historicalMean: [100, 110, 120][index], historicalSampleYears: 25 })) };
  const element = createElement(WaterWatch, { snapshot: data, history: { schemaVersion: 3, days }, comparison: { schemaVersion: 1, year: 2026, updatedAt: data.generatedAt, stations: { flat: station, little: { ...station, site: 'little', name: 'Little River' } } } });
  const dom = new JSDOM(`<div id="root">${renderToString(element)}</div>`, { url: 'https://example.test/' });
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  let hydrated;
  try {
    await act(async () => { hydrated = hydrateRoot(document.getElementById('root'), element); });
    const [lake, , supply, river] = [...document.querySelectorAll('.chart-hit-area')];
    assert.equal(lake.ownerSVGElement.querySelector('.chart-gap-connector'), null, 'Do not extend a line into missing dates after the last reading');
    for (const slider of [lake, supply, river]) slider.ownerSVGElement.getBoundingClientRect = () => ({ left: 0, width: 640 });
    await act(async () => { lake.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 627 })); });
    assert.match(lake.closest('.context-chart').textContent, /Oct 3, 2026.*No observation/);
    await act(async () => { lake.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 614 })); });
    assert.match(document.querySelector('.chart-tooltip').textContent, /Oct 1, 2026.*10\.04 ft below full pool.*330\.96 ft msl/);
    await act(async () => { lake.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' })); });
    assert.match(document.querySelector('.chart-tooltip').textContent, /Oct 2, 2026.*331\.50 ft msl/);
    assert.match(lake.getAttribute('aria-valuetext'), /331\.50 ft msl/);
    await act(async () => { lake.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })); });
    assert.equal(document.querySelector('.chart-tooltip'), null);
    await act(async () => { river.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 627 })); });
    assert.match(document.querySelector('.chart-tooltip').textContent, /15\.00 ft³\/s.*2 observed daily means.*10-year average \(2016–2025\).*30\.00 ft³\/s.*9–10 years per calendar date.*Historical daily mean.*110\.00 ft³\/s/);
    assert.match(river.closest('.trend-card').textContent, /50% below 10-year average/);
    const readout = river.closest('.context-chart').querySelector('.chart-tooltip');
    await act(async () => { river.dispatchEvent(new dom.window.MouseEvent('pointerout', { bubbles: true, relatedTarget: readout })); });
    assert.ok(readout.isConnected, 'Keep the selected reading available when moving the pointer over it');
    await act(async () => { readout.dispatchEvent(new dom.window.MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })); });
    assert.equal(document.querySelector('.chart-tooltip'), null);
    await act(async () => { supply.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Home' })); });
    assert.match(supply.closest('.context-chart').textContent, /Oct 1, 2026.*156 days/);
    await act(async () => { supply.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'End' })); });
    assert.match(supply.closest('.context-chart').textContent, /Oct 3, 2026.*No observation/);
  } finally {
    if (hydrated) await act(async () => hydrated.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
