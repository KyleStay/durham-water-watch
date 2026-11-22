"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { observedSegments, trendWindow, weeklyFlow } from "../scripts/trend-series.mjs";
import { withTenYearAverage } from "../scripts/ten-year-flow.mjs";

type Lang = "en" | "es";
type Point = { date: string; value: number | null; start?: string; end?: string; detail?: string };
type Series = { label: string; color: string; points: Point[]; dashed?: boolean; dashPattern?: string; marker?: "ring" };
type Reference = { label: string; value: number; color: string; highlighted?: boolean; inlineLabel?: string };
type HistoryDay = { date: string; values: { supply: { total: number | null }; reservoirs: { michie: number | null; little: number | null } } };
export type TenYearAverage = { startYear: number; endYear: number; status: "fresh" | "stale" | "unavailable"; sourceUrl: string; verifiedAt?: string; note?: string; provisionalCount?: number; days: { monthDay: string; value: number | null; count: number; expectedCount: number }[] };
type Station = { tenYearAverage?: TenYearAverage; name: string; site: string; sourceUrl: string; historicalPeriod: string | null; status: "fresh" | "stale" | "unavailable"; days: { date: string; currentYear: number | null; historicalMean: number }[] };

function dateLabel(date: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function fullDate(date: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function ChartMarker({ x, y, radius, color, marker, children }: {
  x: number; y: number; radius: number; color: string; marker?: Series["marker"]; children?: ReactNode;
}) {
  return <circle cx={x} cy={y} r={radius} fill={marker ? "var(--surface)" : color}
    stroke={marker ? color : undefined} strokeWidth={marker ? 1.75 : undefined}>{children}</circle>;
}

function ChartKey({ color, dash, marker, emphasized }: {
  color: string; dash?: string; marker?: Series["marker"]; emphasized?: boolean;
}) {
  return <i aria-hidden="true" style={{
    position: "relative", width: 24, flex: "none", borderColor: color,
    borderStyle: dash === "2 4" ? "dotted" : dash ? "dashed" : "solid", borderTopWidth: emphasized ? 3 : 2,
  }}>
    {marker && <b style={{
      position: "absolute", width: 8, height: 8, left: 8, top: -5, borderRadius: "50%",
      border: `2px solid ${color}`, background: "var(--surface)",
    }} />}
  </i>;
}

export type ChartTrack = {
  label?: string;
  unit: string;
  series: Series[];
  domain?: [number, number];
  gapDays?: number;
  zeroReference?: boolean;
  references?: Reference[];
  categories?: string[];
};

export function Chart({ title, description, window, lang, tracks = [], stagePeriod, ...primary }: ChartTrack & {
  title: string; description: string; window: { start: string; end: string }; lang: Lang; tracks?: ChartTrack[];
  stagePeriod?: { start: string; label: string };
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const compactTracks = tracks.length > 0 && width < 450;
  const stageHeight = stagePeriod ? 26 : 0;
  const primaryBottom = (compactTracks ? 174 : 213) + stageHeight;
  const trackHeight = compactTracks ? 72 : 99;
  const trackStride = trackHeight + 29;
  const height = primaryBottom + tracks.length * trackStride + 33;
  const left = primary.categories && lang === "es" ? 70 : 45;
  const right = primary.references?.some((rule) => rule.inlineLabel) ? 65 : 13;
  const start = Date.parse(`${window.start}T00:00:00Z`), end = Date.parse(`${window.end}T00:00:00Z`);
  const x = (date: string) => left + (Date.parse(`${date}T00:00:00Z`) - start) / Math.max(1, end - start) * (width - left - right);
  const dateLabels = [...new Set([window.start, new Date(start + (end - start) / 2).toISOString().slice(0, 10), window.end])];
  const plots = [primary, ...tracks].map((track, index) => {
    const { unit, series, domain, gapDays = 1, zeroReference = false, references = [], categories } = track;
    const values = series.flatMap((s) => s.points.flatMap((p) => p.value === null ? [] : [p.value]));
    const min = Math.min(0, ...(domain ?? values));
    const max = Math.max(0, ...(domain ?? values));
    const step = categories ? 1 : zeroReference ? Math.max(2, Math.ceil(Math.abs(min) / 4)) : Math.max(1, Math.ceil(max / 4));
    const low = categories ? 0 : Math.floor(min / step) * step;
    const high = categories ? categories.length - 1 : Math.max(low + step, Math.ceil(max / step) * step);
    const top = index === 0 ? 26 + stageHeight : primaryBottom + 29 + (index - 1) * trackStride;
    const bottom = index === 0 ? primaryBottom : top + trackHeight;
    const y = (value: number) => top + (high - value) / (high - low) * (bottom - top);
    const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step);
    const traces = series.map((item) => ({ ...item, segments: observedSegments(item.points, gapDays) }));
    return { label: track.label, unit, values, series, traces, gapDays, zeroReference, references, categories, top, bottom, y, ticks };
  });
  const hasGaps = plots.some((plot) => !plot.categories && plot.traces.some(({ segments }) => segments.length > 1));
  const gapLabel = lang === "en" ? "Dotted bridges mark missing readings" : "Los tramos punteados indican lecturas faltantes";
  const allSeries = plots.flatMap((plot) => plot.series);
  const entries = [...new Set(allSeries.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const activeIndex = activeDate ? entries.indexOf(activeDate) : -1;
  const selected = activeIndex < 0 ? null : entries[activeIndex];
  const rows = selected ? plots.flatMap((plot) => plot.series.map((s) => {
    const point = s.points.find((p) => p.date === selected);
    const value = point?.value;
    const reading = value === null || value === undefined
      ? lang === "en" ? "No observation" : "Sin observación"
      : plot.categories ? plot.categories[value]
        : plot.zeroReference
          ? `${Math.abs(value).toFixed(2)} ${lang === "en" ? (value > 0 ? "ft above full pool" : "ft below full pool") : (value > 0 ? "pies sobre la cota máxima" : "pies bajo la cota máxima")}`
          : `${value.toLocaleString(lang === "en" ? "en-US" : "es-US", { minimumFractionDigits: plot.unit === "ft³/s" ? 2 : 0, maximumFractionDigits: 2 })} ${plot.unit}`;
    const period = point?.start && point?.end ? `${fullDate(point.start, lang)} – ${fullDate(point.end, lang)}` : "";
    return { label: s.label, color: s.color, marker: s.marker, value, reading, period, detail: point?.detail, y: plot.y };
  })) : [];
  const inspectPointer = (clientX: number, svg: SVGSVGElement | null) => {
    const rect = svg?.getBoundingClientRect();
    if (!rect?.width) return;
    const cursor = (clientX - rect.left) / rect.width * width;
    setActiveDate(entries.reduce((nearest, date) => Math.abs(x(date) - cursor) < Math.abs(x(nearest) - cursor) ? date : nearest));
  };
  const help = lang === "en" ? "Hover or tap to inspect. Focus the chart and use arrow keys to browse dates; Home/End jump, Escape clears." : "Pase el cursor o toque para consultar. Use las flechas para recorrer fechas; Inicio/Fin saltan y Escape cierra.";
  const valueText = selected ? `${fullDate(selected, lang)}. ${rows.map((row) => `${row.label}: ${row.reading}. ${row.period} ${row.detail ?? ""}`).join(" ")}` : help;
  return <div ref={container} className="context-chart"
    onPointerLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) setActiveDate(null); }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}>
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{description} {hasGaps && `${gapLabel}. `}{help}</desc>
      {stagePeriod && <g className="chart-stage-period" data-start={stagePeriod.start}>
        <title>{stagePeriod.label} · {fullDate(stagePeriod.start, lang)}</title>
        <text className="context-axis" x={left} y={14}>{stagePeriod.label}</text>
        <line x1={x(stagePeriod.start)} x2={width - right} y1={23} y2={23} />
        <circle cx={x(stagePeriod.start)} cy={23} r={3} />
      </g>}
      {plots.map(({ label, unit, traces, references, ticks, top, y, categories, zeroReference, gapDays }) => <g key={label ?? unit}>
        <text className="context-axis" x={left} y={top - 12}>{label ?? unit}</text>
        {ticks.map((tick) => <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className={zeroReference && tick === 0 ? "full-pool-line" : "context-grid-line"} />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="context-axis">{categories ? categories[tick] : tick}</text>
        </g>)}
        {zeroReference && <text x={width - right} y={y(0) - 7} textAnchor="end" className="context-axis">{lang === "en" ? "Full pool" : "Cota máxima"}</text>}
        {references.map((rule) => <g key={rule.label}>
          <line x1={left} x2={width - right} y1={y(rule.value)} y2={y(rule.value)}
            stroke={rule.color} strokeDasharray={rule.highlighted ? "11 5" : "4 5"} strokeWidth={rule.highlighted ? 2.5 : 1.5} />
          {rule.inlineLabel && <text className="context-axis" x={width - right + 5} y={y(rule.value) + 3}
            style={{ fill: rule.color, fontWeight: rule.highlighted ? 700 : 500 }}>{rule.inlineLabel}</text>}
        </g>)}
        {traces.map((s) => <g key={s.label}>
          {!categories && s.segments.slice(1).map(([next], i) => {
            const previous = s.segments[i][s.segments[i].length - 1];
            return <line key={next.date} className="chart-gap-connector" aria-hidden="true"
              x1={x(previous.date)} y1={y(previous.value)} x2={x(next.date)} y2={y(next.value)} stroke={s.color} />;
          })}
          {s.segments.map((segment, i) => <path key={i} d={segment.map((p, index) => {
            if (!index) return `M${x(p.date)},${y(p.value)}`;
            return categories ? `H${x(p.date)}V${y(p.value)}` : `L${x(p.date)},${y(p.value)}`;
          }).join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? s.dashPattern ?? "6 5" : undefined} />)}
          {!s.dashed && s.points.map((p) => p.value === null ? null : <ChartMarker key={p.date}
            x={x(p.date)} y={y(p.value)} radius={s.marker ? 3.5 : gapDays === 1 ? 3 : 2.5} color={s.color} marker={s.marker}>
            <title>{`${s.label} · ${fullDate(p.date, lang)}: ${categories ? categories[p.value] : `${p.value.toFixed(2)} ${unit}`}`}</title>
          </ChartMarker>)}
        </g>)}
      </g>)}
      {dateLabels.map((date, i) => <text key={date} x={x(date)} y={height - 9} textAnchor={i === 0 ? "start" : i === dateLabels.length - 1 ? "end" : "middle"} className="context-axis">{dateLabel(date, lang)}</text>)}
      {selected && <g className="chart-selection" pointerEvents="none">
        <line x1={x(selected)} x2={x(selected)} y1={plots[0].top} y2={plots.at(-1)?.bottom} />
        {rows.map((row) => row.value === null || row.value === undefined ? null : <ChartMarker key={row.label}
          x={x(selected)} y={row.y(row.value)} radius={5} color={row.color} marker={row.marker} />)}
      </g>}
      {entries.length > 0 && <rect className="chart-hit-area" x={left} y={plots[0].top} width={width - left - right} height={plots[plots.length - 1].bottom - plots[0].top}
        fill="transparent" tabIndex={0} role="slider" aria-label={title} aria-orientation="horizontal"
        aria-valuemin={0} aria-valuemax={entries.length - 1} aria-valuenow={Math.max(0, activeIndex)} aria-valuetext={valueText}
        aria-describedby={`${id}-desc`}
        onPointerMove={(event) => inspectPointer(event.clientX, event.currentTarget.ownerSVGElement)}
        onPointerDown={(event) => inspectPointer(event.clientX, event.currentTarget.ownerSVGElement)}
        onFocus={() => setActiveDate((date) => date && entries.includes(date) ? date : entries.findLast((date) => allSeries.some((s) => s.points.some((p) => p.date === date && p.value !== null))) ?? entries[0])}
        onBlur={() => setActiveDate(null)}
        onKeyDown={(event) => {
          const key = event.key;
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(key)) return;
          event.preventDefault();
          if (key === "Escape") { setActiveDate(null); return; }
          const next = key === "Home" ? 0 : key === "End" ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, Math.max(0, activeIndex) + (["ArrowLeft", "ArrowDown"].includes(key) ? -1 : 1)));
          setActiveDate(entries[next]);
        }} />}
    </svg>
    {selected && <div className="chart-tooltip" id={`${id}-tooltip`} role="tooltip">
      <strong>{(primary.gapDays ?? 1) > 1 && !primary.categories ? (lang === "en" ? "Week ending " : "Semana hasta ") : ""}{fullDate(selected, lang)}</strong>
      {rows.map((row) => <div key={row.label}><span className="chart-tooltip-series"><i style={{ background: row.color }} />{row.label}</span><b>{row.reading}</b>{row.period && <span>{row.period}</span>}{row.detail && <span>{row.detail}</span>}</div>)}
    </div>}
    <p className="chart-help">{lang === "en" ? "Hover, tap, or use arrow keys for values and dates." : "Pase el cursor, toque o use las flechas para consultar valores y fechas."}</p>
    <div className="context-legend">
      {allSeries.map((s) => <span key={s.label}><ChartKey color={s.color} dash={s.dashed ? s.dashPattern ?? "6 5" : undefined} marker={s.marker} />{s.label}</span>)}
      {plots.flatMap((plot) => plot.references.filter((rule) => !rule.inlineLabel)).map((rule) => <span key={rule.label}><ChartKey color={rule.color}
        dash={rule.highlighted ? "11 5" : "4 5"} emphasized={rule.highlighted} />{rule.label}</span>)}
      {hasGaps && <span><i className="chart-gap-key" />{gapLabel}</span>}
    </div>
    {!plots.some((plot) => plot.values.length) && <p>{lang === "en" ? "No observations in this period." : "No hay observaciones en este período."}</p>}
  </div>;
}

