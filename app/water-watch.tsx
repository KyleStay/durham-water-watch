"use client";

import { useEffect, useMemo, useState } from "react";
import verifiedSnapshot from "../public/data/dashboard.json";

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

const copy = {
  en: {
    skip: "Skip to main content",
    unofficial: "Unofficial independent community dashboard",
    title: "Durham Water Watch",
    deck: "A clear view of Durham’s drinking-water supply, reservoir levels, and drought context.",
    official: "Official City guidance always takes precedence.",
    nav: ["Overview", "Reservoirs & trends", "What to do", "Drought explained", "Sources & methodology"],
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
    deck: "Una vista clara del suministro de agua potable, los embalses y la sequía en Durham.",
    official: "La orientación oficial de la Ciudad siempre tiene prioridad.",
    nav: ["Resumen", "Embalses y tendencias", "Qué hacer", "La sequía explicada", "Fuentes y metodología"],
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

export default function WaterWatch() {
  const [lang, setLang] = useState<Lang>("en");
  const [announcement, setAnnouncement] = useState("");
  const data = seed;
  const t = copy[lang];

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
          {["overview", "reservoirs", "actions", "drought", "methodology"].map((id, index) => (
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
              <div className="trend-row"><strong>{t.trend}</strong><span>→</span><p>{t.trendMissing}</p></div>
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
              <div className="section-heading compact"><p className="kicker">{t.officialCharts}</p><h2>{lang === "en" ? "See the City’s own plotted record." : "Consulte el registro gráfico de la Ciudad."}</h2><p>{t.chartIntro}</p></div>
              <div className="chart-grid">
                {[
                  [t.recentChart, "https://www.durhamnc.gov/ImageRepository/Document?documentID=4123", "https://www.durhamnc.gov/DocumentCenter/View/4123", lang === "en" ? "City chart of recent daily reservoir elevations, with date on the horizontal axis and elevation in feet mean sea level on the vertical axis." : "Gráfica de la Ciudad con elevaciones diarias recientes; fecha en el eje horizontal y elevación en pies sobre el nivel medio del mar en el eje vertical."],
                  [t.michieAnnual, "https://www.durhamnc.gov/ImageRepository/Document?documentID=4124", "https://www.durhamnc.gov/DocumentCenter/View/4124", lang === "en" ? "City historical and annual elevation chart for Lake Michie, including the full-pool reference." : "Gráfica histórica y anual de la Ciudad para Lake Michie, incluida la referencia de capacidad."],
                  [t.littleAnnual, "https://www.durhamnc.gov/ImageRepository/Document?documentID=4125", "https://www.durhamnc.gov/DocumentCenter/View/4125", lang === "en" ? "City historical and annual elevation chart for Little River Reservoir, including the full-pool reference." : "Gráfica histórica y anual de la Ciudad para Little River Reservoir, incluida la referencia de capacidad."],
                ].map(([label, src, href, alt]) => (
                  <figure className="chart-card" key={label}>
                    <figcaption><strong>{label}</strong><span>{lang === "en" ? "City-published image" : "Imagen publicada por la Ciudad"}</span></figcaption>
                    <img src={src} alt={alt} width="720" height="430" loading="lazy" />
                    <a href={href} target="_blank" rel="noreferrer">{t.openChart} ↗</a>
                  </figure>
                ))}
              </div>
            </div>

            <div className="history-table">
              <div><p className="kicker">{t.accumulated}</p><h3>{t.historyBegins}: {fmtDate(data.historyStarts, lang)}</h3><p>{t.oneReading}</p></div>
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">{t.accumulated}</caption>
                  <thead><tr><th>{t.reservoirName}</th><th>{t.observed}</th><th>{t.elevation}</th><th>{t.status}</th></tr></thead>
                  <tbody>
                    <tr><th>Lake Michie</th><td>{fmtDate(data.reservoirs.michie.observedAt, lang)}</td><td>{data.reservoirs.michie.value} ft msl</td><td><Status metric={data.reservoirs.michie} lang={lang} /></td></tr>
                    <tr><th>Little River Reservoir</th><td>{fmtDate(data.reservoirs.little.observedAt, lang)}</td><td>{data.reservoirs.little.value} ft msl</td><td><Status metric={data.reservoirs.little} lang={lang} /></td></tr>
                  </tbody>
                </table>
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
