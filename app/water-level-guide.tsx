import { Chart } from "./trend-charts";
import { trendWindow, weeklyFlow } from "../scripts/trend-series.mjs";

type Lang = "en" | "es";

const planUrl = "https://www.durhamnc.gov/DocumentCenter/View/4291";
const classificationUrl = "https://droughtmonitor.unl.edu/About/AbouttheData/DroughtClassification.aspx";

// Durham WSRP, tables 5.1–5.2 (pages 9–10); forecast thresholds, not live readings.
const stages = [
  { stage: 1, probability: 30, weeks: 12, storage: 45,
    en: ["Spray irrigation: one assigned day a week, outside 10 a.m.–6 p.m. Hand and drip watering remain allowed.", "Restaurants serve water on request. Decorative water must recycle; swimming pools may only replace losses and maintain chemical equipment. No new landscape exemptions."],
    es: ["Aspersión: un día asignado por semana, fuera de 10 a. m.–6 p. m. Se permite riego manual y por goteo.", "Restaurantes: agua a pedido. Agua decorativa: recirculación obligatoria; piscinas: solo reponer pérdidas y mantener equipos químicos. Sin nuevas exenciones para jardines."],
  },
  { stage: 2, probability: 20, weeks: 10, storage: 35,
    en: ["Landscape spray irrigation stops. Hand watering, drip irrigation and watering bags remain allowed.", "Vehicle washing only at compliant commercial or institutional facilities. Surface washing only before painting or for health or safety."],
    es: ["Se suspende la aspersión de jardines. Se permiten riego manual, por goteo y bolsas de riego.", "Lavado de vehículos solo en instalaciones comerciales o institucionales que cumplan las reglas. Superficies: solo antes de pintar o por salud o seguridad."],
  },
  { stage: 3, probability: 10, weeks: 8, storage: 25,
    en: ["Hand and drip landscape watering also stop. Irrigation is limited to container plants and commercial plants for sale; other outdoor use is limited to public health and safety.", "Compliant commercial or institutional car washes may operate. Reduce nonessential heating and cooling water use as practical."],
    es: ["También se suspende el riego manual y por goteo de jardines. Solo se riegan plantas en contenedores y plantas comerciales para venta; otros usos exteriores se limitan a salud y seguridad públicas.", "Pueden operar lavaderos comerciales o institucionales que cumplan las reglas. Reducir, cuando sea práctico, el agua para calefacción y refrigeración no esenciales."],
  },
  { stage: 4, probability: 5, weeks: 4, storage: 15,
    en: ["Water emergency: outdoor use only for public health and safety. Vehicle washing stops; no water added to decorative features or pools, except prescribed medical or rehabilitation pool use.", "Other uses are limited to minimum health and safety needs. The City may reduce or discontinue service to preserve essential supplies."],
    es: ["Emergencia: usos exteriores solo por salud y seguridad públicas. Se prohíbe lavar vehículos y añadir agua a elementos decorativos o piscinas, salvo usos médicos o de rehabilitación autorizados.", "Los demás usos se limitan a necesidades mínimas de salud y seguridad. La Ciudad puede reducir o suspender el servicio para preservar suministros esenciales."],
  },
];

const recovery = { probability: 95, weeks: 10, storage: 95 };

export type StorageReading = { observedAt: string; value: number; sourceUrl: string; bulletinDate?: boolean };

type FactorDay = {
  date: string;
  values: { supply: { accessible: number | null }; streamflow: { flat: number | null; little: number | null } };
  measurementKinds?: Record<string, string>;
  retainedFields?: string[];
  quarantinedFields?: string[];
};

