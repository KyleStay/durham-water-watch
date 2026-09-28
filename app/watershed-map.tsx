"use client";

import { useEffect, useRef, useState } from "react";
import { rainfallLocations, rainfallPage } from "../scripts/rainfall-forecast.mjs";
import type { createWatershedMap } from "./watershed-map-engine";

export type Location = { name: string; longitude: number; latitude: number; lowerInches?: number; upperInches?: number | null };
export type RainfallForecast = {
  issuedAt?: string; startsAt?: string; endsAt?: string; verifiedAt?: string;
  retrievalStatus?: string; note?: string; imagePath?: string; imageBounds?: number[]; locations?: Location[];
  legend?: { lowerInches: number; color: string }[];
};
const basemap = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer";
const copy = {
  en: { controls: "Watershed map controls", plus: "Zoom in on the watershed map", minus: "Zoom out on the watershed map", reset: "Reset view", north: "Pan north", south: "Pan south", east: "Pan east", west: "Pan west", rain: "Show forecast rain", title: "Forecast rainfall for the next 7 days", issued: "Issued", verified: "Verified", retained: "Last known forecast. Could not verify a current forecast.", unavailable: "Rainfall forecast unavailable.", mapUnavailable: "The labeled map could not load.", retry: "Retry map", area: "Purple outline: City watershed protection areas", note: "Colors show NOAA forecast precipitation totals in inches. Amounts at the marked locations are forecast bands, not measured rainfall or a basin average. This is not a reservoir refill forecast.", boundary: "The City boundary layer covers watershed protection areas within Durham County; upstream drainage also extends beyond these boundaries.", forecast: "NOAA 7-day rainfall forecast", amount: "Forecast inches", location: "Location" },
  es: { controls: "Controles del mapa de la cuenca", plus: "Acercar el mapa de la cuenca", minus: "Alejar el mapa de la cuenca", reset: "Restablecer vista", north: "Mover al norte", south: "Mover al sur", east: "Mover al este", west: "Mover al oeste", rain: "Mostrar lluvia prevista", title: "Lluvia prevista para los próximos 7 días", issued: "Emitido", verified: "Verificado", retained: "Último pronóstico conocido. No se pudo verificar uno actual.", unavailable: "Pronóstico de lluvia no disponible.", mapUnavailable: "No se pudo cargar el mapa con etiquetas.", retry: "Reintentar mapa", area: "Límite morado: áreas de protección de cuencas de la Ciudad", note: "Los colores muestran la precipitación prevista por NOAA en pulgadas. Los valores de los puntos son intervalos previstos, no lluvia medida ni un promedio de la cuenca. No es un pronóstico de recarga de embalses.", boundary: "La capa de la Ciudad cubre áreas de protección dentro del condado de Durham; el drenaje aguas arriba también se extiende fuera de estos límites.", forecast: "Pronóstico de lluvia NOAA de 7 días", amount: "Pulgadas previstas", location: "Lugar" },
};
function amount(location: Location) {
  if (typeof location.lowerInches !== "number") return "—";
  if (location.upperInches === null) return `${location.lowerInches.toFixed(2)}+`;
  return `${location.lowerInches.toFixed(2)}–${location.upperInches?.toFixed(2)}`;
}

