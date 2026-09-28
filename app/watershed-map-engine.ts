import type { Location, RainfallForecast } from "./watershed-map";
import { rainfallBounds, rainfallLocations } from "../scripts/rainfall-forecast.mjs";

export const watershedQuery = "https://webgis.durhamnc.gov/server/rest/services/PublicServices/Planning/MapServer/3/query?where=WATERSHED%20IN%20(%27M%2FLR-A%27,%27M%2FLR-B%27)&outFields=WATERSHED&returnGeometry=true&outSR=4326&f=geojson";
export const tileUrl = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
export const homeBounds: [[number, number], [number, number]] = [[35.94, -79.18], [36.43, -78.62]];

export async function createWatershedMap(element: HTMLElement, options: {
  forecast?: RainfallForecast; lang: "en" | "es"; signal: AbortSignal;
  onError: (layer: string) => void; onLoaded: () => void;
}) {
  const L = await import("leaflet");
  if (options.signal.aborted) return;
  const map = L.map(element, { zoomControl: false, minZoom: 8, maxZoom: 15, zoomSnap: 0.5, zoomDelta: 0.5, scrollWheelZoom: true, wheelPxPerZoomLevel: 120 });
  const tiles = L.tileLayer(tileUrl, { maxZoom: 15, attribution: "Tiles © Esri · USGS · NOAA · City of Durham" }).addTo(map);
  tiles.on("tileerror", () => options.onError("base"));
  tiles.on("load", options.onLoaded);
  map.fitBounds(homeBounds, { padding: [28, 28] });
  L.control.scale({ imperial: true, metric: true, position: "bottomleft" }).addTo(map);
  const imageBounds = options.forecast?.imageBounds ?? rainfallBounds;
  const geographic = (x: number, y: number): [number, number] => [Math.atan(Math.sinh(y / 6378137)) * 180 / Math.PI, x / 6378137 * 180 / Math.PI];
  const coverage = L.latLngBounds(geographic(imageBounds[0], imageBounds[1]), geographic(imageBounds[2], imageBounds[3]));
  map.setMaxBounds(coverage);
  map.createPane("rainfall").style.zIndex = "350";
  const forecast = options.forecast;
  const rainfall = forecast?.imagePath ? L.imageOverlay(`./${forecast.imagePath}?v=${encodeURIComponent(forecast.verifiedAt ?? "")}`, coverage, { opacity: 0.3, pane: "rainfall", attribution: "NOAA WPC 7-day precipitation" }).addTo(map) : undefined;
  rainfall?.on("error", () => options.onError("rain"));
  const markers = L.layerGroup().addTo(map);
  const locations: Location[] = forecast?.locations ?? rainfallLocations;
  const text = (value: string) => { const node = document.createElement("span"); node.textContent = value; return node; };
  for (const place of locations) {
    const reservoir = place.name === "Lake Michie" || place.name === "Little River Reservoir";
    const marker = L.marker([place.latitude, place.longitude], {
      icon: L.divIcon({ className: `water-map-pin${reservoir ? " reservoir-pin" : ""}`, html: "<span></span>", iconSize: [16, 16], iconAnchor: [8, 8] }),
      title: place.name, alt: place.name,
    }).addTo(markers);
    const detail = document.createElement("div");
    const heading = document.createElement("strong"); heading.textContent = place.name; detail.append(heading);
    if (typeof place.lowerInches === "number") {
      const value = place.upperInches === null ? `${place.lowerInches.toFixed(2)}+` : `${place.lowerInches.toFixed(2)}–${place.upperInches?.toFixed(2)}`;
      const label = text(`${value} in · ${options.lang === "en" ? "7-day forecast" : "pronóstico de 7 días"}`); label.className = "pin-forecast"; detail.append(label);
    }
    marker.bindPopup(detail);
    marker.bindTooltip(text(place.name), { permanent: reservoir || place.name === "Durham" || place.name === "Roxboro", direction: place.name === "Little River Reservoir" ? "left" : "right", className: reservoir ? "reservoir-label" : "city-label", offset: [8, 0] });
  }
  let outline: import("leaflet").GeoJSON | undefined;
  let outlineVisible = true;
  void fetch(watershedQuery, { signal: options.signal }).then(async response => {
    if (!response.ok) throw new Error("Watershed layer unavailable");
    const data = await response.json();
    if (data.type !== "FeatureCollection" || data.features?.length !== 2 || data.features.some((feature: { properties: { WATERSHED?: string }; geometry: { type?: string } }) => !["M/LR-A", "M/LR-B"].includes(feature.properties?.WATERSHED ?? "") || feature.geometry?.type !== "Polygon")) throw new Error("Unexpected watershed boundaries");
    if (options.signal.aborted) return;
    outline = L.geoJSON(data, { style: { color: "#7c3aa0", weight: 2.5, fillOpacity: 0.05, dashArray: "7 5" }, onEachFeature: (feature, layer) => layer.bindPopup(text(`${feature.properties.WATERSHED} · ${options.lang === "en" ? "City watershed protection area" : "Área de protección de cuenca"}`)) });
    if (outlineVisible) outline.addTo(map);
  }).catch(() => { if (!options.signal.aborted) options.onError("outline"); });
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => map.invalidateSize());
  observer?.observe(element);
  return {
    map,
    zoom: (direction: number) => direction > 0 ? map.zoomIn() : map.zoomOut(),
    reset: () => map.fitBounds(homeBounds, { padding: [28, 28] }),
    focusReservoirs: () => map.fitBounds([[36.075, -78.98], [36.22, -78.75]], { padding: [32, 32] }),
    rain: (visible: boolean, opacity: number) => { if (rainfall) { rainfall.setOpacity(opacity); if (visible) rainfall.addTo(map); else rainfall.remove(); } },
    boundaries: (visible: boolean) => { outlineVisible = visible; if (outline) { if (visible) outline.addTo(map); else outline.remove(); } },
    retry: () => tiles.redraw(),
    destroy: () => { observer?.disconnect(); map.remove(); },
  };
}