export function StageTransitionChart({ lang, stage, effectiveDate, storage, date, stale, readings, days }: {
  lang: Lang;
  stage: number | null;
  effectiveDate: string | null;
  storage: number | null;
  date: string | null;
  stale: boolean;
  readings: StorageReading[];
  days: FactorDay[];
}) {
  const en = lang === "en";
  const locale = en ? "en-US" : "es-US";
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const formatDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const next = stages.find((rule) => stage !== null && rule.stage === stage + 1);
  const firstReading = readings[0]?.observedAt;
  const latest = [readings.at(-1)?.observedAt, days.at(-1)?.date].filter((day): day is string => Boolean(day)).sort().at(-1);
  const stageStart = stage !== null && effectiveDate && latest && effectiveDate <= latest ? effectiveDate : null;
  const first = [firstReading ?? days[0]?.date, stageStart].filter((day): day is string => Boolean(day)).sort()[0];
  const stageName = `${en ? "Stage" : "Etapa"} ${stage}`;
  const window = first && latest
    ? first === latest ? trendWindow(latest, "30") : { start: first, end: latest }
    : null;
  const visibleDays = window ? days.filter((day) => day.date >= window.start && day.date <= window.end) : [];
  const recorded = (day: FactorDay, field: string) => !day.retainedFields?.includes(field) && !day.quarantinedFields?.includes(field);
  const accessibleLabel = en ? "Accessible supply" : "Suministro accesible";
  const daysUnit = en ? "days" : "días";
  const flows = (["flat", "little"] as const).map((key) => ({
    label: key === "flat" ? "Flat River" : "Little River",
    color: key === "flat" ? "var(--chart-blue, #07516e)" : "var(--chart-purple, #795384)",
    marker: key === "little" ? "ring" as const : undefined,
    points: window ? weeklyFlow(visibleDays.map((day) => ({
      date: day.date, historicalMean: null,
      currentYear: day.measurementKinds?.streamflow === "USGS daily mean" && recorded(day, `streamflow.${key}`) ? day.values.streamflow[key] : null,
    })), window, window.end).filter((week) => week.current !== null).map((week) => ({
      date: week.through ?? week.date, value: week.current, start: week.start, end: week.through ?? undefined,
      detail: `${week.count} ${en ? "observed daily means" : "promedios diarios observados"}`,
    })) : [],
  }));
  const storageLabel = en ? "City-reported storage" : "Almacenamiento informado";
  const bulletinLabel = en ? "Bulletin date" : "Fecha del boletín";
  const gap = (value: number, target: number) => {
    const difference = Math.round((value - target) * 100) / 100;
    if (difference === 0) return en ? "At the storage target" : "En la meta de almacenamiento";
    const amount = format.format(Math.abs(difference));
    return en ? `${amount} percentage points ${difference > 0 ? "above" : "below"} the storage target`
      : `${amount} puntos porcentuales por ${difference > 0 ? "encima" : "debajo"} de la meta`;
  };
  const targets = [...stages, { stage: 0, ...recovery }];
  const label = (rule: { stage: number }) => rule.stage === 0
    ? (en ? "Recovery target" : "Meta de recuperación")
    : `${en ? "Stage" : "Etapa"} ${rule.stage}`;
  return (
    <section id="stage-proximity" className="stage-proximity" aria-labelledby="stage-proximity-title">
      <h2 id="stage-proximity-title">{en ? "Official stage and reservoir storage" : "Etapa oficial y almacenamiento"}</h2>
      <p>{storage === null
        ? en ? "City storage reading unavailable." : "Lectura municipal de almacenamiento no disponible."
        : <><strong>{format.format(storage)}%</strong> {en ? "storage reported by Durham" : "de almacenamiento municipal"} · {date}{stale && (en ? " · Last known" : " · Última lectura conocida")}</>}</p>
      <div className="stage-trigger-note">
        {next && <p><strong>{en ? `Stage ${next.stage} forecast trigger.` : `Criterio para la Etapa ${next.stage}.`}</strong>{" "}{en
          ? <>A <b>{next.probability}% chance</b> of reaching <b>{next.storage}% combined usable reservoir storage</b> in <b>{next.weeks} weeks</b>.</>
          : <><b>{next.probability}% de probabilidad prevista</b> de alcanzar <b>{next.storage}% de almacenamiento utilizable combinado</b> en <b>{next.weeks} semanas</b>.</>}</p>}
        <p className="stage-proximity-note">{en
          ? "The City declares stage changes using forecasts and system conditions."
          : "La Ciudad declara los cambios de etapa según los pronósticos y las condiciones del sistema."}</p>
      </div>
      <figure className="stage-proximity-chart">
        {(stageStart || firstReading) && <figcaption className="stage-chart-caption">
          {stageStart && <strong>{en ? `${stageName} in effect since` : `${stageName} en vigor desde`} <time dateTime={stageStart}>{formatDate.format(new Date(`${stageStart}T12:00:00Z`))}</time></strong>}
          {firstReading && <span>{en ? "Storage readings begin" : "Primer dato de almacenamiento"} <time dateTime={firstReading}>{formatDate.format(new Date(`${firstReading}T12:00:00Z`))}</time>.</span>}
        </figcaption>}
        {window ? <Chart title={en ? "Official stage and observed water conditions" : "Etapa oficial y condiciones observadas"}
          description={en ? "The stage dates come from the City declaration. Storage, accessible supply and weekly USGS river flow share a date axis." : "Las fechas de etapa provienen de la declaración municipal. El almacenamiento, el suministro accesible y el caudal semanal del USGS comparten un eje de fechas."}
          stagePeriod={stageStart ? { start: stageStart, label: stageName } : undefined}
          label={en ? "Reservoir storage (%)" : "Almacenamiento de los embalses (%)"}
          series={[{ label: storageLabel, color: "var(--chart-teal, #286a67)", points: readings.map((reading) => ({
            date: reading.observedAt, value: reading.value,
            detail: [reading.bulletinDate ? bulletinLabel : "", next ? gap(reading.value, next.storage) : ""].filter(Boolean).join(" · "),
          })) }]}
          references={next ? [{
            label: en ? `${next.storage}% storage target in the City forecast rule` : `Meta del ${next.storage}% en el criterio de pronóstico`,
            value: next.storage, color: "var(--chart-alert, #9b4b1d)", highlighted: true,
          }] : []}
          tracks={[
            { label: `${accessibleLabel} (${daysUnit})`, unit: daysUnit, series: [{ label: accessibleLabel, color: "var(--chart-green, #4c7760)",
              points: visibleDays.filter((day) => day.values.supply.accessible !== null && recorded(day, "supply.accessible"))
                .map((day) => ({ date: day.date, value: day.values.supply.accessible })) }] },
            { label: en ? "Weekly river flow (ft³/s)" : "Caudal semanal (pies³/s)", unit: "ft³/s", series: flows, gapDays: 7 },
          ]}
          window={window} lang={lang} unit="%" domain={[0, 100]} />
          : <p>{en ? "No dated readings available." : "No hay lecturas fechadas disponibles."}</p>}
        {storage !== null && <p className="stage-gap-readout">
          {next && <span><strong>{label(next)}</strong> · {gap(storage, next.storage)}</span>}
          <span><strong>{label({ stage: 0 })}</strong> · {gap(storage, recovery.storage)}</span>
        </p>}
        <details>
          <summary>{en ? "Official stage criteria" : "Criterios oficiales de etapa"}</summary>
          <ul>
            {targets.map((rule) => (
              <li key={rule.stage} className={rule.stage === next?.stage ? "stage-proximity-next" : undefined}>
                <div className="stage-proximity-label">
                  <strong>{label(rule)}</strong>
                  <span>{en
                    ? `${rule.stage === 0 ? "At least " : ""}${rule.probability}% chance of ${rule.storage}% usable storage in ${rule.weeks} weeks`
                    : `${rule.stage === 0 ? "Al menos " : ""}${rule.probability}% de probabilidad de alcanzar ${rule.storage}% de almacenamiento utilizable en ${rule.weeks} semanas`}</span>
                </div>
              </li>
            ))}
          </ul>
          <p>{en ? "Reservoir volumes must also be rising for the City to lift restrictions." : "El volumen de los embalses también debe estar aumentando para que la Ciudad levante las restricciones."}</p>
        </details>
      </figure>
      {readings.length > 0 && <details className="storage-reading-sources">
        <summary>{en ? "Storage readings and sources" : "Lecturas y fuentes de almacenamiento"} · {readings.length}</summary>
        <ul>{[...readings].reverse().map((reading) => (
          <li key={reading.observedAt}>
            <a href={reading.sourceUrl} target="_blank" rel="noreferrer">{formatDate.format(new Date(`${reading.observedAt}T12:00:00Z`))} · {format.format(reading.value)}%{reading.bulletinDate && ` · ${bulletinLabel}`}</a>
          </li>
        ))}</ul>
      </details>}
      <p className="level-sources"><a href={planUrl} target="_blank" rel="noreferrer">{en ? "City response plan, Tables 5.1–5.2" : "Plan municipal, tablas 5.1–5.2"} ↗</a></p>
    </section>
  );
}

