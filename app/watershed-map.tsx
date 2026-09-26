"use client";

import { useState } from "react";
import { mercator, rainfallBounds, rainfallLocations, rainfallPage } from "../scripts/rainfall-forecast.mjs";

type Location = { name: string; longitude: number; latitude: number; lowerInches?: number; upperInches?: number | null };
export type RainfallForecast = {
  issuedAt?: string; startsAt?: string; endsAt?: string; verifiedAt?: string;
  retrievalStatus?: string; note?: string; imagePath?: string; imageBounds?: number[]; locations?: Location[];
  legend?: { lowerInches: number; color: string }[];
};
const cityLayer = "https://webgis.durhamnc.gov/server/rest/services/PublicServices/Planning/MapServer";
const basemap = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer";
const center = [(rainfallBounds[0] + rainfallBounds[2]) / 2, (rainfallBounds[1] + rainfallBounds[3]) / 2];
const copy = {
  en: { controls: "Watershed map controls", plus: "Zoom in on the watershed map", minus: "Zoom out on the watershed map", reset: "Reset view", north: "Pan north", south: "Pan south", east: "Pan east", west: "Pan west", rain: "Show forecast rain", title: "Forecast rainfall for the next 7 days", issued: "Issued", verified: "Verified", retained: "Last known forecast. Could not verify a current forecast.", unavailable: "Rainfall forecast unavailable.", mapUnavailable: "The labeled map could not load.", retry: "Retry map", area: "Purple outline: City watershed protection areas", note: "Colors show NOAA forecast precipitation totals in inches. Amounts at the marked locations are forecast bands, not measured rainfall or a basin average. This is not a reservoir refill forecast.", boundary: "The City boundary layer covers watershed protection areas within Durham County; upstream drainage also extends beyond these boundaries.", forecast: "NOAA 7-day rainfall forecast", amount: "Forecast inches", location: "Location" },
  es: { controls: "Controles del mapa de la cuenca", plus: "Acercar el mapa de la cuenca", minus: "Alejar el mapa de la cuenca", reset: "Restablecer vista", north: "Mover al norte", south: "Mover al sur", east: "Mover al este", west: "Mover al oeste", rain: "Mostrar lluvia prevista", title: "Lluvia prevista para los próximos 7 días", issued: "Emitido", verified: "Verificado", retained: "Último pronóstico conocido. No se pudo verificar uno actual.", unavailable: "Pronóstico de lluvia no disponible.", mapUnavailable: "No se pudo cargar el mapa con etiquetas.", retry: "Reintentar mapa", area: "Límite morado: áreas de protección de cuencas de la Ciudad", note: "Los colores muestran la precipitación prevista por NOAA en pulgadas. Los valores de los puntos son intervalos previstos, no lluvia medida ni un promedio de la cuenca. No es un pronóstico de recarga de embalses.", boundary: "La capa de la Ciudad cubre áreas de protección dentro del condado de Durham; el drenaje aguas arriba también se extiende fuera de estos límites.", forecast: "Pronóstico de lluvia NOAA de 7 días", amount: "Pulgadas previstas", location: "Lugar" },
};
function exportUrl(service: string, bounds: number[], overlay = false) {
  const params = new URLSearchParams({ bbox: bounds.join(","), bboxSR: "3857", imageSR: "3857", size: "1200,720", format: overlay ? "png32" : "jpg", transparent: String(overlay), f: "image" });
  if (overlay) {
    params.set("layers", "show:3");
    params.set("dynamicLayers", JSON.stringify([{
      id: 3, source: { type: "mapLayer", mapLayerId: 3 }, definitionExpression: "WATERSHED IN ('M/LR-A','M/LR-B')",
      drawingInfo: { showLabels: false, renderer: { type: "simple", symbol: { type: "esriSFS", style: "esriSFSSolid", color: [110, 36, 142, 10], outline: { type: "esriSLS", style: "esriSLSDash", color: [110, 36, 142, 255], width: 2.5 } } } },
    }]));
  }
  return `${service}/export?${params}`;
}
function amount(location: Location) {
  if (typeof location.lowerInches !== "number") return "—";
  if (location.upperInches === null) return `${location.lowerInches.toFixed(2)}+`;
  return `${location.lowerInches.toFixed(2)}–${location.upperInches?.toFixed(2)}`;
}