export default function WatershedMap({ lang, forecast, now }: { lang: "en" | "es"; forecast?: RainfallForecast; now: number }) {
  const t = copy[lang];
  const mapRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Awaited<ReturnType<typeof createWatershedMap>>>(undefined);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [showRain, setShowRain] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [opacity, setOpacity] = useState(0.3);
  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const controller = new AbortController();
    let instance: typeof engine.current;
    void import("./watershed-map-engine").then(({ createWatershedMap }) => createWatershedMap(element, {
      forecast, lang, signal: controller.signal,
      onError: (layer) => { if (!controller.signal.aborted) setErrors((values) => values.includes(layer) ? values : [...values, layer]); },
      onLoaded: () => { if (!controller.signal.aborted) setErrors((values) => values.filter((value) => value !== "base")); },
    })).then((value) => {
      instance = value;
      if (controller.signal.aborted) value?.destroy();
      else { engine.current = value; setReady(Boolean(value)); }
    }).catch(() => { if (!controller.signal.aborted) setErrors((values) => [...values, "base"]); });
    return () => { controller.abort(); instance?.destroy(); engine.current = undefined; };
  }, [forecast, lang, revision]);
  useEffect(() => { engine.current?.rain(showRain, opacity); }, [showRain, opacity, ready]);
  useEffect(() => { engine.current?.boundaries(showBoundaries); }, [showBoundaries, ready]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", escape);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", escape); document.body.style.overflow = previous; };
  }, [expanded]);
  useEffect(() => { engine.current?.map.invalidateSize(); }, [expanded]);
  const locations: Location[] = forecast?.locations ?? rainfallLocations;
  const hasForecast = Boolean(forecast?.issuedAt && forecast?.startsAt && forecast?.endsAt && forecast?.imagePath);
  const stale = hasForecast && (forecast?.retrievalStatus !== "verified" || now - Date.parse(forecast?.issuedAt ?? "") > 36 * 3600000 || Date.parse(forecast?.endsAt ?? "") <= now);
  const date = (value?: string) => value ? new Date(value).toLocaleString(lang === "en" ? "en-US" : "es-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "—";
  const retry = () => { setReady(false); setErrors([]); setRevision((value) => value + 1); };

  return <>
    <div className="rainfall-heading">
      <h3>{t.title}</h3>
      {hasForecast ? <>
        <p>{date(forecast?.startsAt)} → {date(forecast?.endsAt)}</p>
        <p className="map-note">{t.issued} {date(forecast?.issuedAt)} · {t.verified} {date(forecast?.verifiedAt)}</p>
      </> : <p className="stale-note" role="status">{t.unavailable}</p>}
      {stale && <p className="stale-note" role="status">{t.retained} {forecast?.note}</p>}
    </div>
    <div className={`water-map-frame${expanded ? " map-expanded" : ""}`}>
    <div className="map-controls" role="group" aria-label={t.controls}>
      <label className="rain-toggle"><input type="checkbox" checked={showRain} onChange={(event) => setShowRain(event.target.checked)} disabled={!hasForecast} />{t.rain}</label>
      <label className="rain-toggle"><input type="checkbox" checked={showBoundaries} onChange={(event) => setShowBoundaries(event.target.checked)} />{lang === "en" ? "Watershed outline" : "Límite de cuenca"}</label>
      <button type="button" onClick={() => engine.current?.zoom(1)} disabled={!ready} aria-label={t.plus} title={t.plus}>+</button>
      <button type="button" onClick={() => engine.current?.zoom(-1)} disabled={!ready} aria-label={t.minus} title={t.minus}>−</button>
      <button type="button" onClick={() => engine.current?.focusReservoirs()} disabled={!ready}>{lang === "en" ? "Reservoirs" : "Embalses"}</button>
      <button type="button" onClick={() => engine.current?.reset()} disabled={!ready}>{t.reset}</button>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? (lang === "en" ? "Close full screen" : "Cerrar pantalla completa") : (lang === "en" ? "Full screen" : "Pantalla completa")}</button>
    </div>
    <div ref={mapRef} className="geographic-map interactive-water-map" role="region" aria-label={lang === "en" ? "Interactive watershed and rainfall map" : "Mapa interactivo de cuencas y lluvia"} />
    {!ready && !errors.length && <p className="map-loading" role="status">{lang === "en" ? "Loading interactive map…" : "Cargando mapa interactivo…"}</p>}
    <div className="map-footer"><span>{lang === "en" ? "Drag to explore · Scroll or pinch to zoom · Tap a marker for rainfall" : "Arrastra para explorar · Desplaza o pellizca para acercar · Toca un punto para ver lluvia"}</span>
      {expanded && hasForecast && <span>{date(forecast?.startsAt)} → {date(forecast?.endsAt)}{stale ? ` · ${t.retained}` : ""}</span>}
      <label>{lang === "en" ? "Rain visibility" : "Visibilidad de lluvia"}<input aria-label={lang === "en" ? "Rainfall overlay opacity" : "Opacidad de lluvia"} type="range" min="0.1" max="0.7" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} disabled={!hasForecast || !showRain} /></label>
    </div>
    </div>
    {errors.length > 0 && <p className="map-error" role="status">
      {errors.includes("base") && t.mapUnavailable} {errors.includes("outline") && (lang === "en" ? "Watershed boundaries unavailable." : "Límites de cuencas no disponibles.")} {errors.includes("rain") && (lang === "en" ? "Rainfall image unavailable; forecast amounts remain below." : "Imagen de lluvia no disponible; los valores se muestran abajo.")}
      <button type="button" onClick={retry}>{t.retry}</button>
    </p>}
    <p className="map-area-key">{t.area}</p>
    {showRain && hasForecast && <div className="rainfall-legend" aria-label={t.amount}>{forecast?.legend?.map(({ lowerInches, color }) => <span key={lowerInches}><i style={{ background: color }} />{lowerInches === 0 ? "< 0.01" : `${lowerInches.toFixed(2)}+`}</span>)}<span>in</span></div>}
    {hasForecast && <div className="rainfall-values"><table><caption>{t.forecast}</caption><thead><tr><th scope="col">{t.location}</th><th scope="col">{t.amount}</th></tr></thead><tbody>{locations.map((location) => <tr key={location.name}><th scope="row">{location.name}</th><td>{amount(location)} in</td></tr>)}</tbody></table></div>}
    <p className="map-note">{t.note}</p><p className="map-note">{t.boundary}</p>
    <p className="map-source"><a href={rainfallPage} target="_blank" rel="noreferrer">{t.forecast} ↗</a> · <a href={basemap} target="_blank" rel="noreferrer">Esri / USGS basemap ↗</a></p>
  </>;
}
