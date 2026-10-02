"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { observedSegments, trendWindow, weeklyFlow } from "../scripts/trend-series.mjs";

type Lang = "en" | "es";
type Point = { date: string; value: number | null };
type Series = { label: string; color: string; points: Point[]; dashed?: boolean };
type HistoryDay = { date: string; values: { supply: { total: number | null }; reservoirs: { michie: number | null; little: number | null } } };
type Station = { name: string; site: string; sourceUrl: string; historicalPeriod: string | null; status: "fresh" | "stale" | "unavailable"; days: { date: string; currentYear: number | null; historicalMean: number }[] };

function dateLabel(date: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function Chart({ title, description, series, window, unit, lang, zeroReference = false, gapDays = 1, domain }: {
  title: string; description: string; series: Series[]; window: { start: string; end: string }; unit: string; lang: Lang; zeroReference?: boolean; gapDays?: number; domain?: [number, number];
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const height = 246;
  const left = 45, right = 13, top = 26, bottom = 33;
  const values = series.flatMap((s) => s.points.flatMap((p) => p.value === null ? [] : [p.value]));
  const minimum = Math.min(0, ...(domain ?? values));
  const maximum = Math.max(0, ...(domain ?? values));
  const step = zeroReference ? Math.max(2, Math.ceil(Math.abs(minimum) / 4)) : Math.max(1, Math.ceil(maximum / 4));
  const low = Math.floor(minimum / step) * step;
  const high = Math.max(low + step, Math.ceil(maximum / step) * step);
  const start = Date.parse(`${window.start}T00:00:00Z`), end = Date.parse(`${window.end}T00:00:00Z`);
  const x = (date: string) => left + (Date.parse(`${date}T00:00:00Z`) - start) / Math.max(1, end - start) * (width - left - right);
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom);
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step);
  const dates = [window.start, new Date(start + (end - start) / 2).toISOString().slice(0, 10), window.end];
  return <div ref={container} className="context-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{description}</desc>
      <text className="context-axis" x={left} y={14}>{unit}</text>
      {ticks.map((tick) => <g key={tick}>
        <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className={zeroReference && tick === 0 ? "full-pool-line" : "context-grid-line"} />
        <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="context-axis">{tick}</text>
      </g>)}
      {zeroReference && <text x={width - right} y={y(0) - 7} textAnchor="end" className="context-axis">{lang === "en" ? "Full pool" : "Cota máxima"}</text>}
      {dates.map((date, i) => <text key={date} x={x(date)} y={height - 9} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="context-axis">{dateLabel(date, lang)}</text>)}
      {series.map((s) => <g key={s.label}>
        {observedSegments(s.points, gapDays).map((segment, i) => <path key={i} d={segment.map((p, index) => `${index ? "L" : "M"}${x(p.date)},${y(p.value)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "6 5" : undefined} />)}
        {!s.dashed && s.points.map((p) => p.value === null ? null : <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={gapDays === 1 ? 3 : 2.5} fill={s.color}>
          <title>{`${s.label} · ${dateLabel(p.date, lang)}: ${p.value.toFixed(2)} ${unit}`}</title>
        </circle>)}
      </g>)}
    </svg>
    <div className="context-legend">{series.map((s) => <span key={s.label}><i style={{ borderColor: s.color, borderStyle: s.dashed ? "dashed" : "solid" }} />{s.label}</span>)}</div>
    {!values.length && <p>{lang === "en" ? "No observations in this period." : "No hay observaciones en este período."}</p>}
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
      <p className="period-note" aria-live="polite">{lang === "en" ? "Showing" : "Mostrando"} {dateLabel(window.start, lang)} – {dateLabel(window.end, lang)}, {year}. {lang === "en" ? "Dots are dated readings; gaps mean no observation. No values are filled in." : "Los puntos son lecturas fechadas; los huecos indican que falta una observación. No se rellenan valores."}</p>
      <div id="reservoirs" className="trend-section-heading"><span>01</span><div><h3>{lang === "en" ? "Reservoirs: how far below full?" : "Embalses: ¿cuánto falta para llenarse?"}</h3><p>{lang === "en" ? "Both graphs use the same scale. Higher means closer to full pool. Feet below full pool are not a percentage of usable storage." : "Ambas gráficas usan la misma escala. Más alto significa más cerca de la cota máxima. Los pies bajo la cota máxima no representan un porcentaje del agua utilizable."}</p></div></div>
      <div className="context-card-grid">
        {reservoirs.map((lake) => {
          const points = selected.map((day) => ({ date: day.date, value: day.values.reservoirs[lake.key] === null ? null : day.values.reservoirs[lake.key]! - lake.fullPool }));
          const latest = points.filter((p) => p.value !== null).at(-1);
          return <article className="trend-card" key={lake.key}>
            <div className="trend-card-heading"><h4>{lake.name}</h4>{lake.status}</div>
            <p className="trend-reading"><strong>{latest ? Math.abs(latest.value!).toFixed(2) : "—"}</strong> {lang === "en" ? (latest && latest.value! > 0 ? "ft above full" : "ft below full") : (latest && latest.value! > 0 ? "pies sobre la cota máxima" : "pies bajo la cota máxima")}</p>
            <p className="observation-date">{latest ? `${lang === "en" ? "Observed" : "Observado"} ${dateLabel(latest.date, lang)}` : "—"}</p>
            <Chart title={`${lake.name}: ${lang === "en" ? "elevation relative to full pool" : "nivel respecto a la cota máxima"}`} description={observationSummary(points, lang, "ft")} series={[{ label: lake.name, color: lake.key === "michie" ? "#137772" : "#a85e20", points }]} window={window} unit="ft" zeroReference domain={lakeDomain} lang={lang} />
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
        <Chart title={lang === "en" ? "Estimated days of supply over time" : "Días de suministro estimado a lo largo del tiempo"} description={observationSummary(supply, lang, lang === "en" ? "days" : "días")} series={[{ label: lang === "en" ? "Total supply" : "Suministro total", color: "#07516e", points: supply }]} window={window} unit={lang === "en" ? "days" : "días"} lang={lang} />
        <p className="trend-change">{observationSummary(supply, lang, lang === "en" ? "days" : "días")}</p>
        <p className="trend-source"><a href="https://www.durhamnc.gov/1214/Current-Data" target="_blank" rel="noreferrer">{lang === "en" ? "Official City supply estimate" : "Estimación oficial del suministro"} ↗</a> · <a href="#supply-breakdown">{lang === "en" ? "What makes up this estimate?" : "¿Cómo se calcula esta estimación?"}</a></p>
      </article>
      <div id="rivers" className="trend-section-heading"><span>03</span><div><h3>{lang === "en" ? "River flow: is this typical for the season?" : "Caudal: ¿es normal para la temporada?"}</h3><p>{lang === "en" ? "Weekly averages of USGS daily means compared with the historical daily mean for the same time of year. The year view shows the usual seasonal pattern through December." : "Promedios semanales del caudal medio diario del USGS comparados con el promedio histórico de la misma época. La vista anual muestra el patrón estacional hasta diciembre."}</p></div></div>
      <div className="context-card-grid">
        {stations.map((station) => {
          const weekly = weeklyFlow(station.days, window, end);
          const recent = weekly.filter((p) => p.current !== null).at(-1);
          const difference = recent?.pairedHistorical ? Math.round((recent.current! / recent.pairedHistorical - 1) * 100) : null;
          return <article className="trend-card" key={station.site}>
            <div className="trend-card-heading"><h4>{station.name}</h4><span className={`status ${station.status}`}>{lang === "en" ? { fresh: "Verified", stale: "Stale · retained", unavailable: "Unavailable" }[station.status] : { fresh: "Verificado", stale: "Antiguo · conservado", unavailable: "No disponible" }[station.status]}</span></div>
            <p className="trend-reading"><strong>{difference === null ? "—" : `${Math.abs(difference)}%`}</strong> {difference === null ? "" : lang === "en" ? `${difference > 0 ? "above" : "below"} historical mean` : `${difference > 0 ? "sobre" : "bajo"} el promedio histórico`}</p>
            <p className="observation-date">{recent?.through ? `${dateLabel(recent.start, lang)} – ${dateLabel(recent.through, lang)} · ${recent.count}/7 ${lang === "en" ? "daily readings" : "lecturas diarias"}` : lang === "en" ? "Comparison unavailable" : "Comparación no disponible"}</p>
            <Chart title={`${station.name}: ${year} ${lang === "en" ? "vs historical daily mean" : "frente al promedio diario histórico"}`} description={lang === "en" ? "Weekly averages in cubic feet per second. The dashed line is the historical mean. Missing weeks are gaps." : "Promedios semanales en pies cúbicos por segundo. La línea discontinua es el promedio histórico. Las semanas faltantes son huecos."} series={[{ label: year, color: "#07516e", points: weekly.map((p) => ({ date: p.date, value: p.current })) }, { label: lang === "en" ? "Historical daily mean" : "Promedio diario histórico", color: "#a85e20", dashed: true, points: weekly.map((p) => ({ date: p.date, value: p.historical })) }]} window={window} unit="ft³/s" lang={lang} gapDays={7} />
            {station.status !== "fresh" && <p className="stale-note">{lang === "en" ? "Latest retrieval failed or this record has aged. Last verified daily means are retained; newer flow is unknown." : "La última consulta falló o el registro ha envejecido. Se conservan los promedios verificados; el caudal más reciente se desconoce."}</p>}
            <p className="trend-source">{lang === "en" ? "Historical period" : "Período histórico"}: {station.historicalPeriod ?? "—"}. <a href={station.sourceUrl} target="_blank" rel="noreferrer">USGS {station.site} ↗</a></p>
          </article>;
        })}
      </div>
      <p className="period-note">{lang === "en" ? "Current-year USGS means can be provisional. Partial weeks use available observations; the percentage compares historical means for those same dates. Full weeks give a steadier comparison. City prior-year charts above provide reservoir context; this page has no long-term supply average." : "Los promedios del año actual pueden ser provisionales. Las semanas parciales usan observaciones disponibles; el porcentaje compara promedios históricos de esas mismas fechas. Las semanas completas dan una comparación más estable. Las gráficas anteriores de la Ciudad ofrecen contexto para los embalses; no hay promedio a largo plazo del suministro."}</p>
    </div>
  </section>;
}
