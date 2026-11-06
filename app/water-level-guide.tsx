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

export function RestrictionLevels({ lang }: { lang: Lang }) {
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
          <article className="level-row" key={stage} aria-labelledby={`restriction-stage-${stage}`}>
            <div>
              <h4 id={`restriction-stage-${stage}`}>{en ? "Stage" : "Etapa"} {stage}{stage === 4 ? (en ? " · Emergency" : " · Emergencia") : ""}</h4>
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