export default function WatershedMap({ lang, forecast, now }: { lang: "en" | "es"; forecast?: RainfallForecast; now: number }) {
  const t = copy[lang];
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState([0, 0]);
  const [showRain, setShowRain] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [outlineFailed, setOutlineFailed] = useState(false);
  const [rainFailed, setRainFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const width = 105000 / zoom;
  const height = 63000 / zoom;
  const bounds = [center[0] + offset[0] - width / 2, center[1] + offset[1] - height / 2, center[0] + offset[0] + width / 2, center[1] + offset[1] + height / 2];
  const imageBounds = forecast?.imageBounds ?? rainfallBounds;
  const locations: Location[] = forecast?.locations ?? rainfallLocations;
  const hasForecast = Boolean(forecast?.issuedAt && forecast?.startsAt && forecast?.endsAt && forecast?.imagePath);
  const stale = hasForecast && (forecast?.retrievalStatus !== "verified" || now - Date.parse(forecast?.issuedAt ?? "") > 36 * 3600000 || Date.parse(forecast?.endsAt ?? "") <= now);
  const date = (value?: string) => value ? new Date(value).toLocaleString(lang === "en" ? "en-US" : "es-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "—";
  const retry = () => { setUnavailable(false); setOutlineFailed(false); setRainFailed(false); setRevision((value) => value + 1); };

  return <>
    <div className="rainfall-heading">
      <h3>{t.title}</h3>
      {hasForecast ? <>
        <p>{date(forecast?.startsAt)} → {date(forecast?.endsAt)}</p>
        <p className="map-note">{t.issued} {date(forecast?.issuedAt)} · {t.verified} {date(forecast?.verifiedAt)}</p>
      </> : <p className="stale-note" role="status">{t.unavailable}</p>}
      {stale && <p className="stale-note" role="status">{t.retained} {forecast?.note}</p>}
    </div>
    <div className="map-controls" role="group" aria-label={t.controls}>
      <label className="rain-toggle"><input type="checkbox" checked={showRain} onChange={(event) => setShowRain(event.target.checked)} disabled={!hasForecast} />{t.rain}</label>
      <button type="button" onClick={() => setZoom((value) => Math.min(4, value * 1.5))} disabled={zoom >= 4} aria-label={t.plus} title={t.plus}>+</button>
      <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value / 1.5))} disabled={zoom <= 0.5} aria-label={t.minus} title={t.minus}>−</button>
      {[[t.west, "←", -width / 4, 0], [t.north, "↑", 0, height / 4], [t.south, "↓", 0, -height / 4], [t.east, "→", width / 4, 0]].map(([label, symbol, x, y]) =>
        <button key={label} type="button" aria-label={String(label)} title={String(label)} onClick={() => setOffset(([oldX, oldY]) => [oldX + Number(x), oldY + Number(y)])}>{symbol}</button>)}
      <button type="button" onClick={() => { setZoom(1); setOffset([0, 0]); retry(); }}>{t.reset}</button>
    </div>
    <div className="geographic-map" role="img" aria-label={lang === "en" ? "Labeled map of Durham, Roxboro, Hillsborough, Butner, Lake Michie and Little River Reservoir, with watershed protection boundaries and seven-day forecast rainfall" : "Mapa de Durham y alrededores con embalses, límites de protección de cuencas y lluvia prevista para siete días"}>
      <img key={`base-${revision}`} className="map-base" src={exportUrl(basemap, bounds)} alt="" width="1200" height="720" loading="lazy" onError={() => setUnavailable(true)} onLoad={() => setUnavailable(false)} />
      {showRain && hasForecast && !rainFailed && <img key={`rain-${revision}`} className="map-rain" src={`./${forecast?.imagePath}?v=${encodeURIComponent(forecast?.verifiedAt ?? "")}`} alt="" onError={() => setRainFailed(true)} style={{ left: `${(imageBounds[0] - bounds[0]) / width * 100}%`, top: `${(bounds[3] - imageBounds[3]) / height * 100}%`, width: `${(imageBounds[2] - imageBounds[0]) / width * 100}%`, height: `${(imageBounds[3] - imageBounds[1]) / height * 100}%` }} />}
      {!outlineFailed && <img key={`outline-${revision}`} className="map-outline" src={exportUrl(cityLayer, bounds, true)} alt="" width="1200" height="720" loading="lazy" onError={() => setOutlineFailed(true)} />}
      {locations.map((location) => {
        if (!["Lake Michie", "Little River Reservoir", "Roxboro", "Rougemont"].includes(location.name)) return null;
        const [x, y] = mercator(location.longitude, location.latitude);
        const left = (x - bounds[0]) / width * 100;
        const top = (bounds[3] - y) / height * 100;
        if (left < 3 || left > 97 || top < 3 || top > 97) return null;
        const reservoir = location.name === "Lake Michie" || location.name === "Little River Reservoir";
        return <span key={location.name} className={`map-place${reservoir ? " reservoir-place" : ""}${location.name === "Little River Reservoir" ? " label-left" : ""}`} style={{ left: `${left}%`, top: `${top}%` }}>
          <i aria-hidden="true" /><span>{location.name}{showRain && hasForecast && <small>{amount(location)} in</small>}</span>
        </span>;
      })}
      <span className="map-credit">Esri, USGS, NOAA · City of Durham</span>
    </div>
    {(unavailable || outlineFailed || rainFailed) && <p className="map-error" role="status">
      {unavailable && t.mapUnavailable} {outlineFailed && (lang === "en" ? "Watershed boundary image unavailable." : "Límite de la cuenca no disponible.")} {rainFailed && (lang === "en" ? "Rainfall image unavailable; forecast amounts remain below." : "Imagen de lluvia no disponible; los valores se muestran abajo.")}
      <button type="button" onClick={retry}>{t.retry}</button>
    </p>}
    <p className="map-area-key">{t.area}{outlineFailed ? " · —" : ""}</p>
    {showRain && hasForecast && <div className="rainfall-legend" aria-label={t.amount}>{forecast?.legend?.map(({ lowerInches, color }) => <span key={lowerInches}><i style={{ background: color }} />{lowerInches === 0 ? "< 0.01" : `${lowerInches.toFixed(2)}+`}</span>)}<span>in</span></div>}
    {hasForecast && <div className="rainfall-values"><table><caption>{t.forecast}</caption><thead><tr><th scope="col">{t.location}</th><th scope="col">{t.amount}</th></tr></thead><tbody>{locations.map((location) => <tr key={location.name}><th scope="row">{location.name}</th><td>{amount(location)} in</td></tr>)}</tbody></table></div>}
    <p className="map-note">{t.note}</p><p className="map-note">{t.boundary}</p>
    <p className="map-source"><a href={rainfallPage} target="_blank" rel="noreferrer">{t.forecast} ↗</a> · <a href={basemap} target="_blank" rel="noreferrer">Esri / USGS basemap ↗</a></p>
  </>;
}
