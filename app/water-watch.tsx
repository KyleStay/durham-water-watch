"use client";

import { useEffect, useMemo, useState } from "react";
import verifiedSnapshot from "../public/data/dashboard.json";
import verifiedHistory from "../public/data/history.json";
import verifiedStreamflowHistory from "../public/data/streamflow-history.json";

type Lang = "en" | "es";
type Freshness = "fresh" | "stale" | "unavailable";
type Metric = {
  value: number | string | null;
  units: string;
  sourceUrl: string;
  observedAt: string | null;
  verifiedAt: string | null;
  status: Freshness;
  note?: string;
  previousValue?: number | string | null;
  retrievalStatus?: "verified" | "failed" | "unavailable";
  validationResult?: "accepted" | "rejected" | "unavailable";
};
type DashboardData = {
  stage: Metric & { effectiveDate: string | null };
  supply: {
    accessible: Metric;
    belowIntakes: Metric;
    quarry: Metric;
    total: Metric;
  };
  reservoirs: {
    michie: Metric & { fullPool: number };
    little: Metric & { fullPool: number };
  };
  drought: Metric;
  streamflow: { flat: Metric; little: Metric };
  historyStarts: string;
  generatedAt?: string;
  lastRefreshResult?: string;
};
type DailyValues = {
  stage: number | null;
  supply: {
    accessible: number | null;
    belowIntakes: number | null;
    quarry: number | null;
    total: number | null;
  };
  reservoirs: { michie: number | null; little: number | null };
  drought: string | null;
  streamflow: { flat: number | null; little: number | null };
};
type DailyEntry = {
  date: string;
  capturedAt: string;
  values: DailyValues;
  retainedFields?: string[];
  quarantinedFields?: string[];
};
type HistoryData = { schemaVersion: number; days: DailyEntry[] };
type StreamflowHistoryDay = {
  date: string;
  currentYear: number;
  historicalMean: number;
  historicalSampleYears: number;
};
type StreamflowHistoryStation = {
  site: string;
  name: string;
  status: Freshness;
  sourceUrl: string;
  historicalPeriod: string | null;
  days: StreamflowHistoryDay[];
  note?: string;
};
type StreamflowHistoryData = {
  schemaVersion: number;
  year: number;
  updatedAt: string | null;
  stations: { flat: StreamflowHistoryStation; little: StreamflowHistoryStation };
};

const urls = {
  stage: "https://www.durhamnc.gov/1061/Durham-Saves-Water",
  data: "https://www.durhamnc.gov/1214/Current-Data",
  lakes: "https://www.durhamnc.gov/1225/Lake-Levels",
  plan: "https://www.durhamnc.gov/DocumentCenter/View/4291",
  drought: "https://www.ncdrought.org/",
  flat: "https://waterdata.usgs.gov/monitoring-location/02085500/",
  little: "https://waterdata.usgs.gov/monitoring-location/0208521324/",
  alerts: "https://www.durhamnc.gov/AlertCenter.aspx",
  daupler: "https://www.durhamnc.gov/formcenter/wm-cbs-encrypted-39/daupler-notification-373",
  watershed: "https://www.durhamnc.gov/DocumentCenter/View/25818/DurhamWatershedSummary2019_0307_Letter",
};

const seed = verifiedSnapshot as DashboardData;
const historySeed = verifiedHistory as HistoryData;
const streamflowHistorySeed = verifiedStreamflowHistory as StreamflowHistoryData;