function observationSummary(points: Point[], lang: Lang, unit: string) {
  const available = points.filter((p): p is { date: string; value: number } => p.value !== null);
  const first = available[0], last = available.at(-1);
  if (!first || !last) return lang === "en" ? "No observations in this period." : "No hay observaciones en este período.";
  const delta = last.value - first.value;
  const change = `${delta > 0 ? "+" : ""}${delta.toFixed(unit === "ft" ? 2 : 0)} ${unit}`;
  return lang === "en"
    ? `${change} between ${dateLabel(first.date, lang)} and ${dateLabel(last.date, lang)} · ${available.length} dated readings`
    : `${change} entre el ${dateLabel(first.date, lang)} y el ${dateLabel(last.date, lang)} · ${available.length} lecturas fechadas`;
}

export default function TrendContext({ days, end, lang, reservoirs, supplyStatus, stations, reservoirContext }: {
  days: HistoryDay[]; end: string; lang: Lang;
  reservoirs: { key: "michie" | "little"; name: string; fullPool: number; status: ReactNode }[];
  supplyStatus: ReactNode; stations: Station[]; reservoirContext: ReactNode;
}) {
  const [period, setPeriod] = useState<"30" | "90" | "year">("90");
  const window = trendWindow(end, period);
  const selected = days.filter((day) => day.date >= window.start && day.date <= window.end && day.date <= end);
  const supply = selected.map((day) => ({ date: day.date, value: day.values.supply.total }));
  const lastSupply = supply.filter((p) => p.value !== null).at(-1);
  const year = end.slice(0, 4);
  const elevations = reservoirs.flatMap((lake) => selected.flatMap((day) => day.values.reservoirs[lake.key] === null ? [] : [day.values.reservoirs[lake.key]! - lake.fullPool]));
  const lakeDomain: [number, number] = [Math.min(0, ...elevations), Math.max(0, ...elevations)];
  return <section id="trends" className="section trend-context-section">
    <div className="wrap">
      <div className="trend-heading">
        <div><p className="kicker">{lang === "en" ? "The bigger picture" : "El panorama general"}</p><h2>{lang === "en" ? "How have conditions changed?" : "¿Cómo han cambiado las condiciones?"}</h2><p>{lang === "en" ? "Catch up on the weeks and months between visits." : "Consulte lo ocurrido en las semanas y meses entre visitas."}</p></div>
        <div className="period-controls" role="group" aria-label={lang === "en" ? "Chart period" : "Período de las gráficas"}>
          {(["30", "90", "year"] as const).map((value) => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === "year" ? year : `${value} ${lang === "en" ? "days" : "días"}`}</button>)}
        </div>
      </div>
      <p className="period-note" aria-live="polite">{lang === "en" ? "Showing" : "Mostrando"} {dateLabel(window.start, lang)} – {dateLabel(window.end, lang)}, {year}. {lang === "en" ? "Dots are dated readings. Thin dotted bridges span gaps without filling in values." : "Los puntos son lecturas fechadas. Los tramos punteados finos cruzan los huecos sin rellenar valores."}</p>
      <div id="reservoirs" className="trend-section-heading"><span>01</span><div><h3>{lang === "en" ? "Reservoirs: how far below full?" : "Embalses: ¿cuánto falta para llenarse?"}</h3><p>{lang === "en" ? "Both graphs use the same scale. Higher means closer to full pool. Feet below full pool are not a percentage of usable storage." : "Ambas gráficas usan la misma escala. Más alto significa más cerca de la cota máxima. Los pies bajo la cota máxima no representan un porcentaje del agua utilizable."}</p></div></div>
      <div className="context-card-grid">
        {reservoirs.map((lake) => {
          const points = selected.map((day) => ({ date: day.date, value: day.values.reservoirs[lake.key] === null ? null : day.values.reservoirs[lake.key]! - lake.fullPool, detail: day.values.reservoirs[lake.key] === null ? undefined : `${lang === "en" ? "Elevation" : "Elevación"}: ${day.values.reservoirs[lake.key]!.toFixed(2)} ft msl · ${lang === "en" ? "Full pool" : "Cota máxima"}: ${lake.fullPool.toFixed(2)} ft msl` }));
          const latest = points.filter((p) => p.value !== null).at(-1);
          return <article className="trend-card" key={lake.key}>
            <div className="trend-card-heading"><h4>{lake.name}</h4>{lake.status}</div>
            <p className="trend-reading"><strong>{latest ? Math.abs(latest.value!).toFixed(2) : "—"}</strong> {lang === "en" ? (latest && latest.value! > 0 ? "ft above full" : "ft below full") : (latest && latest.value! > 0 ? "pies sobre la cota máxima" : "pies bajo la cota máxima")}</p>
            <p className="observation-date">{latest ? `${lang === "en" ? "Observed" : "Observado"} ${dateLabel(latest.date, lang)}` : "—"}</p>
            <Chart title={`${lake.name}: ${lang === "en" ? "elevation relative to full pool" : "nivel respecto a la cota máxima"}`} description={observationSummary(points, lang, "ft")} series={[{ label: lake.name, color: lake.key === "michie" ? "var(--chart-teal, #137772)" : "var(--chart-amber, #a85e20)", points }]} window={window} unit="ft" zeroReference domain={lakeDomain} lang={lang} />
            <p className="trend-change">{observationSummary(points, lang, "ft")}</p>
          </article>;
        })}
      </div>
      <p className="trend-source"><a href="https://www.durhamnc.gov/1225/Lake-Levels" target="_blank" rel="noreferrer">{lang === "en" ? "City lake readings and prior-year charts" : "Lecturas y gráficas de años anteriores de la Ciudad"} ↗</a> · <a href="#prior-years">{lang === "en" ? "Compare earlier years below" : "Compare años anteriores abajo"}</a></p>
      {reservoirContext}
      <div id="supply" className="trend-section-heading"><span>02</span><div><h3>{lang === "en" ? "Supply: is the estimate rising or falling?" : "Suministro: ¿sube o baja la estimación?"}</h3><p>{lang === "en" ? "The City’s estimate changes with available water and demand. It is a planning estimate, not a guaranteed countdown." : "La estimación de la Ciudad cambia según el agua disponible y la demanda. Es una estimación de planificación, no una cuenta regresiva garantizada."}</p></div></div>
      <article className="trend-card supply-trend-card">
        <div className="trend-card-heading"><h4>{lang === "en" ? "Estimated total supply" : "Suministro total estimado"}</h4>{supplyStatus}</div>
        <p className="trend-reading"><strong>{lastSupply?.value ?? "—"}</strong> {lang === "en" ? "days" : "días"}<span className="observation-date"> · {lastSupply ? dateLabel(lastSupply.date, lang) : "—"}</span></p>
        <Chart title={lang === "en" ? "Estimated days of supply over time" : "Días de suministro estimado a lo largo del tiempo"} description={observationSummary(supply, lang, lang === "en" ? "days" : "días")} series={[{ label: lang === "en" ? "Total supply" : "Suministro total", color: "var(--chart-blue, #07516e)", points: supply }]} window={window} unit={lang === "en" ? "days" : "días"} lang={lang} />
        <p className="trend-change">{observationSummary(supply, lang, lang === "en" ? "days" : "días")}</p>
        <p className="trend-source"><a href="https://www.durhamnc.gov/1214/Current-Data" target="_blank" rel="noreferrer">{lang === "en" ? "Official City supply estimate" : "Estimación oficial del suministro"} ↗</a> · <a href="#supply-breakdown">{lang === "en" ? "What makes up this estimate?" : "¿Cómo se calcula esta estimación?"}</a></p>
      </article>
      <div id="rivers" className="trend-section-heading"><span>03</span><div><h3>{lang === "en" ? "River flow: is this typical for the season?" : "Caudal: ¿es normal para la temporada?"}</h3><p>{lang === "en" ? "Weekly averages of USGS daily means compared with the 10-year average and full-record historical mean for the same calendar dates. The 10-year window uses the ten completed years before this year; the year view shows the usual seasonal pattern through December." : "Promedios semanales del caudal medio diario del USGS comparados con el promedio de 10 años y el histórico completo para las mismas fechas. El período usa los diez años completos anteriores; la vista anual muestra el patrón estacional hasta diciembre."}</p></div></div>
      <div className="context-card-grid">
        {stations.map((station) => {
          const average = station.tenYearAverage;
          const averageLabel = `${lang === "en" ? "10-year average" : "Promedio de 10 años"} (${average?.startYear}–${average?.endYear})`;
          const weekly = weeklyFlow(withTenYearAverage(station.days, average, Number(year)), window, end);
          const recent = weekly.filter((p) => p.current !== null).at(-1);
          const useTenYear = recent?.pairedTenYear !== null && recent?.pairedTenYear !== undefined;
          const reference = useTenYear ? recent?.pairedTenYear : recent?.pairedHistorical;
          const difference = reference ? Math.round((recent!.current! / reference - 1) * 1000) / 10 : null;
          const referenceLabel = lang === "en" ? (useTenYear ? "10-year average" : "historical mean") : (useTenYear ? "promedio de 10 años" : "promedio histórico");
          const chartSeries: Series[] = [
            { label: year, color: "var(--chart-blue, #07516e)", points: weekly.map((p) => ({ date: p.date, value: p.current, start: p.start, end: p.through ?? undefined, detail: `${p.count} ${lang === "en" ? "observed daily means" : "promedios diarios observados"}` })) },
            ...(average?.days.length ? [{ label: averageLabel, color: "var(--chart-teal, #137772)", dashed: true, dashPattern: "2 4", points: weekly.map((p) => ({ date: p.date, value: p.tenYear, detail: `${dateLabel(p.periodStart, lang)} – ${dateLabel(p.periodEnd, lang)} · ${p.tenYearCountLow === p.tenYearCountHigh ? p.tenYearCountLow : `${p.tenYearCountLow}–${p.tenYearCountHigh}`} ${lang === "en" ? "years per calendar date; available USGS daily means" : "años por fecha; promedios diarios disponibles del USGS"}` })) }] : []),
            { label: lang === "en" ? "Historical daily mean" : "Promedio diario histórico", color: "var(--chart-amber, #a85e20)", dashed: true, points: weekly.map((p) => ({ date: p.date, value: p.historical, start: p.periodStart, end: p.periodEnd, detail: lang === "en" ? "Average of historical daily means" : "Promedio de los promedios diarios históricos" })) },
          ];
          return <article className="trend-card" key={station.site}>
            <div className="trend-card-heading"><h4>{station.name}</h4><span className={`status ${station.status}`}>{lang === "en" ? { fresh: "Verified", stale: "Stale · retained", unavailable: "Unavailable" }[station.status] : { fresh: "Verificado", stale: "Antiguo · conservado", unavailable: "No disponible" }[station.status]}</span></div>
            <p className="trend-reading"><strong>{difference === null ? "—" : `${Math.abs(difference).toLocaleString(lang === "en" ? "en-US" : "es-US", { maximumFractionDigits: 1 })}%`}</strong> {difference === null ? "" : lang === "en" ? `${difference > 0 ? "above" : difference < 0 ? "below" : "at"} ${referenceLabel}` : `${difference > 0 ? "sobre" : difference < 0 ? "bajo" : "en"} el ${referenceLabel}`}</p>
            <p className="observation-date">{recent?.through ? `${dateLabel(recent.start, lang)} – ${dateLabel(recent.through, lang)} · ${recent.count}/7 ${lang === "en" ? "daily readings" : "lecturas diarias"}` : lang === "en" ? "Comparison unavailable" : "Comparación no disponible"}</p>
            <Chart title={`${station.name}: ${year} ${lang === "en" ? "vs historical daily mean" : "frente al promedio diario histórico"}`} description={lang === "en" ? "Weekly averages in cubic feet per second. The green line shows the 10-year average and the amber line shows the full-record mean." : "Promedios semanales en pies cúbicos por segundo. La línea verde muestra el promedio de 10 años y la ámbar el histórico completo."} series={chartSeries} window={window} unit="ft³/s" lang={lang} gapDays={7} />
            {average?.days.length ? <p className="trend-source">{averageLabel}. {lang === "en" ? "Each calendar date averages available daily means; hover for sample years. Leap days use only leap years." : "Cada fecha promedia los datos disponibles; consulte los años de muestra. El 29 de febrero usa solo años bisiestos."} {average.provisionalCount ? (lang === "en" ? "Some historical readings remain provisional." : "Algunas lecturas históricas son provisionales.") : ""} <a href={average.sourceUrl} target="_blank" rel="noreferrer">USGS ↗</a></p> : <p className="stale-note">{lang === "en" ? "10-year average unavailable for this station." : "Promedio de 10 años no disponible para esta estación."}</p>}
            {average && average.status !== "fresh" && average.days.length > 0 && <p className="stale-note">{lang === "en" ? "Last verified 10-year average retained; the latest check failed or has aged." : "Se conserva el último promedio de 10 años verificado; la consulta falló o ha envejecido."}</p>}
            {station.status !== "fresh" && <p className="stale-note">{lang === "en" ? "Latest retrieval failed or this record has aged. Last verified daily means are retained; newer flow is unknown." : "La última consulta falló o el registro ha envejecido. Se conservan los promedios verificados; el caudal más reciente se desconoce."}</p>}
            <p className="trend-source">{lang === "en" ? "Historical period" : "Período histórico"}: {station.historicalPeriod ?? "—"}. <a href={station.sourceUrl} target="_blank" rel="noreferrer">USGS {station.site} ↗</a></p>
          </article>;
        })}
      </div>
      <p className="period-note">{lang === "en" ? "Current-year USGS means can be provisional. Partial weeks use available observations; the percentage uses the 10-year average for those exact observed dates when available, otherwise the historical mean. Full weeks give a steadier comparison. City prior-year charts above provide reservoir context; a verified ten-year numeric series is not available here for City reservoir levels or supply." : "Los promedios del año actual pueden ser provisionales. Las semanas parciales usan observaciones disponibles; el porcentaje usa el promedio de 10 años para esas fechas exactas cuando está disponible; si no, usa el histórico. Las semanas completas dan una comparación más estable. Las gráficas anteriores de la Ciudad ofrecen contexto para los embalses; no hay aquí una serie numérica verificada de diez años para niveles de embalses o suministro."}</p>
    </div>
  </section>;
}