export function RestrictionLevels({ lang, currentStage }: { lang: Lang; currentStage: number | null }) {
  const en = lang === "en";
  return (
    <div id="restriction-levels" className="level-guide" aria-labelledby="restriction-levels-title">
      <h3 id="restriction-levels-title">{en ? "Restriction stages and triggers" : "Etapas de restricción y sus criterios"}</h3>
      <p>{en
        ? "These rules cover City water. Each stage keeps earlier restrictions unless a stricter rule replaces them. Year-round efficiency rules still apply outside a declared shortage."
        : "Estas reglas se aplican al agua de la Ciudad. Cada etapa mantiene las restricciones anteriores salvo que una más estricta las sustituya. Las reglas de eficiencia de todo el año siguen vigentes sin una declaración de escasez."}</p>
      <p>{en
        ? "The triggers below use the City model’s probability of reaching a combined usable reservoir storage level at the end of a forecast period. They are not today’s storage or days-of-supply cutoffs."
        : "Los criterios siguientes usan la probabilidad, según el modelo municipal, de alcanzar un nivel de almacenamiento utilizable combinado al final de un período de pronóstico. No son niveles actuales ni límites de días de suministro."}</p>
      <div className="level-list">
        {stages.map(({ stage, probability, weeks, storage, ...rules }) => (
          <article className="level-row" key={stage} data-current={stage === currentStage || undefined} aria-labelledby={`restriction-stage-${stage}`}>
            <div>
              <h4 id={`restriction-stage-${stage}`}>{en ? "Stage" : "Etapa"} {stage}{stage === 4 ? (en ? " · Emergency" : " · Emergencia") : ""}{stage === currentStage && (en ? " · In effect" : " · En vigor")}</h4>
              <p className="level-trigger"><strong>{en ? "Model trigger: " : "Criterio del modelo: "}</strong>{en
                ? `${probability}% chance of ${storage}% usable storage in ${weeks} weeks.`
                : `${probability}% de probabilidad de ${storage}% de almacenamiento utilizable en ${weeks} semanas.`}</p>
            </div>
            <ul>{rules[lang].map((rule) => <li key={rule}>{rule}</li>)}</ul>
          </article>
        ))}
      </div>
      <details className="level-help">
        <summary>{en ? "Exceptions and how stages change" : "Excepciones y cambios de etapa"}</summary>
        <p>{en
          ? "The City Manager declares stage changes and can act before a trigger, skip stages, or delay lifting restrictions, considering forecasts, demand, neighboring supplies, water quality and system emergencies. This dashboard does not run the City’s model or predict the next stage."
          : "El administrador municipal declara los cambios y puede actuar antes de un criterio, saltar etapas o retrasar el levantamiento, considerando pronósticos, demanda, suministros vecinos, calidad del agua y emergencias. Este panel no ejecuta el modelo municipal ni predice la próxima etapa."}</p>
        <p>{en
          ? "The plan’s rescission criterion is a 95% probability of reaching 95% combined usable storage in 10 weeks, with reservoir volumes increasing. Restrictions end only through an official City decision."
          : "El criterio del plan para levantar etapas es una probabilidad del 95% de alcanzar 95% de almacenamiento utilizable combinado en 10 semanas, con reservas en aumento. Las restricciones terminan solo por decisión oficial."}</p>
        <p>{en
          ? "Stages 1–2 include limited irrigation exemptions and approved conservation plans. Users above 100,000 gallons/day must attempt and document reductions of 15%, 30% and 50% in Stages 1, 2 and 3, respectively. Construction restrictions require separate City action; consult the complete rules for exemptions and variances."
          : "Las etapas 1–2 incluyen exenciones limitadas de riego y planes de conservación aprobados. Usuarios de más de 100,000 galones diarios deben intentar y documentar reducciones de 15%, 30% y 50% en las etapas 1, 2 y 3. Las restricciones de construcción requieren una acción municipal separada; consulte las reglas completas para exenciones y dispensas."}</p>
      </details>
      <p className="level-sources"><a href={planUrl} target="_blank" rel="noreferrer">{en ? "City response plan: rules pp. 5–8; triggers pp. 9–10 (PDF)" : "Plan municipal: reglas pp. 5–8; criterios pp. 9–10 (PDF)"} ↗</a></p>
    </div>
  );
}