const copy = {
  en: {
    skip: "Skip to main content",
    unofficial: "Unofficial independent community dashboard",
    title: "Durham Water Watch",
    deck: "Current water status for Durham",
    official: "Official City guidance always takes precedence.",
    nav: ["Overview", "Daily trends", "Reservoirs", "What to do", "Drought explained", "Sources & methodology"],
    serious: "How serious is this?",
    stage: "Durham Water Shortage Response Stage",
    inEffect: "in effect",
    effective: "Effective",
    checked: "Official source checked",
    supply: "Total estimated days of supply",
    notCountdown: "A planning estimate based on current demand—not a guaranteed countdown.",
    risk: "Mandatory restrictions are active while dry conditions and low reservoir levels continue.",
    actionEyebrow: "Highest-priority action",
    action: "Do not use City water for spray irrigation.",
    allRules: "See all official restrictions",
    composed: "How the official total is composed",
    accessible: "Easily accessible reservoir supply",
    below: "Below intake structures",
    quarry: "Teer Quarry emergency storage",
    total: "Official total",
    trend: "Recent direction",
    trendMissing: "No earlier verified reading is stored yet. Direction will appear after the next accepted City reading.",
    twoSignals: "Two signals, different jobs",
    droughtTitle: "NC drought category",
    droughtDesc: "A regional classification of dryness from the NC Drought Management Advisory Council.",
    shortageTitle: "Durham shortage stage",
    shortageDesc: "The City’s operational response that controls local water-use restrictions.",
    whyDiffer: "Why these can differ",
    whyText: "Drought describes regional dryness. Durham’s stage also reflects usable storage, demand, treatment and distribution conditions, forecasts, and management decisions. One does not mechanically set the other.",
    reservoirs: "Reservoir elevations",
    reservoirIntro: "Elevation is shown against the official full-pool elevation. It is not percent storage.",
    current: "Current elevation",
    full: "Official full pool",
    belowFull: "Feet below full",
    derived: "Arithmetic derived from the two official elevations",
    sourceReading: "Source reading",
    viewLake: "View official Lake Levels source",
    officialCharts: "City-published reservoir charts",
    chartIntro: "These are the City’s chart images, shown without tracing, digitizing, or recreating their plotted lines.",
    recentChart: "Previous 30 days",
    michieAnnual: "Lake Michie historical / annual",
    littleAnnual: "Little River historical / annual",
    openChart: "Open the official chart",
    accumulated: "Verified readings accumulated by this dashboard",
    historyBegins: "Local history begins",
    oneReading: "Only one verified reading is stored so far. Native trend charts will appear after enough readings accumulate.",
    reservoirName: "Reservoir",
    elevation: "Elevation",
    status: "Status",
    observed: "Observed",
    whatNow: "What to do now",
    rulesCaveat: "Plain-language summary of the currently verified City page. The complete official rules control.",
    prohibited: "Do not",
    allowed: "Allowed alternatives",
    special: "Other Stage 2 rules",
    readRules: "Read the complete official rules",
    confirmRules: "Because stage verification is stale, confirm current rules on the City website.",
    flow: "Watershed context: streamflow",
    flowExplain: "Streamflow is context about water moving through the feeding rivers. It is not a direct measure of reservoir storage, days of supply, refill, or future shortage stages.",
    provisional: "Provisional",
    contextMap: "How the watershed connects",
    mapNote: "Schematic geographic context based on the City watershed summary—not a property, regulatory-boundary, or service-area map.",
    alerts: "Stay connected to official alerts",
    alertCenter: "City of Durham Alert Center",
    alertText: "Review active alerts and the City’s available Notify Me / RSS options.",
    daupler: "Daupler Notify",
    dauplerText: "Primarily covers water and sewer service disruptions. It is not presented here as a guaranteed shortage-stage notification.",
    timeline: "Verified milestones",
    currentStageEvent: "Stage 2 took effect",
    noLater: "No later escalation, de-escalation, or rescission has been added without an official announcement.",
    method: "Sources & methodology",
    methodology: "This dashboard links every operational metric to its authoritative source, keeps the last verified value when refreshes fail, and never substitutes an estimate.",
    corrections: "Corrections",
    correctionText: "See something wrong? Contact: corrections@example.org (replace before public launch).",
    independent: "Independent ownership",
    noAffiliation: "Not operated by or affiliated with the City of Durham. No accounts, ads, address lookup, or behavioral tracking.",
    fresh: "Fresh",
    stale: "Stale",
    unavailable: "Official reading unavailable",
    lastVerified: "last verified",
    refreshFail: "The official source could not be refreshed.",
    source: "Source",
    languageChanged: "Language changed to English.",
    refreshed: "Latest stored source checks loaded.",
  },
  es: {
    skip: "Saltar al contenido principal",
    unofficial: "Panel comunitario independiente no oficial",
    title: "Durham Water Watch",
    deck: "Estado actual del agua en Durham",
    official: "La orientación oficial de la Ciudad siempre tiene prioridad.",
    nav: ["Resumen", "Tendencias diarias", "Embalses", "Qué hacer", "La sequía explicada", "Fuentes y metodología"],
    serious: "¿Qué tan grave es?",
    stage: "Etapa de Respuesta a la Escasez de Agua de Durham",
    inEffect: "vigente",
    effective: "Vigente desde",
    checked: "Fuente oficial verificada",
    supply: "Días totales estimados de suministro",
    notCountdown: "Una estimación de planificación según la demanda actual, no una cuenta regresiva garantizada.",
    risk: "Las restricciones obligatorias están vigentes mientras continúan las condiciones secas y los niveles bajos.",
    actionEyebrow: "Acción de mayor prioridad",
    action: "No use agua de la Ciudad para riego por aspersión.",
    allRules: "Ver todas las restricciones oficiales",
    composed: "Cómo se compone el total oficial",
    accessible: "Suministro de fácil acceso en los embalses",
    below: "Agua debajo de las tomas",
    quarry: "Reserva de emergencia de Teer Quarry",
    total: "Total oficial",
    trend: "Dirección reciente",
    trendMissing: "Aún no hay una lectura verificada anterior. La dirección aparecerá después de la próxima lectura aceptada de la Ciudad.",
    twoSignals: "Dos señales, funciones distintas",
    droughtTitle: "Categoría de sequía de NC",
    droughtDesc: "Clasificación regional de la sequedad del Consejo Asesor de Manejo de Sequías de NC.",
    shortageTitle: "Etapa de escasez de Durham",
    shortageDesc: "Respuesta operativa de la Ciudad que controla las restricciones locales de uso del agua.",
    whyDiffer: "Por qué pueden diferir",
    whyText: "La sequía describe la sequedad regional. La etapa de Durham también considera almacenamiento utilizable, demanda, tratamiento, distribución, pronósticos y decisiones de manejo. Una no determina mecánicamente a la otra.",
    reservoirs: "Elevaciones de los embalses",
    reservoirIntro: "La elevación se compara con la cota oficial de capacidad. No representa un porcentaje de almacenamiento.",
    current: "Elevación actual",
    full: "Cota oficial de capacidad",
    belowFull: "Pies por debajo de capacidad",
    derived: "Aritmética derivada de las dos elevaciones oficiales",
    sourceReading: "Lectura de la fuente",
    viewLake: "Ver la fuente oficial de niveles",
    officialCharts: "Gráficas de embalses publicadas por la Ciudad",
    chartIntro: "Son imágenes oficiales de la Ciudad; no se trazan, digitalizan ni recrean sus líneas.",
    recentChart: "30 días anteriores",
    michieAnnual: "Lake Michie: histórica / anual",
    littleAnnual: "Little River: histórica / anual",
    openChart: "Abrir la gráfica oficial",
    accumulated: "Lecturas verificadas acumuladas por este panel",
    historyBegins: "El historial local comienza",
    oneReading: "Por ahora solo hay una lectura verificada. Las gráficas nativas aparecerán cuando se acumulen suficientes lecturas.",
    reservoirName: "Embalse",
    elevation: "Elevación",
    status: "Estado",
    observed: "Observada",
    whatNow: "Qué hacer ahora",
    rulesCaveat: "Resumen en lenguaje sencillo de la página de la Ciudad actualmente verificada. Rigen las reglas oficiales completas.",
    prohibited: "No haga",
    allowed: "Alternativas permitidas",
    special: "Otras reglas de la Etapa 2",
    readRules: "Lea las reglas oficiales completas",
    confirmRules: "Como la verificación de la etapa está desactualizada, confirme las reglas actuales en el sitio de la Ciudad.",
    flow: "Contexto de la cuenca: caudal",
    flowExplain: "El caudal aporta contexto sobre el agua que circula por los ríos. No mide directamente el almacenamiento, los días de suministro, la recarga ni futuras etapas.",
    provisional: "Provisional",
    contextMap: "Cómo se conecta la cuenca",
    mapNote: "Contexto geográfico esquemático basado en el resumen de la Ciudad; no es un mapa de propiedades, límites regulatorios ni área de servicio.",
    alerts: "Manténgase conectado con alertas oficiales",
    alertCenter: "Centro de Alertas de la Ciudad",
    alertText: "Consulte alertas activas y las opciones Notify Me / RSS disponibles.",
    daupler: "Daupler Notify",
    dauplerText: "Cubre principalmente interrupciones de agua y alcantarillado. No se presenta como garantía de avisos sobre etapas.",
    timeline: "Hitos verificados",
    currentStageEvent: "Entró en vigor la Etapa 2",
    noLater: "No se añade una escalada, reducción o rescisión posterior sin un anuncio oficial.",
    method: "Fuentes y metodología",
    methodology: "Este panel enlaza cada métrica operativa con su fuente autorizada, conserva el último valor verificado si falla la actualización y nunca sustituye una estimación.",
    corrections: "Correcciones",
    correctionText: "¿Ve algo incorrecto? Contacto: corrections@example.org (reemplazar antes del lanzamiento público).",
    independent: "Propiedad independiente",
    noAffiliation: "No operado ni afiliado con la Ciudad de Durham. Sin cuentas, publicidad, búsqueda de direcciones ni rastreo conductual.",
    fresh: "Actual",
    stale: "Desactualizado",
    unavailable: "Lectura oficial no disponible",
    lastVerified: "última verificación",
    refreshFail: "No se pudo actualizar la fuente oficial.",
    source: "Fuente",
    languageChanged: "Idioma cambiado a español.",
    refreshed: "Se cargaron las últimas verificaciones almacenadas.",
  },
} as const;

function fmtDate(value: string | null, lang: Lang, withTime = false) {
  if (!value) return copy[lang].unavailable;
  const date = new Date(value.length === 10 ? `${value}T12:00:00-04:00` : value);
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-US", {
    month: "long", day: "numeric", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: "America/New_York" } : {}),
  }).format(date);
}

function Status({ metric, lang }: { metric: Metric; lang: Lang }) {
  const t = copy[lang];
  if (metric.status === "unavailable" || metric.value === null) return <span className="status unavailable">× {t.unavailable}</span>;
  if (metric.status === "stale") {
    return <span className="status stale">! {t.stale}—{t.lastVerified} {fmtDate(metric.verifiedAt, lang, true)}</span>;
  }
  return <span className="status fresh">✓ {t.fresh}</span>;
}

function SourceLine({ metric, lang, label }: { metric: Metric; lang: Lang; label?: string }) {
  const t = copy[lang];
  return (
    <p className="source-line">
      <span>{metric.observedAt ? `${t.observed}: ${fmtDate(metric.observedAt, lang, metric.observedAt.includes("T"))}` : t.unavailable}</span>
      <a href={metric.sourceUrl} target="_blank" rel="noreferrer">{label || t.source} ↗</a>
    </p>
  );
}

function ReservoirCard({ name, metric, lang }: { name: string; metric: Metric & { fullPool: number }; lang: Lang }) {
  const t = copy[lang];
  const below = typeof metric.value === "number" ? (metric.fullPool - metric.value).toFixed(2) : null;
  return (
    <article className="reservoir-card">
      <div className="card-top"><p className="eyebrow">{name}</p><Status metric={metric} lang={lang} /></div>
      {metric.status === "stale" && (
        <p className="stale-note">
          {metric.note?.includes("could not be refreshed")
            ? t.refreshFail
            : lang === "en"
              ? "The City’s latest dated reading is older than this dashboard’s two-day freshness threshold."
              : "La lectura fechada más reciente de la Ciudad supera el umbral de vigencia de dos días de este panel."}
        </p>
      )}
      <div className="reservoir-number">
        <span>{metric.value ?? "—"}</span><small>ft msl</small>
      </div>
      <p className="metric-label">{t.current}</p>
      <dl className="level-grid">
        <div><dt>{t.full}</dt><dd>{metric.fullPool.toFixed(2)} ft msl</dd></div>
        <div><dt>{t.belowFull}</dt><dd>{below ?? "—"} ft</dd><small>{t.derived}</small></div>
      </dl>
      <SourceLine metric={metric} lang={lang} label={t.viewLake} />
    </article>
  );
}

function fmtDailyDate(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(`${value}T12:00:00-04:00`));
}

type BarSeries = {
  label: string;
  color: string;
  values: Array<number | null>;
  format: (value: number) => string;
};
type ChartReference = {
  label: string;
  value: number;
  color: string;
  format: (value: number) => string;
};

