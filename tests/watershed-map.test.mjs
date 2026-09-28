import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

test('interactive map keeps rainfall georeferenced through zoom, pan, reset and layer controls', async () => {
  const root = resolve(import.meta.dirname, '..');
  await mkdir(join(root, 'outputs'), { recursive: true });
  const temporary = await mkdtemp(join(root, 'outputs/map-test-'));
  const dom = new JSDOM('<div id="map"></div>', { url: 'https://example.test/durham-water-watch/', pretendToBeVisual: true });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'SVGElement', 'fetch'];
  const previous = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  let engine;
  const controller = new AbortController();
  try {
    for (const key of keys.filter(key => key !== 'fetch')) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] });
    dom.window.SVGSVGElement.prototype.createSVGRect = () => ({});
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: ['M/LR-A', 'M/LR-B'].map(name => ({ type: 'Feature', properties: { WATERSHED: name }, geometry: { type: 'Polygon', coordinates: [[[-78.9,36.1],[-78.8,36.1],[-78.8,36.2],[-78.9,36.1]]] } })) }) });
    const element = document.getElementById('map');
    Object.defineProperties(element, { clientWidth: { value: 1000 }, clientHeight: { value: 600 }, offsetWidth: { value: 1000 }, offsetHeight: { value: 600 } });
    element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 });
    await build({ entryPoints: [join(root, 'app/watershed-map-engine.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: join(temporary, 'engine.mjs'), logLevel: 'silent' });
    const { createWatershedMap } = await import(pathToFileURL(join(temporary, 'engine.mjs')).href);
    const { rainfallForecast } = JSON.parse(await readFile(join(root, 'public/data/dashboard.json'), 'utf8'));
    const errors = [];
    engine = await createWatershedMap(element, { forecast: rainfallForecast, lang: 'en', signal: controller.signal, onError: layer => errors.push(layer), onLoaded: () => {} });
    engine.map.options.zoomAnimation = false;
    const zoom = engine.map.getZoom();
    const center = engine.map.getCenter();
    const rain = Object.values(engine.map._layers).find(layer => layer.options.pane === 'rainfall');
    const geographicBounds = rain.getBounds().toBBoxString();
    engine.zoom(1);
    assert.ok(engine.map.getZoom() > zoom);
    engine.zoom(-1);
    assert.equal(engine.map.getZoom(), zoom);
    engine.map.panBy([120, 0], { animate: false });
    assert.notEqual(engine.map.getCenter().lng, center.lng);
    assert.equal(rain.getBounds().toBBoxString(), geographicBounds, 'Rain must stay on the same geographic footprint while the map moves');
    engine.reset();
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.ok(engine.map.getCenter().equals(center, 0.001));
    const scroll = new dom.window.WheelEvent('wheel', { deltaY: -120, clientX: 700, clientY: 300, bubbles: true, cancelable: true });
    const anchored = engine.map.containerPointToLatLng([700, 300]);
    element.dispatchEvent(scroll);
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(scroll.defaultPrevented, true);
    assert.ok(engine.map.getZoom() > zoom, 'Wheel zoom must change the view');
    assert.ok(engine.map.containerPointToLatLng([700, 300]).equals(anchored, 0.002), 'Wheel zoom must stay centered at the pointer');
    engine.rain(false, 0.45);
    assert.equal(engine.map.hasLayer(rain), false);
    engine.rain(true, 0.45);
    assert.equal(engine.map.hasLayer(rain), true);
    assert.equal(rain.options.opacity, 0.45);
    engine.boundaries(false);
    assert.equal(element.querySelectorAll('.leaflet-overlay-pane path').length, 0);
    engine.boundaries(true);
    assert.equal(element.querySelectorAll('.leaflet-overlay-pane path').length, 2);
    assert.equal(element.querySelectorAll('.water-map-pin').length, 7);
    assert.deepEqual(errors, []);
  } finally {
    controller.abort(); engine?.destroy(); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    await rm(temporary, { recursive: true, force: true });
  }
});