const droughtLevels = [
  { code: "None", range: ">30", en: ["Normal or wet", "No drought classification."], es: ["Normal o húmedo", "Sin clasificación de sequía."] },
  { code: "D0", range: "20–30", en: ["Abnormally dry", "Dryness developing or lingering after drought; not itself drought."], es: ["Anormalmente seco", "Sequedad que aparece o persiste tras una sequía; aún no es sequía."] },
  { code: "D1", range: "10–20", en: ["Moderate drought", "Plant stress and declining streams or reservoirs may develop."], es: ["Sequía moderada", "Puede haber estrés en plantas y descenso de ríos o embalses."] },
  { code: "D2", range: "5–10", en: ["Severe drought", "Crop losses and water shortages can intensify."], es: ["Sequía severa", "Pueden intensificarse las pérdidas agrícolas y la escasez de agua."] },
  { code: "D3", range: "2–5", en: ["Extreme drought", "More serious water shortages and widespread impacts are possible."], es: ["Sequía extrema", "Puede haber escasez más grave e impactos extensos."] },
  { code: "D4", range: "0–2", en: ["Exceptional drought", "Critical shortages can affect communities, agriculture and daily life."], es: ["Sequía excepcional", "La escasez crítica puede afectar comunidades, agricultura y vida cotidiana."] },
];