function DailyBarChart({
  title,
  description,
  days,
  series,
  references = [],
  lang,
}: {
  title: string;
  description: string;
  days: DailyEntry[];
  series: BarSeries[];
  references?: ChartReference[];
  lang: Lang;
}) {
  const allValues = [
    ...series.flatMap((item) => item.values).filter((value): value is number => typeof value === "number"),
    ...references.map((reference) => reference.value),
  ];
  const maximum = Math.max(1, ...allValues);
  return (
    <figure className="daily-chart">
      <figcaption>
        <h3>{title}</h3>
        <p>{description}</p>
      </figcaption>
      <div className="daily-chart-legend" aria-hidden="true">
        {series.map((item) => <span key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}
        {references.map((item) => <span key={item.label}><i className="reference-key" style={{ borderColor: item.color }} />{item.label}</span>)}
      </div>
      <div className="daily-chart-scroll">
        <div className="daily-chart-plot" role="img" aria-label={`${title}. ${description}`}>
          {references.map((reference) => (
            <div
              className="daily-chart-reference"
              key={reference.label}
              style={{
                bottom: `${28 + (reference.value / maximum) * 228}px`,
                borderColor: reference.color,
                color: reference.color,
              }}
            >
              <span>{reference.label}: {reference.format(reference.value)}</span>
            </div>
          ))}
          {days.map((day, dayIndex) => (
            <div className="daily-chart-day" key={day.date}>
              <div className="daily-chart-bars">
                {series.map((item) => {
                  const value = item.values[dayIndex];
                  const height = typeof value === "number" ? Math.max(7, (value / maximum) * 100) : 0;
                  return (
                    <div className="daily-chart-bar-wrap" key={item.label}>
                      <span>{typeof value === "number" ? item.format(value) : "—"}</span>
                      <i
                        style={{ height: `${height}%`, backgroundColor: item.color }}
                        title={`${item.label}: ${typeof value === "number" ? item.format(value) : "unavailable"}`}
                      />
                    </div>
                  );
                })}
              </div>
              <time dateTime={day.date}>{fmtDailyDate(day.date, lang)}</time>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function dailyQuality(day: DailyEntry, lang: Lang) {
  const retained = day.retainedFields?.length ?? 0;
  const quarantined = day.quarantinedFields?.length ?? 0;
  if (quarantined) return lang === "en" ? `${quarantined} quarantined` : `${quarantined} en cuarentena`;
  if (retained) return lang === "en" ? `${retained} retained` : `${retained} conservado${retained === 1 ? "" : "s"}`;
  return lang === "en" ? "All current" : "Todo vigente";
}

function numericAverage(values: Array<number | null>) {
  const available = values.filter((value): value is number => typeof value === "number");
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

function weeklyStreamflow(days: StreamflowHistoryDay[]) {
  if (!days.length) return [];
  const year = Number(days[0].date.slice(0, 4));
  const yearStart = Date.UTC(year, 0, 1);
  const groups = new Map<number, StreamflowHistoryDay[]>();
  for (const day of days) {
    const week = Math.floor((Date.parse(`${day.date}T00:00:00Z`) - yearStart) / 604_800_000);
    groups.set(week, [...(groups.get(week) ?? []), day]);
  }
  return [...groups.entries()].map(([week, values]) => ({
    week,
    date: values.at(-1)?.date ?? values[0].date,
    current: values.reduce((sum, value) => sum + value.currentYear, 0) / values.length,
    historical: values.reduce((sum, value) => sum + value.historicalMean, 0) / values.length,
    count: values.length,
  }));
}

function YearComparisonChart({ station, year, lang }: {
  station: StreamflowHistoryStation;
  year: number;
  lang: Lang;
}) {
  const weekly = weeklyStreamflow(station.days);
  const width = 1000;
  const height = 360;
  const plot = { left: 72, top: 24, right: 24, bottom: 52 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maximum = Math.max(1, ...weekly.flatMap((point) => [point.current, point.historical]));
  const niceMaximum = Math.ceil(maximum / 50) * 50;
  const x = (week: number) => plot.left + (week / 52) * plotWidth;
  const y = (value: number) => plot.top + plotHeight - (value / niceMaximum) * plotHeight;
  const pathFor = (key: "current" | "historical") => weekly
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.week).toFixed(1)} ${y(point[key]).toFixed(1)}`)
    .join(" ");
  const recent = weekly.at(-1);
  const recentDifference = recent && recent.historical
    ? Math.round(((recent.current - recent.historical) / recent.historical) * 100)
    : null;
  const monthTicks = [
    [0, lang === "en" ? "Jan" : "Ene"],
    [9, lang === "en" ? "Mar" : "Mar"],
    [17, lang === "en" ? "May" : "May"],
    [26, lang === "en" ? "Jul" : "Jul"],
    [35, lang === "en" ? "Sep" : "Sep"],
    [43, lang === "en" ? "Nov" : "Nov"],
    [52, lang === "en" ? "Dec" : "Dic"],
  ] as const;

  return (
    <figure className="year-comparison-chart">
      <figcaption>
        <div>
          <p className="eyebrow">USGS {station.site}</p>
          <h3>{station.name}: {year} {lang === "en" ? "vs historical daily mean" : "frente al promedio diario histórico"}</h3>
          <p>
            {lang === "en"
              ? `Weekly averages of USGS daily-mean flow. Historical comparison period: ${station.historicalPeriod ?? "unavailable"}.`
              : `Promedios semanales del caudal medio diario del USGS. Período histórico: ${station.historicalPeriod ?? "no disponible"}.`}
          </p>
        </div>
        <div className="year-comparison-summary">
          <strong>{recentDifference === null ? "—" : `${Math.abs(recentDifference)}%`}</strong>
          <span>
            {recentDifference === null
              ? (lang === "en" ? "comparison unavailable" : "comparación no disponible")
              : lang === "en"
                ? `${recentDifference >= 0 ? "above" : "below"} the historical mean in the latest plotted week`
                : `${recentDifference >= 0 ? "por encima" : "por debajo"} del promedio histórico en la última semana graficada`}
          </span>
        </div>
      </figcaption>
      <div className="year-chart-legend">
        <span><i className="current-year-key" />{year}</span>
        <span><i className="historical-key" />{lang === "en" ? "Historical daily mean" : "Promedio diario histórico"}</span>
        <span className={`history-source-status ${station.status}`}>{station.status}</span>
      </div>
      {weekly.length ? (
        <div className="year-chart-scroll">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${station.site}-title ${station.site}-desc`}>
            <title id={`${station.site}-title`}>{station.name} {year} streamflow compared with the historical daily mean</title>
            <desc id={`${station.site}-desc`}>Weekly averages in cubic feet per second. The solid blue line is {year}; the dashed orange line is the USGS historical daily mean.</desc>
            {[0, niceMaximum / 2, niceMaximum].map((tick) => (
              <g key={tick}>
                <line className="year-grid-line" x1={plot.left} x2={width - plot.right} y1={y(tick)} y2={y(tick)} />
                <text className="year-axis-label" x={plot.left - 10} y={y(tick) + 4} textAnchor="end">{Math.round(tick)}</text>
              </g>
            ))}
            {monthTicks.map(([week, label]) => (
              <text className="year-axis-label" key={week} x={x(week)} y={height - 18} textAnchor={week === 0 ? "start" : week === 52 ? "end" : "middle"}>{label}</text>
            ))}
            <text className="year-axis-title" transform={`translate(17 ${plot.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">ft³/s</text>
            <path className="historical-flow-line" d={pathFor("historical")} />
            <path className="current-flow-line" d={pathFor("current")} />
            {recent && <circle className="current-flow-point" cx={x(recent.week)} cy={y(recent.current)} r="5" />}
          </svg>
        </div>
      ) : <p className="stale-note">{station.note ?? (lang === "en" ? "Year comparison unavailable." : "Comparación anual no disponible.")}</p>}
      <p className="year-chart-source">
        {lang === "en"
          ? "Current-year daily means can be provisional. Historical means are USGS day-of-year statistics based on approved daily-mean records."
          : "Los promedios diarios del año actual pueden ser provisionales. Los promedios históricos son estadísticas del USGS basadas en registros diarios aprobados."}
        {" "}<a href={station.sourceUrl} target="_blank" rel="noreferrer">{lang === "en" ? "Official station" : "Estación oficial"} ↗</a>
      </p>
    </figure>
  );
}

function StageExitExplorer({ lang }: { lang: Lang }) {
  const [startingStorage, setStartingStorage] = useState(70);
  const [rainfall, setRainfall] = useState(10);
  const [rainResponse, setRainResponse] = useState(0.8);
  const [systemDraw, setSystemDraw] = useState(10);

  const models = [
    { key: "low", multiplier: 0.5, label: lang === "en" ? "Low response" : "Respuesta baja" },
    { key: "middle", multiplier: 1, label: lang === "en" ? "Middle response" : "Respuesta media" },
    { key: "high", multiplier: 1.5, label: lang === "en" ? "High response" : "Respuesta alta" },
  ].map((model) => ({
    ...model,
    netChange: rainfall * rainResponse * model.multiplier - systemDraw,
    endingStorage: Math.max(0, Math.min(100, startingStorage + rainfall * rainResponse * model.multiplier - systemDraw)),
  }));
  const weeks = [0, 2, 4, 6, 8, 10];

  const applyPreset = (preset: "dry" | "middle" | "wet") => {
    const values = {
      dry: [5, 0.4, 14],
      middle: [10, 0.8, 10],
      wet: [18, 1.2, 8],
    }[preset];
    setRainfall(values[0]);
    setRainResponse(values[1]);
    setSystemDraw(values[2]);
  };

  return (
    <section className="scenario-explorer" aria-labelledby="scenario-title">
      <div className="scenario-heading">
        <div>
          <p className="eyebrow">{lang === "en" ? "Illustrative scenario explorer" : "Explorador de escenarios ilustrativos"}</p>
          <h3 id="scenario-title">{lang === "en" ? "Test how assumptions change the 10-week path" : "Pruebe cómo los supuestos cambian la trayectoria de 10 semanas"}</h3>
        </div>
        <p className="model-warning">
          <strong>{lang === "en" ? "Not an official forecast." : "No es un pronóstico oficial."}</strong>{" "}
          {lang === "en"
            ? "All four inputs are assumptions. They are not derived from current reservoir elevations."
            : "Los cuatro datos son supuestos. No se derivan de las elevaciones actuales de los embalses."}
        </p>
      </div>

      <div className="preset-row" aria-label={lang === "en" ? "Example assumption sets" : "Conjuntos de supuestos de ejemplo"}>
        <span>{lang === "en" ? "Examples:" : "Ejemplos:"}</span>
        <button type="button" onClick={() => applyPreset("dry")}>{lang === "en" ? "Drier" : "Más seco"}</button>
        <button type="button" onClick={() => applyPreset("middle")}>{lang === "en" ? "Middle" : "Intermedio"}</button>
        <button type="button" onClick={() => applyPreset("wet")}>{lang === "en" ? "Wetter" : "Más lluvioso"}</button>
      </div>

      <div className="scenario-grid">
        <div className="scenario-controls">
          <label>
            <span><strong>{lang === "en" ? "Assumed starting combined usable storage" : "Almacenamiento utilizable combinado inicial supuesto"}</strong><output>{startingStorage}%</output></span>
            <input type="range" min="40" max="94" step="1" value={startingStorage} onInput={(event) => setStartingStorage(Number(event.currentTarget.value))} />
            <small>{lang === "en" ? "The current official value is not publicly posted." : "El valor oficial actual no se publica."}</small>
          </label>
          <label>
            <span><strong>{lang === "en" ? "Assumed rainfall over 10 weeks" : "Lluvia supuesta durante 10 semanas"}</strong><output>{rainfall} in</output></span>
            <input type="range" min="0" max="25" step="1" value={rainfall} onInput={(event) => setRainfall(Number(event.currentTarget.value))} />
            <small>{lang === "en" ? "Rainfall alone does not equal reservoir refill." : "La lluvia por sí sola no equivale a recarga del embalse."}</small>
          </label>
          <label>
            <span><strong>{lang === "en" ? "Assumed middle storage response per inch" : "Respuesta media supuesta de almacenamiento por pulgada"}</strong><output>{rainResponse.toFixed(1)} points</output></span>
            <input type="range" min="0.1" max="2" step="0.1" value={rainResponse} onInput={(event) => setRainResponse(Number(event.currentTarget.value))} />
            <small>{lang === "en" ? "A user-set conversion, not a City watershed coefficient." : "Conversión elegida por el usuario, no un coeficiente de la Ciudad."}</small>
          </label>
          <label>
            <span><strong>{lang === "en" ? "Assumed 10-week demand and other losses" : "Demanda y otras pérdidas supuestas en 10 semanas"}</strong><output>{systemDraw} points</output></span>
            <input type="range" min="0" max="25" step="1" value={systemDraw} onInput={(event) => setSystemDraw(Number(event.currentTarget.value))} />
            <small>{lang === "en" ? "Combines an assumed draw from demand, evaporation, and other losses." : "Combina una reducción supuesta por demanda, evaporación y otras pérdidas."}</small>
          </label>
        </div>

        <div className="scenario-results" aria-live="polite">
          <div className="scenario-table-wrap">
            <table>
              <caption>{lang === "en" ? "Illustrative combined usable storage path" : "Trayectoria ilustrativa del almacenamiento utilizable combinado"}</caption>
              <thead>
                <tr>
                  <th scope="col">{lang === "en" ? "Response" : "Respuesta"}</th>
                  {weeks.map((week) => <th scope="col" key={week}>{lang === "en" ? `Week ${week}` : `Sem. ${week}`}</th>)}
                  <th scope="col">{lang === "en" ? "95% target" : "Meta de 95%"}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.key}>
                    <th scope="row">{model.label}</th>
                    {weeks.map((week) => (
                      <td key={week}>{Math.max(0, Math.min(100, startingStorage + model.netChange * (week / 10))).toFixed(1)}%</td>
                    ))}
                    <td>{model.endingStorage >= 95 ? (lang === "en" ? "Reached in this illustration" : "Alcanzada en esta ilustración") : (lang === "en" ? "Not reached" : "No alcanzada")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="formula">
            {lang === "en"
              ? "Simplified arithmetic: starting storage + (rain × assumed response) − assumed draw. Low and high models use one-half and one-and-a-half times the selected response."
              : "Aritmética simplificada: almacenamiento inicial + (lluvia × respuesta supuesta) − reducción supuesta. Los modelos bajo y alto usan la mitad y una vez y media la respuesta seleccionada."}
          </p>
          <p className="probability-limit">
            <strong>{lang === "en" ? "What this cannot answer:" : "Lo que esto no puede responder:"}</strong>{" "}
            {lang === "en"
              ? "The official test also requires at least a 95% modeled probability of reaching 95% combined usable storage. This simple explorer does not calculate that probability, account for timing of storms, or predict a City decision."
              : "La prueba oficial también exige una probabilidad modelada de al menos 95% de alcanzar 95% de almacenamiento utilizable combinado. Este explorador sencillo no calcula esa probabilidad, no considera el momento de las tormentas ni predice una decisión de la Ciudad."}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function WaterWatch() {
  const [lang, setLang] = useState<Lang>("en");
  const [announcement, setAnnouncement] = useState("");
  const data = seed;
  const t = copy[lang];
  const chartVersion = encodeURIComponent(data.generatedAt ?? data.historyStarts);
  const currentHistoryYear = historySeed.days.at(-1)?.date.slice(0, 4) ?? String(new Date().getFullYear());
  const historyDays = historySeed.days.filter((day) => day.date.startsWith(currentHistoryYear));
  const latestDay = historyDays.at(-1);
  const previousDay = historyDays.at(-2);
  const supplyChange = latestDay && previousDay
    && typeof latestDay.values.supply.total === "number"
    && typeof previousDay.values.supply.total === "number"
    ? latestDay.values.supply.total - previousDay.values.supply.total
    : null;
  const trackedSupplyAverage = numericAverage(historyDays.map((day) => day.values.supply.total));
  const trackedMichieDistanceAverage = numericAverage(historyDays.map((day) => (
    typeof day.values.reservoirs.michie === "number" ? 341 - day.values.reservoirs.michie : null
  )));
  const trackedLittleDistanceAverage = numericAverage(historyDays.map((day) => (
    typeof day.values.reservoirs.little === "number" ? 355 - day.values.reservoirs.little : null
  )));
  const trackedAverageLabel = lang === "en"
    ? `${currentHistoryYear} tracked avg since ${fmtDailyDate(historyDays[0]?.date ?? data.historyStarts, lang)}`
    : `Promedio registrado de ${currentHistoryYear} desde ${fmtDailyDate(historyDays[0]?.date ?? data.historyStarts, lang)}`;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const switchLang = () => {
    const next = lang === "en" ? "es" : "en";
    setLang(next);
    setAnnouncement(copy[next].languageChanged);
  };

  const supplyParts = useMemo(() => [
    [t.accessible, data.supply.accessible],
    [t.below, data.supply.belowIntakes],
    [t.quarry, data.supply.quarry],
    [t.total, data.supply.total],
  ] as const, [data, t]);

  return (
    <>
      <a className="skip-link" href="#main">{t.skip}</a>
      <div className="sr-only" aria-live="polite">{announcement}</div>
      <header className="site-header">
        <div className="masthead wrap">
          <div>
            <p className="unofficial">{t.unofficial}</p>
            <a className="brand" href="#overview" aria-label={`${t.title} — ${t.nav[0]}`}>
              <span className="drop" aria-hidden="true" />
              <span>{t.title}</span>
            </a>
          </div>
          <button className="language" onClick={switchLang} aria-label={lang === "en" ? "Cambiar a español" : "Switch to English"}>
            <span aria-hidden="true">文</span> {lang === "en" ? "Español" : "English"}
          </button>
        </div>
        <nav className="nav wrap" aria-label={lang === "en" ? "Primary navigation" : "Navegación principal"}>
          {["overview", "trends", "reservoirs", "actions", "drought", "methodology"].map((id, index) => (
            <a key={id} href={`#${id}`}>{t.nav[index]}</a>
          ))}
        </nav>
      </header>

      <main id="main">
        <section id="overview" className="hero">
          <div className="contour contour-a" aria-hidden="true" />
          <div className="contour contour-b" aria-hidden="true" />
          <div className="wrap hero-inner">
            <div className="hero-copy">
              <p className="kicker">{t.serious}</p>
              <h1>{t.deck}</h1>
              <p className="official-priority">{t.official}</p>
            </div>
            <div className="hero-grid">
              <article className="stage-card">
                <div className="card-top">
                  <p className="eyebrow">{t.stage}</p>
                  <Status metric={data.stage} lang={lang} />
                </div>
                <div className="stage-lockup"><span>{data.stage.value ?? "—"}</span><div><strong>Stage / Etapa</strong><small>{t.inEffect}</small></div></div>
                <p className="effective">{t.effective} <time dateTime={data.stage.effectiveDate || ""}>{fmtDate(data.stage.effectiveDate, lang)}</time></p>
                <p className="checked">{t.checked}: {fmtDate(data.stage.verifiedAt, lang, true)}</p>
                <div className="risk-callout"><span aria-hidden="true">!</span><p>{t.risk}</p></div>
              </article>

              <article className="supply-card">
                <div className="card-top">
                  <p className="eyebrow">{t.supply}</p>
                  <Status metric={data.supply.total} lang={lang} />
                </div>
                <div className="supply-number"><span>{data.supply.total.value ?? "—"}</span><small>{lang === "en" ? "days" : "días"}</small></div>
                <p className="not-countdown">{t.notCountdown}</p>
                <SourceLine metric={data.supply.total} lang={lang} />
              </article>

              <article className="action-card">
                <p className="eyebrow">{t.actionEyebrow}</p>
                <h2>{t.action}</h2>
                <p>{lang === "en" ? "Hand watering, drip irrigation, and tree or shrub watering bags are allowed." : "Se permiten el riego manual, por goteo y las bolsas de riego para árboles o arbustos."}</p>
                <a className="button light" href={urls.stage} target="_blank" rel="noreferrer">{t.allRules} <span aria-hidden="true">↗</span></a>
              </article>
            </div>

            <div className="composition">
              <div className="composition-head"><h2>{t.composed}</h2><a href={urls.data} target="_blank" rel="noreferrer">{t.source} ↗</a></div>
              <div className="parts">
                {supplyParts.map(([label, metric], index) => (
                  <div className={index === 3 ? "part total-part" : "part"} key={label}>
                    <span className="part-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <p>{label}</p><strong>{metric.value ?? "—"} <small>{lang === "en" ? "days" : "días"}</small></strong>
                  </div>
                ))}
              </div>
              <div className="trend-row">
                <strong>{t.trend}</strong>
                <span>{supplyChange === null || supplyChange === 0 ? "→" : supplyChange > 0 ? "↑" : "↓"}</span>
                <p>
                  {supplyChange === null
                    ? t.trendMissing
                    : supplyChange === 0
                      ? (lang === "en" ? "No change from the previous daily snapshot." : "Sin cambios frente a la instantánea diaria anterior.")
                      : lang === "en"
                        ? `${Math.abs(supplyChange)} ${Math.abs(supplyChange) === 1 ? "day" : "days"} ${supplyChange > 0 ? "higher" : "lower"} than the previous daily snapshot.`
                        : `${Math.abs(supplyChange)} ${Math.abs(supplyChange) === 1 ? "día" : "días"} ${supplyChange > 0 ? "más" : "menos"} que la instantánea diaria anterior.`}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="trends" className="section daily-trends-section">
          <div className="wrap">
            <div className="section-heading split">
              <div>
                <p className="kicker">{lang === "en" ? "Daily snapshot record" : "Registro diario de instantáneas"}</p>
                <h2>{lang === "en" ? `${currentHistoryYear} history, across the full page.` : `Historial de ${currentHistoryYear}, a todo lo ancho.`}</h2>
              </div>
              <p>
                {lang === "en"
                  ? `The local daily record begins ${fmtDailyDate(historyDays[0]?.date ?? data.historyStarts, lang)} and keeps every ${currentHistoryYear} snapshot. USGS comparisons below cover the year to date and use official historical daily means.`
                  : `El registro diario local comienza el ${fmtDailyDate(historyDays[0]?.date ?? data.historyStarts, lang)} y conserva cada instantánea de ${currentHistoryYear}. Las comparaciones del USGS cubren el año hasta la fecha y usan promedios diarios históricos oficiales.`}
              </p>
            </div>

            <div className="daily-chart-grid">
              <DailyBarChart
                title={lang === "en" ? "Estimated total supply" : "Suministro total estimado"}
                description={lang === "en" ? "Days of supply. Bars begin at zero." : "Días de suministro. Las barras comienzan en cero."}
                days={historyDays}
                lang={lang}
                series={[{
                  label: lang === "en" ? "Total supply" : "Suministro total",
                  color: "#0d5c8f",
                  values: historyDays.map((day) => day.values.supply.total),
                  format: (value) => `${value}d`,
                }]}
                references={trackedSupplyAverage === null ? [] : [{
                  label: trackedAverageLabel,
                  value: trackedSupplyAverage,
                  color: "#a94f0b",
                  format: (value) => `${value.toFixed(1)}d`,
                }]}
              />
              <DailyBarChart
                title={lang === "en" ? "Distance below full pool" : "Distancia bajo la cota máxima"}
                description={lang === "en" ? "Fewer feet below full means a higher reservoir level." : "Menos pies por debajo de capacidad significa un nivel más alto."}
                days={historyDays}
                lang={lang}
                series={[
                  {
                    label: "Lake Michie",
                    color: "#148f88",
                    values: historyDays.map((day) => typeof day.values.reservoirs.michie === "number" ? 341 - day.values.reservoirs.michie : null),
                    format: (value) => `${value.toFixed(1)}ft`,
                  },
                  {
                    label: "Little River",
                    color: "#d77a23",
                    values: historyDays.map((day) => typeof day.values.reservoirs.little === "number" ? 355 - day.values.reservoirs.little : null),
                    format: (value) => `${value.toFixed(1)}ft`,
                  },
                ]}
                references={[
                  ...(trackedMichieDistanceAverage === null ? [] : [{
                    label: `Lake Michie · ${trackedAverageLabel}`,
                    value: trackedMichieDistanceAverage,
                    color: "#7a3e9d",
                    format: (value: number) => `${value.toFixed(1)}ft`,
                  }]),
                  ...(trackedLittleDistanceAverage === null ? [] : [{
                    label: `Little River · ${trackedAverageLabel}`,
                    value: trackedLittleDistanceAverage,
                    color: "#a94f0b",
                    format: (value: number) => `${value.toFixed(1)}ft`,
                  }]),
                ]}
              />
              <DailyBarChart
                title={lang === "en" ? "Feeder-river streamflow" : "Caudal de los ríos alimentadores"}
                description={lang === "en" ? "USGS provisional cubic feet per second; short-term changes can be large." : "Pies cúbicos por segundo provisionales del USGS; los cambios diarios pueden ser grandes."}
                days={historyDays}
                lang={lang}
                series={[
                  {
                    label: "Flat River",
                    color: "#5d6ec7",
                    values: historyDays.map((day) => day.values.streamflow.flat),
                    format: (value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                  },
                  {
                    label: "Little River",
                    color: "#8a5a44",
                    values: historyDays.map((day) => day.values.streamflow.little),
                    format: (value) => value.toLocaleString(undefined, { maximumFractionDigits: 1 }),
                  },
                ]}
              />
            </div>
            <aside className="comparison-limit-note">
              <strong>{lang === "en" ? "What the dashed averages mean" : "Qué significan los promedios discontinuos"}</strong>
              <p>
                {lang === "en"
                  ? `Durham does not publish raw historical-average series for total supply or distance below full pool. The dashed lines are averages of this dashboard’s verified ${currentHistoryYear} daily record beginning ${fmtDailyDate(historyDays[0]?.date ?? data.historyStarts, lang)}—not long-term averages. The City’s annual reservoir charts below provide the longer comparison as individual prior years.`
                  : `Durham no publica series de promedios históricos para el suministro total ni la distancia bajo la cota máxima. Las líneas discontinuas promedian el registro diario verificado de ${currentHistoryYear} desde el ${fmtDailyDate(historyDays[0]?.date ?? data.historyStarts, lang)}; no son promedios a largo plazo. Las gráficas anuales de la Ciudad muestran la comparación más larga como años anteriores individuales.`}
              </p>
              <a href={urls.lakes} target="_blank" rel="noreferrer">{lang === "en" ? "Official City lake history" : "Historial oficial de los embalses"} ↗</a>
            </aside>

            <div className="year-comparison-heading">
              <p className="kicker">{lang === "en" ? "Year to date vs historical average" : "Año hasta la fecha frente al promedio histórico"}</p>
              <h2>{lang === "en" ? "Is feeder-river flow typical for this time of year?" : "¿Es normal el caudal para esta época del año?"}</h2>
              <p>
                {lang === "en"
                  ? "These comparisons use USGS daily-mean records—not the single latest provisional readings shown above. Weekly grouping makes the full-year pattern easier to follow."
                  : "Estas comparaciones usan registros de caudal medio diario del USGS, no la lectura provisional más reciente mostrada arriba. La agrupación semanal facilita seguir el patrón anual."}
              </p>
            </div>
            <div className="year-comparison-grid">
              <YearComparisonChart station={streamflowHistorySeed.stations.flat} year={streamflowHistorySeed.year} lang={lang} />
              <YearComparisonChart station={streamflowHistorySeed.stations.little} year={streamflowHistorySeed.year} lang={lang} />
            </div>

            <div className="daily-values-table">
              <div>
                <p className="kicker">{lang === "en" ? "Exact daily values" : "Valores diarios exactos"}</p>
                <h3>{lang === "en" ? "Today and previous days" : "Hoy y días anteriores"}</h3>
                <p>
                  {lang === "en"
                    ? "The newest snapshot is first. Reservoir values are elevations in feet mean sea level; streamflow is provisional."
                    : "La instantánea más reciente aparece primero. Los embalses se muestran en pies sobre el nivel medio del mar; el caudal es provisional."}
                </p>
              </div>
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">{lang === "en" ? "Daily verified water values" : "Valores diarios verificados del agua"}</caption>
                  <thead>
                    <tr>
                      <th>{lang === "en" ? "Date" : "Fecha"}</th>
                      <th>{lang === "en" ? "Stage" : "Etapa"}</th>
                      <th>{lang === "en" ? "Supply" : "Suministro"}</th>
                      <th>Lake Michie</th>
                      <th>Little River</th>
                      <th>{lang === "en" ? "Drought" : "Sequía"}</th>
                      <th>{lang === "en" ? "Flat flow" : "Caudal Flat"}</th>
                      <th>{lang === "en" ? "Little flow" : "Caudal Little"}</th>
                      <th>{lang === "en" ? "Data quality" : "Calidad"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historyDays].reverse().map((day, index) => (
                      <tr className={index === 0 ? "latest-daily-row" : undefined} key={day.date}>
                        <th scope="row">{fmtDailyDate(day.date, lang)}{index === 0 ? ` · ${lang === "en" ? "latest" : "más reciente"}` : ""}</th>
                        <td>{day.values.stage ?? "—"}</td>
                        <td>{day.values.supply.total ?? "—"} {lang === "en" ? "days" : "días"}</td>
                        <td>{typeof day.values.reservoirs.michie === "number" ? day.values.reservoirs.michie.toFixed(2) : "—"} ft</td>
                        <td>{typeof day.values.reservoirs.little === "number" ? day.values.reservoirs.little.toFixed(2) : "—"} ft</td>
                        <td>{day.values.drought ?? "—"}</td>
                        <td>{day.values.streamflow.flat ?? "—"} ft³/s</td>
                        <td>{day.values.streamflow.little ?? "—"} ft³/s</td>
                        <td className={(day.retainedFields?.length ?? 0) > 0 || (day.quarantinedFields?.length ?? 0) > 0 ? "daily-quality-warning" : "daily-quality-good"}>
                          {dailyQuality(day, lang)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="drought" className="section signal-section">
          <div className="wrap">
            <div className="section-heading"><p className="kicker">{t.twoSignals}</p><h2>{lang === "en" ? "Drought is not the same as a water-shortage stage." : "La sequía no es lo mismo que una etapa de escasez."}</h2></div>
            <div className="signal-grid">
              <article className="signal-card drought-card">
                <p className="eyebrow">{t.droughtTitle}</p>
                <h3>{String(data.drought.value)}</h3>
                <p>{t.droughtDesc}</p>
                <SourceLine metric={data.drought} lang={lang} />
              </article>
              <article className="signal-card shortage-card">
                <p className="eyebrow">{t.shortageTitle}</p>
                <h3>Stage / Etapa {String(data.stage.value)}</h3>
                <p>{t.shortageDesc}</p>
                <SourceLine metric={data.stage} lang={lang} />
              </article>
              <aside className="why-card"><span aria-hidden="true">≠</span><div><h3>{t.whyDiffer}</h3><p>{t.whyText}</p></div></aside>
            </div>
            <article className="exit-outlook" aria-labelledby="exit-outlook-title">
              <div className="exit-outlook-intro">
                <p className="kicker">{lang === "en" ? "Stage 2 exit outlook" : "Perspectiva para salir de la Etapa 2"}</p>
                <h2 id="exit-outlook-title">
                  {lang === "en"
                    ? "How close is Durham to leaving Stage 2?"
                    : "¿Qué tan cerca está Durham de salir de la Etapa 2?"}
                </h2>
                <p className="outlook-answer">
                  <span aria-hidden="true">?</span>
                  <strong>
                    {lang === "en"
                      ? "Not calculable from the public readings currently posted."
                      : "No se puede calcular con las lecturas públicas disponibles actualmente."}
                  </strong>
                </p>
                <p>
                  {lang === "en"
                    ? "The City does not publish the modeled probability or the 10-week combined usable-storage forecast needed to measure distance from the official rescission test. A numeric progress bar here would imply precision the source data do not support."
                    : "La Ciudad no publica la probabilidad modelada ni el pronóstico de almacenamiento utilizable combinado a 10 semanas necesarios para medir la distancia a la prueba oficial de rescisión. Una barra numérica implicaría una precisión que las fuentes no respaldan."}
                </p>
              </div>
              <div className="exit-rule">
                <p className="eyebrow">{lang === "en" ? "The plan’s rescission test" : "Prueba de rescisión del plan"}</p>
                <div className="threshold-chain" aria-label={lang === "en" ? "At least 95 percent probability of reaching 95 percent combined usable storage by the end of a 10-week forecast" : "Al menos 95 por ciento de probabilidad de alcanzar 95 por ciento de almacenamiento utilizable combinado al final de un pronóstico de 10 semanas"}>
                  <div><strong>≥95%</strong><span>{lang === "en" ? "modeled probability" : "probabilidad modelada"}</span></div>
                  <b aria-hidden="true">→</b>
                  <div><strong>95%</strong><span>{lang === "en" ? "combined usable storage" : "almacenamiento utilizable combinado"}</span></div>
                  <b aria-hidden="true">→</b>
                  <div><strong>10</strong><span>{lang === "en" ? "week forecast horizon" : "semanas de pronóstico"}</span></div>
                </div>
                <p className="discretion-note">
                  {lang === "en"
                    ? "Meeting the modeled test does not automatically end Stage 2. The plan allows the City Manager to delay rescission or consider other system conditions."
                    : "Cumplir la prueba modelada no termina automáticamente la Etapa 2. El plan permite que la administración de la Ciudad retrase la rescisión o considere otras condiciones del sistema."}
                </p>
                <a href={urls.plan} target="_blank" rel="noreferrer">
                  {lang === "en" ? "Read the official response plan, Tables 5.1–5.2" : "Leer el plan oficial, Tablas 5.1–5.2"} ↗
                </a>
              </div>
              <div className="forecast-method">
                <h3>{lang === "en" ? "How the City’s forecast is described" : "Cómo se describe el pronóstico de la Ciudad"}</h3>
                <ol>
                  <li>
                    <strong>{lang === "en" ? "Model usable storage." : "Modelar el almacenamiento utilizable."}</strong>
                    <span>{lang === "en" ? "The plan uses combined usable reservoir storage—not individual elevation percentages—as the key forecast input." : "El plan usa el almacenamiento utilizable combinado, no porcentajes de elevación individuales, como dato principal."}</span>
                  </li>
                  <li>
                    <strong>{lang === "en" ? "Project demand and system conditions." : "Proyectar demanda y condiciones del sistema."}</strong>
                    <span>{lang === "en" ? "The City considers demand, lake elevations, intake access, treatment and distribution capacity, neighboring supplies, weather, and other operational factors." : "La Ciudad considera demanda, elevaciones, acceso a tomas, capacidad de tratamiento y distribución, suministros vecinos, clima y otros factores."}</span>
                  </li>
                  <li>
                    <strong>{lang === "en" ? "Test the 10-week probability." : "Evaluar la probabilidad a 10 semanas."}</strong>
                    <span>{lang === "en" ? "The model estimates the chance of reaching the combined-storage target by the end of the forecast horizon." : "El modelo estima la posibilidad de alcanzar la meta de almacenamiento combinado al final del período."}</span>
                  </li>
                  <li>
                    <strong>{lang === "en" ? "Apply management judgment." : "Aplicar criterio administrativo."}</strong>
                    <span>{lang === "en" ? "The City may change stages non-sequentially, act earlier, or rescind more slowly as conditions warrant." : "La Ciudad puede cambiar etapas fuera de secuencia, actuar antes o rescindir más lentamente según las condiciones."}</span>
                  </li>
                </ol>
              </div>
              <aside className="forecast-limits">
                <h3>{lang === "en" ? "What does not measure closeness" : "Lo que no mide la cercanía"}</h3>
                <ul>
                  <li>{lang === "en" ? "195 estimated days of supply is not an exit threshold." : "195 días estimados no es un umbral de salida."}</li>
                  <li>{lang === "en" ? "The NC drought category does not mechanically set the City stage." : "La categoría de sequía de NC no determina mecánicamente la etapa."}</li>
                  <li>{lang === "en" ? "Feet below full cannot be converted to percent storage without official storage curves." : "Los pies por debajo de capacidad no se convierten a porcentaje sin curvas oficiales."}</li>
                  <li>{lang === "en" ? "Streamflow cannot predict reservoir refill or a stage change." : "El caudal no puede predecir la recarga ni un cambio de etapa."}</li>
                </ul>
                <p>
                  {lang === "en"
                    ? "If Durham publishes the modeled probability and combined-storage forecast, this dashboard can show that official outlook directly and compare it with the plan—without inventing a forecast."
                    : "Si Durham publica la probabilidad modelada y el pronóstico combinado, este panel podrá mostrar esa perspectiva oficial y compararla con el plan, sin inventar un pronóstico."}
                </p>
              </aside>
              <StageExitExplorer lang={lang} />
            </article>
          </div>
        </section>

        <section id="reservoirs" className="section reservoirs-section">
          <div className="wrap">
            <div className="section-heading split"><div><p className="kicker">{t.reservoirs}</p><h2>{lang === "en" ? "Where today’s water line sits." : "Dónde se encuentra hoy el nivel del agua."}</h2></div><p>{t.reservoirIntro}</p></div>
            <div className="reservoir-grid">
              <ReservoirCard name="Lake Michie" metric={data.reservoirs.michie} lang={lang} />
              <ReservoirCard name="Little River Reservoir" metric={data.reservoirs.little} lang={lang} />
            </div>

            <div className="charts-block">
              <div className="section-heading compact"><p className="kicker">{t.officialCharts}</p><h2>{lang === "en" ? "See 2026 against each of the prior ten years." : "Compare 2026 con cada uno de los diez años anteriores."}</h2><p>{lang === "en" ? "The City publishes individual prior-year reservoir traces rather than an average series. These full-width official charts preserve that distinction without estimating values from the image." : "La Ciudad publica trazos de años anteriores, no una serie promedio. Estas gráficas oficiales a todo lo ancho conservan esa distinción sin estimar valores a partir de la imagen."}</p></div>
              <div className="chart-grid">
                {[
                  [t.recentChart, `https://www.durhamnc.gov/ImageRepository/Document?documentID=4123&refresh=${chartVersion}`, "https://www.durhamnc.gov/DocumentCenter/View/4123", lang === "en" ? "City chart of recent daily reservoir elevations, with date on the horizontal axis and elevation in feet mean sea level on the vertical axis." : "Gráfica de la Ciudad con elevaciones diarias recientes; fecha en el eje horizontal y elevación en pies sobre el nivel medio del mar en el eje vertical."],
                  [t.michieAnnual, `https://www.durhamnc.gov/ImageRepository/Document?documentID=4124&refresh=${chartVersion}`, "https://www.durhamnc.gov/DocumentCenter/View/4124", lang === "en" ? "City historical and annual elevation chart for Lake Michie, including the full-pool reference." : "Gráfica histórica y anual de la Ciudad para Lake Michie, incluida la referencia de capacidad."],
                  [t.littleAnnual, `https://www.durhamnc.gov/ImageRepository/Document?documentID=4125&refresh=${chartVersion}`, "https://www.durhamnc.gov/DocumentCenter/View/4125", lang === "en" ? "City historical and annual elevation chart for Little River Reservoir, including the full-pool reference." : "Gráfica histórica y anual de la Ciudad para Little River Reservoir, incluida la referencia de capacidad."],
                ].map(([label, src, href, alt]) => (
                  <figure className="chart-card" key={label}>
                    <figcaption><strong>{label}</strong><span>{lang === "en" ? "City-published image" : "Imagen publicada por la Ciudad"}</span></figcaption>
                    <img src={src} alt={alt} width="720" height="430" loading="lazy" />
                    <a href={href} target="_blank" rel="noreferrer">{t.openChart} ↗</a>
                  </figure>
                ))}
              </div>
            </div>

          </div>
        </section>

        <section id="actions" className="section actions-section">
          <div className="wrap">
            <div className="section-heading actions-heading"><p className="kicker">{t.whatNow}</p><h2>{lang === "en" ? "Stage 2 rules, at a glance." : "Reglas de la Etapa 2, de un vistazo."}</h2><p>{t.rulesCaveat}</p></div>
            {data.stage.status === "stale" && <p className="stale-banner">! {t.confirmRules}</p>}
            <div className="rules-grid">
              <article className="rule-column stop">
                <h3><span aria-hidden="true">×</span>{t.prohibited}</h3>
                <ul>
                  <li>{lang === "en" ? "No landscape spray irrigation with City water, including hose-end sprinklers." : "No riegue jardines por aspersión con agua de la Ciudad, incluidos aspersores conectados a mangueras."}</li>
                  <li>{lang === "en" ? "No vehicle washing, except at a commercial or institutional car wash." : "No lave vehículos, excepto en un lavadero comercial o institucional."}</li>
                  <li>{lang === "en" ? "No washing sidewalks, driveways, decks, exterior walls, or paved areas." : "No lave aceras, entradas, terrazas, muros exteriores ni áreas pavimentadas."}</li>
                  <li>{lang === "en" ? "Do not add water to decorative fountains, ponds, or pools unless recycled." : "No añada agua a fuentes, estanques o piscinas decorativas, salvo que sea reciclada."}</li>
                </ul>
              </article>
              <article className="rule-column go">
                <h3><span aria-hidden="true">✓</span>{t.allowed}</h3>
                <ul>
                  <li>{lang === "en" ? "Hand watering, drip irrigation, and tree or shrub watering bags." : "Riego manual, por goteo y bolsas para árboles o arbustos."}</li>
                  <li>{lang === "en" ? "Watering container plants and commercial plant stock for sale." : "Riego de plantas en contenedores y existencias comerciales para venta."}</li>
                  <li>{lang === "en" ? "Surface washing for a health or safety issue, or before painting." : "Lavado de superficies por salud o seguridad, o antes de pintar."}</li>
                  <li>{lang === "en" ? "Pool water only for evaporation or spillage loss and chemical feed operation." : "Agua de piscina solo para pérdidas por evaporación o derrame y operación química."}</li>
                </ul>
              </article>
              <article className="rule-column note">
                <h3><span aria-hidden="true">i</span>{t.special}</h3>
                <ul>
                  <li>{lang === "en" ? "Restaurants serve drinking water only when requested." : "Los restaurantes sirven agua potable solo cuando se solicita."}</li>
                  <li>{lang === "en" ? "Users above 100,000 gallons/day should target a 30% reduction and document efforts." : "Usuarios de más de 100,000 galones/día deben aspirar a reducir 30% y documentar sus esfuerzos."}</li>
                  <li>{lang === "en" ? "Approved Water Conservation Plans and limited exemptions may apply." : "Pueden aplicar Planes de Conservación aprobados y exenciones limitadas."}</li>
                  <li>{lang === "en" ? "Violations may lead to civil penalties or service termination." : "Las infracciones pueden resultar en sanciones civiles o terminación del servicio."}</li>
                </ul>
              </article>
            </div>
            <div className="rules-footer"><p>{lang === "en" ? "This summary does not replace the official rules." : "Este resumen no reemplaza las reglas oficiales."}</p><a className="button" href={urls.stage} target="_blank" rel="noreferrer">{t.readRules} ↗</a></div>
          </div>
        </section>

        <section className="section context-section">
          <div className="wrap context-grid">
            <div className="flow-panel">
              <div className="section-heading compact"><p className="kicker">{t.flow}</p><h2>{lang === "en" ? "What is moving through the watershed?" : "¿Qué está circulando por la cuenca?"}</h2><p>{t.flowExplain}</p></div>
              <div className="flow-cards">
                {[
                  { name: "Flat River", station: "USGS 02085500", metric: data.streamflow.flat },
                  { name: "Little River", station: "USGS 0208521324", metric: data.streamflow.little },
                ].map(({ name, station, metric }) => (
                  <article className="flow-card" key={name}>
                    <div className="card-top"><div><p className="eyebrow">{name}</p><small>{station}</small></div><Status metric={metric as Metric} lang={lang} /></div>
                    <div className="flow-number">{String((metric as Metric).value ?? "—")} <small>ft³/s</small></div>
                    <p className="provisional">P · {t.provisional}</p>
                    <SourceLine metric={metric as Metric} lang={lang} />
                  </article>
                ))}
              </div>
            </div>
            <aside className="map-panel">
              <div className="section-heading compact"><p className="kicker">{t.contextMap}</p><h2>{lang === "en" ? "Two rivers. Two reservoirs. One city." : "Dos ríos. Dos embalses. Una ciudad."}</h2></div>
              <div className="schematic" role="img" aria-label={lang === "en" ? "Schematic showing Flat River feeding Lake Michie and Little River feeding Little River Reservoir, both northwest of Durham." : "Esquema que muestra Flat River alimentando Lake Michie y Little River alimentando Little River Reservoir, ambos al noroeste de Durham."}>
                <div className="river river-one">Flat River <span>↓</span></div>
                <div className="lake lake-one">Lake Michie</div>
                <div className="river river-two">Little River <span>↓</span></div>
                <div className="lake lake-two">Little River Reservoir</div>
                <div className="city-dot"><span aria-hidden="true">●</span> Durham</div>
              </div>
              <p className="map-note">{t.mapNote} <a href={urls.watershed} target="_blank" rel="noreferrer">{t.source} ↗</a></p>
            </aside>
          </div>
        </section>

        <section className="section alert-section">
          <div className="wrap">
            <div className="section-heading compact"><p className="kicker">{t.alerts}</p><h2>{lang === "en" ? "Go straight to the City’s channels." : "Consulte directamente los canales de la Ciudad."}</h2></div>
            <div className="alert-grid">
              <a className="alert-card" href={urls.alerts} target="_blank" rel="noreferrer"><span className="alert-icon" aria-hidden="true">◉</span><div><h3>{t.alertCenter}</h3><p>{t.alertText}</p><strong>{lang === "en" ? "Open Alert Center" : "Abrir Centro de Alertas"} ↗</strong></div></a>
              <a className="alert-card" href={urls.daupler} target="_blank" rel="noreferrer"><span className="alert-icon" aria-hidden="true">≈</span><div><h3>{t.daupler}</h3><p>{t.dauplerText}</p><strong>{lang === "en" ? "Open Daupler Notify" : "Abrir Daupler Notify"} ↗</strong></div></a>
            </div>
          </div>
        </section>

        <section className="section timeline-section">
          <div className="wrap timeline-grid">
            <div className="section-heading compact"><p className="kicker">{t.timeline}</p><h2>{lang === "en" ? "A sourced record, one official event at a time." : "Un registro documentado, evento oficial por evento."}</h2><p>{t.noLater}</p></div>
            <ol className="timeline">
              <li><time dateTime="2026-06-15">{fmtDate("2026-06-15", lang)}</time><span aria-hidden="true" /><div><h3>{t.currentStageEvent}</h3><p>{lang === "en" ? "Mandatory Stage 2 water-use restrictions began for City water customers." : "Comenzaron las restricciones obligatorias de la Etapa 2 para clientes de agua de la Ciudad."}</p><a href={urls.stage} target="_blank" rel="noreferrer">{t.source} ↗</a></div></li>
            </ol>
          </div>
        </section>

        <section id="methodology" className="section method-section">
          <div className="wrap">
            <div className="section-heading"><p className="kicker">{t.method}</p><h2>{lang === "en" ? "Trust is a product feature." : "La confianza es una función del producto."}</h2><p>{t.methodology}</p></div>
            <div className="method-grid">
              {[
                [lang === "en" ? "Meaning, not mystery" : "Significado claro", lang === "en" ? "Days of supply combines accessible reservoir water, less-accessible water below the intakes, and Teer Quarry emergency storage. Elevation is never presented as percent storage." : "Los días combinan agua accesible, agua debajo de las tomas y reserva de Teer Quarry. La elevación nunca se presenta como porcentaje."],
                [lang === "en" ? "Refresh rhythm" : "Ritmo de actualización", lang === "en" ? "A scheduled publication workflow checks Durham daily, USGS about every 30 minutes, and NC drought after its weekly update, then rebuilds the static site." : "Un flujo programado comprueba Durham a diario, USGS aproximadamente cada 30 minutos y la sequía de NC tras su actualización semanal, y luego reconstruye el sitio estático."],
                [lang === "en" ? "Stale thresholds" : "Umbrales de desactualización", lang === "en" ? "Durham daily metrics: two calendar days. USGS: about three hours. NC drought: after the expected weekly update window." : "Métricas diarias de Durham: dos días calendario. USGS: unas tres horas. Sequía de NC: tras la ventana semanal esperada."],
                [lang === "en" ? "Validation before publication" : "Validación antes de publicar", lang === "en" ? "Expected URL and units, a recognizable date, nonnegative components, internally consistent totals, intended reservoir fields, newer observations, and plausible changes." : "URL y unidades esperadas, fecha reconocible, componentes no negativos, total coherente, campos correctos, observaciones más nuevas y cambios plausibles."],
                [lang === "en" ? "Failure is visible" : "Las fallas son visibles", lang === "en" ? "Malformed, older, null, or implausible readings never replace the repository’s last-known-good snapshot. The next static build keeps the verified value with a stale label; without one, it says reading unavailable." : "Lecturas malformadas, antiguas, nulas o improbables nunca reemplazan la última instantánea verificada del repositorio. La compilación estática conserva el valor con aviso; sin uno, indica no disponible."],
                [lang === "en" ? "Limits" : "Limitaciones", lang === "en" ? "City chart images are not digitized. Streamflow is not used to estimate storage or refill. Trend claims require at least two locally verified readings." : "Las gráficas de la Ciudad no se digitalizan. El caudal no estima almacenamiento ni recarga. Las tendencias requieren al menos dos lecturas verificadas."],
              ].map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}
            </div>
            <div className="source-directory">
              <h3>{lang === "en" ? "Authoritative source directory" : "Directorio de fuentes autorizadas"}</h3>
              <div>{[
                ["Current stage & rules", urls.stage], ["Days of supply & demand", urls.data], ["Reservoir elevations & charts", urls.lakes],
                ["Water Shortage Response Plan", urls.plan], ["NC drought classification", urls.drought], ["Flat River station", urls.flat],
                ["Little River station", urls.little], ["Official alerts", urls.alerts], ["Watershed context", urls.watershed],
              ].map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer">{label} <span>↗</span></a>)}</div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap footer-grid">
          <div><p className="unofficial">{t.unofficial}</p><h2>{t.title}</h2><p>{t.noAffiliation}</p></div>
          <div><h3>{t.corrections}</h3><p>{t.correctionText}</p><a href={urls.stage} target="_blank" rel="noreferrer">{t.official} ↗</a></div>
        </div>
        <div className="wrap footer-bottom"><span>Durham, North Carolina</span><span>{lang === "en" ? "Built for public understanding." : "Creado para la comprensión pública."}</span></div>
      </footer>
    </>
  );
}