export type DroughtReading = { date: string; category: string };

export function DroughtTrend({ lang, readings }: { lang: Lang; readings: DroughtReading[] }) {
  const en = lang === "en";
  const title = en ? "Durham County drought over time" : "Sequía en el condado de Durham a lo largo del tiempo";
  const first = readings[0]?.date, latest = readings.at(-1)?.date;
  const categories = droughtLevels.map(({ code }) => code === "None" && !en ? "Sin sequía" : code);
  const points = readings.flatMap(({ date, category }) => {
    const value = droughtLevels.findIndex(({ code }) => code === category);
    return value < 0 ? [] : [{ date, value, detail: droughtLevels[value][lang][0] }];
  });
  return <section id="drought-trend" aria-labelledby="drought-trend-title" className="drought-trend">
    <h2 id="drought-trend-title">{title}</h2>
    <figure className="stage-proximity-chart">
      <figcaption>{en ? "Weekly county category" : "Categoría semanal del condado"}</figcaption>
      {first && latest ? <Chart title={title}
        description={en ? "Official weekly North Carolina drought classifications for Durham County." : "Clasificaciones semanales oficiales de sequía de Carolina del Norte para el condado de Durham."}
        series={[{ label: en ? "County drought category" : "Categoría de sequía del condado", color: "var(--chart-alert, #9b4b1d)", points }]}
        unit={en ? "Severity" : "Gravedad"} categories={categories} lang={lang} gapDays={7}
        window={first === latest ? trendWindow(latest, "30") : { start: first, end: latest }} />
        : <p>{en ? "No weekly classifications available." : "No hay clasificaciones semanales disponibles."}</p>}
      <p className="level-sources"><a href="https://www.ncdrought.org/map-archives" target="_blank" rel="noreferrer">{en ? "NC drought archive" : "Archivo de sequía de Carolina del Norte"} ↗</a> · <a href="#drought">{en ? "What D0–D4 mean" : "Qué significan D0–D4"} ↓</a></p>
    </figure>
  </section>;
}

export function DroughtLevels({ lang }: { lang: Lang }) {
  const en = lang === "en";
  return (
    <div className="level-guide" aria-labelledby="drought-levels-title">
      <h3 id="drought-levels-title">{en ? "Drought categories: D0–D4" : "Categorías de sequía: D0–D4"}</h3>
      <p>{en
        ? "Experts assess rainfall, soil moisture, streamflow, groundwater and reported impacts together each week. The percentile bands are typical indicator ranges, not automatic triggers: the 10th percentile means conditions are as dry as or drier than about 90% of the historical record."
        : "Cada semana, expertos evalúan en conjunto lluvia, humedad del suelo, caudal, agua subterránea e impactos reportados. Los percentiles son rangos típicos de los indicadores, no criterios automáticos: el percentil 10 indica condiciones tan secas o más secas que aproximadamente el 90% del registro histórico."}</p>
      <div className="table-scroll" role="region" aria-labelledby="drought-levels-title" tabIndex={0}>
        <table className="drought-level-table">
          <caption className="sr-only">{en ? "Drought severity, typical indicator percentiles and possible impacts" : "Gravedad de sequía, percentiles típicos e impactos posibles"}</caption>
          <thead><tr><th scope="col">{en ? "Category" : "Categoría"}</th><th scope="col">{en ? "Typical percentile (approx.)" : "Percentil típico (aprox.)"}</th><th scope="col">{en ? "What it means" : "Qué significa"}</th></tr></thead>
          <tbody>{droughtLevels.map(({ code, range, ...labels }) => (
            <tr key={code}><th scope="row">{code === "None" ? (en ? "None" : "Ninguna") : code} · {labels[lang][0]}</th><td>{range}</td><td>{labels[lang][1]}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p>{en
        ? "NC assigns each county the highest category covering at least 25% of its land area. These categories describe conditions; they do not themselves impose Durham’s water-use rules or correspond one-to-one with City stages."
        : "NC asigna a cada condado la categoría más alta que cubra al menos el 25% de su superficie. Estas categorías describen condiciones; por sí solas no imponen las reglas de Durham ni equivalen a sus etapas municipales."}</p>
      <p className="level-sources"><a href={classificationUrl} target="_blank" rel="noreferrer">{en ? "U.S. Drought Monitor classification" : "Clasificación del Monitor de Sequía de EE. UU."} ↗</a><span aria-hidden="true"> · </span><a href="https://www.ncdrought.org/" target="_blank" rel="noreferrer">{en ? "NC drought categories and advisories" : "Categorías y avisos de sequía de NC"} ↗</a></p>
    </div>
  );
}
