// Observatorio Electoral de las Naciones · mapa de las elecciones al Congreso (2011-2023) leídas por naciones.
// Módulo ES sin compilación (lo carga index.html). Datos: data/<k>/<nivel>.json (scripts/prozesatu.py) y geometría
// geo/ (scripts/geo.py); municipios y secciones se cargan por provincia, solo las que se ven. Textos en testuak.js.
// Disposición del Hauteskunde Behatokia: herramientas a la izquierda, línea de tiempo abajo y panel a la derecha.
//
// Capas (state.modua): irabazlea (ganador) · lehia (escaños reñidos: último escaño, solo provincias) · part (participación)
// · blokeak (investidura / derecha: último escaño en provincias, votos en el resto). Pestañas del panel (state.fitxa):
// emaitzak (resultados), eserlekuak (escaños: solo provincia y niveles superiores) y bilakaera (evolución); el puntero
// sigue a la pestaña.
//
// Secciones, en orden: utilidades · idioma y plantilla · constantes de color y niveles · carga de datos · estado y
// enlace · acceso a los datos (votos, escaños, bloques, último escaño) · nombres · mapa · color de cada zona · etiquetas
// · puntero · panel · evolución · controles · herramientas · línea de tiempo · ayuda y teclado · arranque.
import * as maplibregl from "./vendor/maplibre-gl.mjs";

// Huella de la versión (scripts/orriak.py la pone en index.html: app.js?v=…). Va en la URL de los módulos propios y de
// cada fichero de datos: si cambian, cambia la URL. Así el navegador no puede quedarse con unos textos viejos (pasó con
// el cambio de nombre) y puede guardar los datos en su caché sin volver a preguntar.
const BERTSIOA = new URL(import.meta.url).searchParams.get("v") || "";
const BERTSIOA_DU = /^[0-9a-f]{12}$/.test(BERTSIOA) && !/^0+$/.test(BERTSIOA);  // sin huella (desarrollo): caché normal
const huellaz = (u) => (BERTSIOA_DU ? `${u}?v=${BERTSIOA}` : u);
const [{ HIZKUNTZAK, TESTUAK }, { hemizikloa }] = await Promise.all([import(huellaz("./testuak.js")), import(huellaz("./hemizikloa.js"))]);

// ---- utilidades ----
const $ = (s) => document.querySelector(s);
// Todo texto que venga de los datos (siglas, nombres) se escapa antes de meterlo en el HTML
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// ---- idioma (castellano por defecto; #l=ca en el enlace, y el navegador recuerda el último) y textos de la plantilla ----
const HIZK = (() => {
  const l = new URLSearchParams(location.hash.slice(1)).get("l");
  if (l in HIZKUNTZAK) { try { localStorage.setItem("on-hizkuntza", l); } catch { /* sin almacenamiento */ } return l; }
  try { const g = localStorage.getItem("on-hizkuntza"); if (g in HIZKUNTZAK) return g; } catch { /* sin almacenamiento */ }
  return "es";
})();
const LOKALEA = { es: "es-ES", ca: "ca-ES", gl: "gl-ES", eu: "es-ES", en: "en-GB" }[HIZK];  // eu: mismas convenciones (1.234,5); muchos navegadores no traen las del euskera
// Números: fmt (1.234), pct (12,3 %), ptu (12,3, puntos), fmtZutabea (1.000 también con separador: leyendas en columna)
const fmt = (n) => (n == null ? "–" : n.toLocaleString(LOKALEA));
const ptu = (n) => (n == null ? "–" : n.toLocaleString(LOKALEA, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const pct = (n) => (n == null ? "–" : `${ptu(n)} %`);
const fmtZutabea = (n) => n.toLocaleString(LOKALEA, { useGrouping: "always" });
// Piezas de HTML repetidas: cuadrito de color, barra por segmentos ([[n, color]]) y variación respecto a la elección
// anterior (▲ 3 / ▼ 1,2 / =; con puntuak, en puntos con un decimal; sin berdina, nada cuando no cambia)
const sq = (kolorea) => `<i class="sq" style="background:${kolorea}"></i>`;
const segBarra = (zatiak) => `<div class="tt-seg">${zatiak.map(([n, kol]) => `<i style="flex:${n};background:${kol}"></i>`).join("")}</div>`;
function aldaketa(d, { puntuak = false, berdina = true } = {}) {
  if (d == null || (!d && !berdina)) return "";
  const zenbakia = d ? ` ${puntuak ? ptu(Math.abs(d)) : Math.abs(d)}` : "";
  return `<span class="d ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "▲" : d < 0 ? "▼" : "="}${zenbakia}</span>`;
}

const T = TESTUAK[HIZK];
document.documentElement.lang = HIZK;
// data-t (texto), data-t-aria, data-t-ph (placeholder), data-t-title: ver testuak.js
for (const el of document.querySelectorAll("[data-t]")) el.textContent = T[el.dataset.t];
for (const el of document.querySelectorAll("[data-t-aria]")) el.setAttribute("aria-label", T[el.dataset.tAria]);
for (const el of document.querySelectorAll("[data-t-ph]")) el.setAttribute("placeholder", T[el.dataset.tPh]);
for (const el of document.querySelectorAll("[data-t-title]")) el.setAttribute("title", T[el.dataset.tTitle]);
for (const el of document.querySelectorAll("[data-maila]")) el.textContent = el.dataset.maila === "auto" ? T.nivelAuto : T.mailak[el.dataset.maila];
$("#top h1").innerHTML = `${esc(T.izenburua.join(" "))} <span class="beta">beta</span>`;
document.title = T.izenburua.join(" ");
// Menú ☰: las páginas en el idioma elegido (castellano: metodologia.html; los demás: metodologia.ca.html…), como scripts/orriak.py
for (const a of document.querySelectorAll(".nab-menua [data-orria]")) a.href = HIZK === "es" ? `${a.dataset.orria}.html` : `${a.dataset.orria}.${HIZK}.html`;
// Idioma: desplegable al final de la barra; al elegir otro, se recarga con #l=… (y el navegador lo recuerda)
$("#hizkuntzak summary").textContent = HIZK.toUpperCase();
$("#hizkuntzak .hizk-menua").innerHTML = Object.entries(HIZKUNTZAK).map(([l, n]) =>
  `<button type="button" data-l="${l}" lang="${l}"${l === HIZK ? ' aria-current="true"' : ""}><b>${l.toUpperCase()}</b> ${n}</button>`).join("");
$("#hizkuntzak .hizk-menua").addEventListener("click", (e) => {
  const b = e.target.closest("[data-l]"); if (!b) return;
  if (b.dataset.l === HIZK) { $("#hizkuntzak").open = false; return; }
  try { localStorage.setItem("on-hizkuntza", b.dataset.l); } catch { /* sin almacenamiento */ }
  const q = new URLSearchParams(location.hash.slice(1)); q.set("l", b.dataset.l); location.hash = q.toString(); location.reload();
});
// Los desplegables (☰ e idioma) se cierran al pulsar fuera o al elegir
document.addEventListener("click", (e) => {
  for (const d of document.querySelectorAll("details[open]")) if (!d.contains(e.target) || e.target.closest("a")) d.open = false;
});
// ---- colores de cada capa, niveles y fondo ----
const NODATA = "#2A3946";
const PART_BINS = [[58, "#E4EEF5"], [64, "#B6CFE3"], [70, "#7FA6CB"], [76, "#4A7BAA"], [Infinity, "#22507D"]];
// «Escaños reñidos»: votos que le faltaron a la siguiente candidatura para quitar el último escaño de la provincia
const LEHIA_BINS = [[1000, "#7A1F1F"], [5000, "#B8452E"], [10000, "#E08A4D"], [20000, "#EFC48F"], [Infinity, "#F5E9D6"]];
// «Bloques»: el bloque que se llevó el último escaño o el de más votos (data/master/blokeak.csv), más intenso cuanto más ventaja
const BLOKE_MUGAK = [5000, 10000, 20000, Infinity];   // provincias: votos que le faltaron al otro bloque (último escaño)
const BLOKE_PUNTUAK = [5, 10, 20, Infinity];          // demás niveles: ventaja del bloque con más votos, en puntos
// Rojo y azul, pero no los del PSOE y el PP: algo más claros y con otro tono (OKLCH: rojo 14°, azul 268°). Comprobados con el
// validador de color: los dos bloques se distinguen en los cuatro pasos (también con daltonismo) y el más oscuro se ve sobre el fondo.
// De claro a intenso: más intenso cuanto más ventaja (en provincias, cuantos más votos le habrían hecho falta al otro bloque)
const BLOKE_KOLOREAK = { INB: ["#FFA3AE", "#FF8090", "#F1516D", "#D23857"], ESK: ["#A9C5FF", "#8CACFF", "#6A8BF0", "#5473D2"], "": ["#8A8F94"] };
const BLOKE_KOLOREA = { INB: "#F1516D", ESK: "#6A8BF0", "": "#8A8F94" };  // el de cada bloque en barras y listas
const ARGIBIDE_MARJINA = 10;  // en el puntero (Resultados), solo quien está a 10 puntos o menos de la primera fuerza
const MAILAK = ["nazioa", "autonomia", "probintzia", "udalerria", "sekzioa"];
const ZOOMAK = { nazioa: [0, 5.9], autonomia: [5.9, 6.8], probintzia: [6.8, 8], udalerria: [8, 10.8], sekzioa: [10.8, 24] };
// Fondo de satélite: Sentinel-2 cloudless 2024 (EOX, CC BY-NC-SA 4.0), como en el Hauteskunde Behatokia
const SATELITEA = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg";
const SAT_KREDITUA = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2024</a> (EOX, Copernicus, CC BY-NC-SA)';
const PENINSULA = [[-9.6, 35.9], [4.5, 43.9]], KANARIAK = [[-18.3, 27.5], [-13.3, 29.5]];
const bin = (v, bins) => { if (v == null || isNaN(v)) return NODATA; for (const [l, c] of bins) if (v <= l) return c; return NODATA; };

// ---- carga de datos (con la huella de la versión: ver arriba) ----
const load = async (u) => {
  const r = await fetch(huellaz(u), BERTSIOA_DU ? { cache: "force-cache" } : {});
  if (!r.ok) throw new Error(u); return r.json();
};
let INDEX, IZENAK, GEO_NAZ, GEO_AUT, GEO_PROB, LURRA;
try {
  [INDEX, IZENAK, GEO_NAZ, GEO_AUT, GEO_PROB, LURRA] = await Promise.all(["data/index.json", "geo/izenak.json", "geo/nazioa.json", "geo/autonomia.json", "geo/probintzia.json", "geo/lurra.json"].map(load));
} catch (e) { $("#kargatzen").textContent = T.error; throw e; }
for (const h of INDEX.hauteskundeak) h.izena = `${T.hilak[+h.hila - 1]} ${h.urtea}`;  // «jul 2023», en el idioma elegido
IZENAK.nazioa.RE[0] = T.restoEstado;  // el único nombre de nación que no es propio
const KK = INDEX.hauteskundeak.map((h) => h.k), INFO = Object.fromEntries(INDEX.hauteskundeak.map((h) => [h.k, h]));
const GOIK = INDEX.goikoak;  // provincia → comunidad, comunidad → nación
const sekUdalerria = (sek) => INDEX.batuak[sek.slice(0, 5)] || sek.slice(0, 5);  // municipio (de hoy) de una sección

// ---- estado (y enlace compartible: #k=202307&m=lehia&s=udalerria:20069&p=lng,lat,zoom) ----
const URL0 = new URLSearchParams(location.hash.slice(1));
const state = {
  k: KK.includes(URL0.get("k")) ? URL0.get("k") : KK[KK.length - 1],
  modua: ["part", "lehia", "blokeak"].includes(URL0.get("m")) ? URL0.get("m") : "irabazlea",
  fitxa: ["eserlekuak", "bilakaera"].includes(URL0.get("f")) ? URL0.get("f") : "emaitzak",  // pestaña del panel
  satelitea: URL0.get("sat") !== "0",
  maila: "auto",
  hautatua: null,  // {maila, id}
};
if (URL0.get("s")) { const [m, id] = URL0.get("s").split(":"); if (MAILAK.includes(m) && id) state.hautatua = { maila: m, id }; }
function urlaIdatzi() {
  const q = new URLSearchParams({ k: state.k, m: state.modua });
  if (state.hautatua) q.set("s", `${state.hautatua.maila}:${state.hautatua.id}`);
  if (state.fitxa !== "emaitzak") q.set("f", state.fitxa);
  if (!state.satelitea) q.set("sat", "0");
  if (HIZK !== "es") q.set("l", HIZK);
  const c = map.getCenter(); q.set("p", `${c.lng.toFixed(3)},${c.lat.toFixed(3)},${map.getZoom().toFixed(2)}`);
  history.replaceState(null, "", "#" + q.toString());
}

// ---- acceso a los datos: votos, escaños, bloques y último escaño (niveles generales enteros; secciones por provincia) ----
// Cada fichero se pide una vez (se guarda la promesa); si falla (red cortada), se olvida para volver a pedirlo
const DATA = {};
async function datuak(k) {
  if (!DATA[k]) DATA[k] = Promise.all(["estatua", "nazioa", "autonomia", "probintzia", "udalerria", "eserlekuak"].map((m) => load(`data/${k}/${m}.json`)))
    .then(([estatua, nazioa, autonomia, probintzia, udalerria, eserlekuak]) => ({ estatua, nazioa, autonomia, probintzia, udalerria, eserlekuak, sek: {} }))
    .catch((e) => { delete DATA[k]; throw e; });
  return DATA[k];
}
const aurretik = (p) => p.catch(() => {});  // lo que se carga por adelantado: si falla, ya se pedirá cuando haga falta
const DATA_SYNC = {};  // k → datos ya cargados (para no esperar al pintar)
async function prestatu(k) { DATA_SYNC[k] = await datuak(k); return DATA_SYNC[k]; }
async function sekzioDatuak(k, cpro) {
  const d = await prestatu(k);
  if (!d.sek[cpro]) d.sek[cpro] = load(`data/${k}/sekzioa/${cpro}.json`).then((x) => (d.sek[cpro] = x), (e) => { delete d.sek[cpro]; throw e; });
  return d.sek[cpro];
}
// Registro de una zona: {censo, votantes, vc (votos a candidaturas), part (%), m (diferencia 1.ª–2.ª en puntos),
// c: [[siglas, votos, %, color, partido, bloque]]} (partido: regla de koloreak.csv; bloque: INB, ESK o «»)
function erregistroa(k, maila, id) {
  const d = DATA_SYNC[k]; if (!d) return null;
  const f = maila === "sekzioa" ? d.sek[id.slice(0, 2)] : d[maila === "estatua" ? "estatua" : maila];
  if (!f || f instanceof Promise || !f.r[id]) return null;
  const [censo, votantes, vc, lista] = f.r[id];
  const c = lista.map(([i, v]) => [f.s[i], v, vc ? (100 * v) / vc : null, f.k[i], f.f[i], (f.b || [])[i] || ""]);
  return { censo, votantes, vc, c, part: censo ? (100 * votantes) / censo : null, m: c.length > 1 ? c[0][2] - c[1][2] : c.length ? 100 : null };
}
const aurrekoa = (k) => KK[KK.indexOf(k) - 1] || null;
// Votos de cada bloque en una zona (data/master/blokeak.csv) y cuál de los dos va delante, por cuántos puntos
function blokeBotoak(r) {
  const v = { INB: 0, ESK: 0, "": 0 }; for (const c of r.c) v[c[5]] += c[1];
  const p = { INB: r.vc ? 100 * v.INB / r.vc : 0, ESK: r.vc ? 100 * v.ESK / r.vc : 0, "": r.vc ? 100 * v[""] / r.vc : 0 };
  const aurrean = p.INB >= p.ESK ? "INB" : "ESK";
  return { v, p, aurrean, beste: aurrean === "INB" ? "ESK" : "INB", aldea: Math.abs(p.INB - p.ESK) };
}
// Escaños de un ámbito con escaños propios (provincia = circunscripción, comunidad, nación, Estado):
// [[siglas, escaños, color, partido, bloque]]
function eserlekuak(k, maila, id) {
  const d = DATA_SYNC[k]; if (!d) return null;
  const e = d.eserlekuak, r = e[maila] && e[maila][id];
  return r ? r.map(([i, n]) => [e.s[i], n, e.k[i], e.f[i], (e.b || [])[i] || ""]) : null;
}
// Escaños de cada bloque en un ámbito: {INB, ESK, "": otros}
function blokeEserlekuak(k, maila, id) {
  const e = eserlekuak(k, maila, id); if (!e) return null;
  return e.reduce((o, x) => { o[x[4]] += x[1]; return o; }, { INB: 0, ESK: 0, "": 0 });
}
// Bloques en el orden de las listas; «otros» solo si tiene algo
const BLOKEAK = ["INB", "ESK", ""];
const blokeZatiak = (o) => BLOKEAK.filter((x) => o[x] || x !== "");
// Municipios y secciones no tienen escaños propios (se reparten por provincia): ahí no se enseñan escaños
const eserlekurikEz = (maila) => maila === "udalerria" || maila === "sekzioa";

// Último escaño de una provincia (prozesatu.py: D'Hondt con el voto CERA): quién lo ganó, la candidatura que menos votos
// necesitaba para quitárselo y cuántos; para los bloques, la del otro bloque que menos votos necesitaba (x[4], de menos a más)
function azkenEserlekua(k, cpro) {
  const d = DATA_SYNC[k], e = d && d.eserlekuak, x = e && e.azkena && e.azkena[cpro]; if (!x) return null;
  const ba = (e.b || [])[x[0]] || "", beste = ba === "INB" ? "ESK" : ba === "ESK" ? "INB" : null;
  const bj = beste && (x[4] || []).find(([i]) => e.b[i] === beste);
  return { a: e.s[x[0]], b: e.s[x[1]], falta: x[2], n: x[3], ba, beste: bj ? beste : null, bj: bj ? e.s[bj[0]] : null, bf: bj ? bj[1] : null };
}
// La frase del último escaño: con partidos (panel) o solo bloques (puntero de «Bloques»)
const azkenTestua = (z, alderdirik = true) => (state.modua !== "blokeak" ? T.azkenaTxt(z.n, esc(z.a), esc(z.b), fmt(z.falta))
  : z.ba ? T.blokeTxt(z.n, alderdirik && esc(z.a), T.blokeIzenak[z.ba], z.beste && T.blokeIzenak[z.beste], fmt(z.bf), alderdirik && esc(z.bj))
  : T.blokeKanpoTxt(z.n, alderdirik && esc(z.a)));
const azkenKutxa = (k, cpro) => { const z = azkenEserlekua(k, cpro); return z ? `<div class="lehia">${azkenTestua(z)}</div>` : ""; };
// Escaños por bloques: barra y una línea por bloque, con la variación respecto a la elección anterior
function blokeZerrenda(k, ak, maila, id) {
  const b = blokeEserlekuak(k, maila, id); if (!b) return "";
  const ba = ak ? blokeEserlekuak(ak, maila, id) : null, n = b.INB + b.ESK + b[""];
  const zatiak = blokeZatiak(b);
  return `<div class="lbl">${T.eserBlokeka}</div><span class="seg bloke-seg">${zatiak.map((x) => `<i style="flex:${b[x]};background:${BLOKE_KOLOREA[x]}">${b[x] >= n * 0.08 ? b[x] : ""}</i>`).join("")}</span>` +
    zatiak.map((x) => `<div class="row"><span class="nm">${sq(BLOKE_KOLOREA[x])} ${T.blokeIzenak[x]}</span><span class="num">${aldaketa(ba && b[x] - ba[x])}</span><span class="pc">${b[x]}</span></div>`).join("");
}

// ---- nombres y jerarquía ----
function izena(maila, id) {
  if (maila === "estatua") return T.estado;
  if (maila === "sekzioa") { const u = IZENAK.udalerria[sekUdalerria(id)]; return `${u ? u[0] : sekUdalerria(id)} · ${id.slice(5, 7)}-${id.slice(7)}`; }
  const r = IZENAK[maila] && IZENAK[maila][id]; return r ? r[0] : id;
}
function goikoak(maila, id) {  // de la nación hacia abajo, sin el propio
  const out = [];
  const cpro = ["sekzioa", "udalerria", "probintzia"].includes(maila) ? id.slice(0, 2) : null;
  const cca = maila === "autonomia" ? id : cpro ? GOIK.probintzia[cpro] : null;
  const naz = maila === "nazioa" ? null : cca ? GOIK.autonomia[cca] : null;
  if (naz) out.push(["nazioa", naz]);
  if (cca && maila !== "autonomia" && IZENAK.autonomia[cca][0] !== IZENAK.nazioa[naz][0]) out.push(["autonomia", cca]);
  if (cpro && maila !== "probintzia" && !(cca && IZENAK.probintzia[cpro][0] === IZENAK.autonomia[cca][0])) out.push(["probintzia", cpro]);  // Nafarroa, Madrid…: comunidad = provincia
  if (maila === "sekzioa") out.push(["udalerria", sekUdalerria(id)]);
  return out;
}

// ---- mapa ----
const GEO = { nazioa: GEO_NAZ, autonomia: GEO_AUT, probintzia: GEO_PROB,
  udalerria: { type: "FeatureCollection", features: [] }, sekzioa: { type: "FeatureCollection", features: [] } };
for (const m of ["nazioa", "autonomia", "probintzia"]) for (const f of GEO[m].features) f.properties.id = f.id;
// «lurra»: todo el territorio en gris «sin datos», debajo (comunales sin municipio que el seccionado no cubre)
const sources = { lurra: { type: "geojson", data: LURRA },
  sat: { type: "raster", tiles: [SATELITEA], tileSize: 256, maxzoom: 13, attribution: SAT_KREDITUA } };  // EOX no da más detalle
const layers = [{ id: "atzealdea", type: "background", paint: { "background-color": "#0C131A" } },
  { id: "sat", type: "raster", source: "sat", layout: { visibility: state.satelitea ? "visible" : "none" } },
  { id: "lurra", type: "fill", source: "lurra", layout: { visibility: state.satelitea ? "none" : "visible" }, paint: { "fill-color": NODATA } }];
const opakutasuna = () => ["case", ["boolean", ["feature-state", "hover"], false], state.satelitea ? 0.85 : 1, state.satelitea ? 0.62 : 0.88];
for (const m of MAILAK) {
  sources[m] = { type: "geojson", data: GEO[m], promoteId: "id" };
  layers.push({ id: m + "-fill", type: "fill", source: m, layout: { visibility: "none" }, paint: {
    "fill-color": ["coalesce", ["feature-state", "c"], NODATA],
    "fill-opacity": opakutasuna() } });
  layers.push({ id: m + "-line", type: "line", source: m, layout: { visibility: "none" }, paint: {
    "line-color": ["case", ["boolean", ["feature-state", "sel"], false], "#F2B544", "#0C131A"],
    "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 2.5, m === "sekzioa" ? 0.3 : 0.6] } });
}
sources.mugak = { type: "geojson", data: GEO_NAZ };  // fronteras de nación, siempre encima
layers.push({ id: "mugak", type: "line", source: "mugak", maxzoom: 8.6, paint: { "line-color": "#F2B544", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 9, 2.2], "line-opacity": 0.85 } });

// Herramientas de la izquierda: en el ordenador, abiertas salvo que se hayan cerrado (el navegador lo recuerda); en el móvil, cerradas
const mugikorra = () => matchMedia("(max-width: 900px)").matches;
try { if (!mugikorra() && localStorage.getItem("on-menua") === "ez") $("#app").classList.add("menurik-ez"); } catch { /* sin almacenamiento */ }
const POS = (URL0.get("p") || "").split(",").map(Number);
const map = new maplibregl.Map({ container: "map", style: { version: 8, sources, layers }, attributionControl: false, minZoom: 3.5, maxZoom: 15,
  ...(POS.length === 3 && POS.every(Number.isFinite) ? { center: [POS[0], POS[1]], zoom: POS[2] } : { bounds: PENINSULA, fitBoundsOptions: { padding: pad() } }) });
map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: T.kreditua }), "top-right");
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
// Créditos plegados (ⓘ) hasta que alguien los abra: MapLibre los despliega solo al cargar y al cambiar las capas
let kredituakIrekita = false;
const kredituakTolestu = () => { const a = document.querySelector(".maplibregl-ctrl-attrib"); if (a && !kredituakIrekita) { a.classList.remove("maplibregl-compact-show"); a.removeAttribute("open"); } };
document.addEventListener("click", (e) => { if (e.target.closest(".maplibregl-ctrl-attrib-button")) kredituakIrekita = true; }, true);
map.on("load", kredituakTolestu); map.on("sourcedata", kredituakTolestu);
// Hueco libre del mapa: sin lo que tapan las herramientas (si se ven), la línea de tiempo y el panel
function pad() {
  if (mugikorra()) return { top: 100, bottom: 170, left: 10, right: 10 };
  return { top: 30, bottom: 110, left: $("#app").classList.contains("menurik-ez") ? 40 : 290, right: 444 };
}
let estiloaPrest = false; map.once("style.load", () => { estiloaPrest = true; });

// Recuadro de cada provincia: para saber qué municipios y secciones hay que cargar
const PROB_BBOX = {};
for (const f of GEO_PROB.features) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => { if (typeof c[0] === "number") { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
  walk(f.geometry.coordinates); PROB_BBOX[f.id] = [x0, y0, x1, y1];
}
function ikusgaiProbintziak() {
  const b = map.getBounds(), [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  return Object.entries(PROB_BBOX).filter(([, [x0, y0, x1, y1]]) => x0 < e && x1 > w && y0 < n && y1 > s).map(([p]) => p);
}
const kargatuta = { udalerria: new Set(), sekzioa: new Set() };
let sekUrtea = null;
async function geoKargatu(maila, probak) {
  if (maila === "sekzioa") {
    const u = INFO[state.k].sekzioUrtea;
    if (u !== sekUrtea) { sekUrtea = u; kargatuta.sekzioa.clear(); GEO.sekzioa.features = []; margotuta.sekzioa = null; }
  }
  const falta = probak.filter((p) => !kargatuta[maila].has(p));
  if (!falta.length) return false;
  falta.forEach((p) => kargatuta[maila].add(p));
  const url = (p) => (maila === "udalerria" ? `geo/udalerriak/${p}.json` : `geo/sekzioak/${sekUrtea}/${p}.json`);
  const bildumak = await Promise.all(falta.map((p) => load(url(p)).catch(() => ({ features: [] }))));
  for (const fc of bildumak) for (const f of fc.features) { f.properties.id = f.id; GEO[maila].features.push(f); }
  map.getSource(maila).setData(GEO[maila]);
  return true;
}

// ---- color de cada zona (feature-state: no se rehace la geometría al cambiar de elección o de capa) ----
function kolorea(r, maila, id) {
  if (state.modua === "lehia") { const z = maila === "probintzia" && azkenEserlekua(state.k, id); return z ? bin(z.falta, LEHIA_BINS) : NODATA; }
  if (state.modua === "blokeak") {
    if (maila === "probintzia") {  // la circunscripción: el bloque que se llevó el último escaño
      const z = azkenEserlekua(state.k, id); if (!z) return NODATA;
      const kol = BLOKE_KOLOREAK[z.ba]; return z.ba && z.bf != null ? kol[BLOKE_MUGAK.findIndex((l) => z.bf <= l)] : kol[kol.length - 1];
    }
    if (!r) return NODATA;  // el resto de niveles: el bloque con más votos
    const z = blokeBotoak(r); if (!z.v.INB && !z.v.ESK) return BLOKE_KOLOREAK[""][0];
    return BLOKE_KOLOREAK[z.aurrean][BLOKE_PUNTUAK.findIndex((l) => z.aldea <= l)];
  }
  if (!r) return NODATA;
  if (state.modua === "irabazlea") return r.c[0] ? r.c[0][3] : NODATA;
  return bin(r.part, PART_BINS);
}
const margotuta = {};  // nivel → firma de lo último pintado
const irabazleakMailaka = {};  // nivel → partido → zonas que gana
function margotu(maila) {
  const sinadura = `${state.k}|${state.modua}|${GEO[maila].features.length}`;
  if (margotuta[maila] === sinadura) return;
  margotuta[maila] = sinadura;
  const irabazleak = irabazleakMailaka[maila] = new Map();  // leyenda del modo Ganador: quién gana cuántas zonas
  for (const f of GEO[maila].features) {
    const r = erregistroa(state.k, maila, String(f.id));
    map.setFeatureState({ source: maila, id: f.id }, { c: kolorea(r, maila, String(f.id)) });
    if (r && r.c[0]) {  // por partido: PSC, PSE-EE y PSN-PSOE cuentan juntos (con el nombre más frecuente)
      const [s, , , kol, f] = r.c[0], g = irabazleak.get(f) || { kol, n: 0, izenak: new Map() };
      g.n++; g.izenak.set(s, (g.izenak.get(s) || 0) + 1); irabazleak.set(f, g);
    }
  }
  legenda();
}
// «Escaños reñidos» solo tiene sentido por circunscripción: con esa capa, siempre provincias («Bloques», en todos)
const BARRUTIKA = ["lehia"];
const mailaAktiboa = () => (BARRUTIKA.includes(state.modua) ? "probintzia" : state.maila !== "auto" ? state.maila : MAILAK.find((m) => map.getZoom() < ZOOMAK[m][1]));
let azkenMaila = null;
async function eguneratu() {
  const m = mailaAktiboa();
  const mailaBerria = m !== azkenMaila;
  if (mailaBerria) {
    for (const x of MAILAK) for (const s of ["-fill", "-line"]) map.setLayoutProperty(x + s, "visibility", x === m ? "visible" : "none");
    azkenMaila = m;
  }
  await prestatu(state.k);
  if (m === "udalerria" || m === "sekzioa") {
    const probak = ikusgaiProbintziak();
    if (m === "sekzioa") await Promise.all(probak.map((p) => sekzioDatuak(state.k, p)));
    if (await geoKargatu(m, probak)) margotuta[m] = null;
  }
  margotu(m);
  if (mailaBerria) legenda();  // la de este nivel (Bloques: último escaño en provincias, votos en el resto)
  etiketak(); urlaIdatzi();
  $("#kargatzen").hidden = true;
}

// ---- etiquetas, en HTML sobre el mapa: naciones, comunidades o provincias según el nivel y, desde UDAL_HASI, los nombres
// de los municipios, de más a menos censo y cada vez más pequeños al acercarse. Nunca uno encima de otro (gana el más
// importante, y con un margen para que no se amontonen) ni debajo de los paneles ----
const etiketaKutxa = $("#etiketak");
const MAILA_LETRA = { nazioa: [14, .22], autonomia: [11, .14], probintzia: [10, .14] };  // tamaño (px) y espaciado (em) de .etiketa
const HIRIA = 75000;  // censo desde el que un municipio va con letra mayor (unos 100.000 habitantes)
// Censo mínimo para rotular un municipio según el zoom: 60.000 a zoom 7,3 (con las provincias), 20.000 a 8, 4.600 a 9,
// 1.000 a 10, 230 a 11…; con el mapa por provincias (Escaños reñidos), solo las ciudades (UDAL_PROBINTZIAKA)
const UDAL_HASI = 7.3, UDAL_PROBINTZIAKA = 20000;
const udalGutxienez = (z) => 60000 * 2 ** (-(z - UDAL_HASI) * 2.2);
const ETIKETA_TARTEA = [7, 5];  // aire alrededor de cada nombre (px, horizontal y vertical): sin amontonarse
// Relleno: en las zonas con poca gente (Soria, Teruel…) el censo no llega y el mapa se quedaba vacío. Los pueblos que
// saldrían BETEGARRI_Z niveles de zoom más tarde salen ya, pero solo donde hay mucho sitio (con más aire alrededor): en
// las zonas densas casi nunca caben, así que allí no se recarga
const BETEGARRI_Z = 2, BETEGARRI_TARTEA = [26, 20];
const udalOrdenak = {};  // elección → [[municipio, censo]] de más a menos censo
function udalOrdena(k) {
  const d = DATA_SYNC[k]; if (!d) return [];
  if (!udalOrdenak[k]) udalOrdenak[k] = Object.entries(d.udalerria.r).map(([id, r]) => [id, r[0]]).sort((a, b) => b[1] - a[1]);
  return udalOrdenak[k];
}
// Candidatos en orden de importancia: [nombre, lon, lat, clase, tamaño de letra, espaciado, se puede mover, relleno]. Con las
// provincias y sus ciudades a la vez: primero las ciudades grandes, luego las provincias (que se apartan un poco si no
// caben en su sitio) y luego las demás; la capital que se llama como su provincia (León, Sevilla…) no se repite
const izenGakoa = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function etiketaHautagaiak(m, z) {
  const mailakoak = m === "udalerria" || m === "sekzioa" ? [] : Object.values(IZENAK[m]).map(([n, x, y]) => [n, x, y, m, ...MAILA_LETRA[m], true]);
  if (z < UDAL_HASI || !(m === "probintzia" || m === "udalerria" || m === "sekzioa")) return mailakoak;
  const b = map.getBounds(), [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const gutxienez = m === "probintzia" ? Math.max(udalGutxienez(z), UDAL_PROBINTZIAKA) : udalGutxienez(z);
  const betegarri = m === "probintzia" ? gutxienez : udalGutxienez(z + BETEGARRI_Z);
  const hiriak = [], besteak = [];
  for (const [id, censo] of udalOrdena(state.k)) {
    if (censo < betegarri) break;
    const iz = IZENAK.udalerria[id]; if (!iz || iz[1] < w || iz[1] > e || iz[2] < s || iz[2] > n) continue;
    if (m === "probintzia") {
      const prob = izenGakoa(IZENAK.probintzia[id.slice(0, 2)][0]), hau = izenGakoa(iz[0]);
      if (hau === prob || hau.startsWith(prob + " ")) continue;  // Castelló de la Plana, Las Palmas de Gran Canaria…
    }
    const [klasea, tam] = censo >= HIRIA ? ["udalerria hiria", 13] : censo >= gutxienez ? ["udalerria", 11.5] : ["udalerria txikia", 10.5];
    (censo >= HIRIA ? hiriak : besteak).push([iz[0], iz[1], iz[2], klasea, tam, 0, false, censo < gutxienez]);
  }
  return [...hiriak, ...mailakoak, ...besteak];
}
function etiketak() {
  const hautagaiak = etiketaHautagaiak(mailaAktiboa(), map.getZoom());
  const { top: goia, height: altuera } = etiketaKutxa.getBoundingClientRect();
  // lo que tapa el mapa: paneles y los botones del propio mapa (zoom, créditos)
  const estalkiak = ["#rail", "#railbtn", "#legenda", "#denboralerroa", "#panela", ".maplibregl-ctrl-top-left", ".maplibregl-ctrl-top-right"]
    .map((sel) => $(sel)).filter((el) => el && el.offsetParent && getComputedStyle(el).visibility !== "hidden").map((el) => el.getBoundingClientRect());
  const kutxak = [];  // los ya puestos: [x, y, medio ancho, medio alto]
  let html = "";
  for (const [n, x, y, klasea, tam, tarte, mugi, bete] of hautagaiak) {
    const p = map.project([x, y]); if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight - goia) continue;
    // ancho aproximado del nombre (mayúsculas espaciadas o minúsculas) para no pisar a otro, con su aire alrededor
    const [ax, ay] = bete ? BETEGARRI_TARTEA : ETIKETA_TARTEA;
    const erdia = n.length * tam * ((klasea.startsWith("udalerria") ? .52 : .7) + tarte) / 2, w = erdia + ax, h = tam / 2 + ay;
    const px = Math.min(Math.max(p.x, erdia + ETIKETA_TARTEA[0]), innerWidth - erdia - ETIKETA_TARTEA[0]);  // dentro de la pantalla
    const py = (mugi ? [0, 1, -1, 2, -2] : [0]).map((i) => p.y + i * 2 * h).find((py) =>  // su sitio o, si se puede, un poco más arriba o abajo
      py - tam / 2 - 2 >= 0 && py + tam / 2 + 2 <= altuera  // entero, sin cortarse arriba ni abajo
      && !estalkiak.some((r) => px + w > r.left && px - w < r.right && py + goia + h > r.top && py + goia - h < r.bottom)
      && !kutxak.some(([a, b, kw, kh]) => Math.abs(a - px) < w + kw && Math.abs(b - py) < h + kh));
    if (py === undefined) continue;
    kutxak.push([px, py, w, h]);
    html += `<span class="etiketa ${klasea}" style="left:${px.toFixed(0)}px;top:${py.toFixed(0)}px">${esc(n)}</span>`;
  }
  etiketaKutxa.innerHTML = html;
}

// ---- puntero ----
const tip = $("#tip");
let hov = null;
// El puntero: arriba, la frase de la capa (lo que dice el color del mapa); debajo, los números de la pestaña del panel:
// con Escaños, escaños (de la provincia para arriba); si no, porcentajes. Con «Bloques», bloques y no partidos (quién es de
// cada uno, en Metodología).
function argibidea(maila, id) {
  const blokeak = state.modua === "blokeak", eser = state.fitxa === "eserlekuak" && !eserlekurikEz(maila);
  const zenbakiak = eser ? (blokeak ? blokeEserZatia : eserZatia)(maila, id) : (blokeak ? blokeBotoZatia : botoZatia)(maila, id);
  return `<div class="tt-n">${esc(izena(maila, id))}</div>${argibideEsaldia(maila, id)}${zenbakiak}`;
}
function argibideEsaldia(maila, id) {
  if (["lehia", "blokeak"].includes(state.modua) && maila === "probintzia") {  // el último escaño
    const z = azkenEserlekua(state.k, id); return z ? `<div class="tt-azkena">${azkenTestua(z, state.modua !== "blokeak")}</div>` : "";
  }
  if (state.modua === "blokeak") {  // el bloque con más votos
    const r = erregistroa(state.k, maila, id); if (!r) return "";
    const z = blokeBotoak(r); return `<div class="tt-azkena">${T.blokeBotoTxt(T.blokeIzenak[z.aurrean], T.blokeIzenak[z.beste], ptu(z.aldea))}</div>`;
  }
  return "";
}
// Resultados: los partidos a 10 puntos o menos del primero
function botoZatia(maila, id) {
  const r = erregistroa(state.k, maila, id); if (!r) return `<div class="tt-m">${T.sinDatos}</div>`;
  const lehen = r.c[0] ? r.c[0][2] : 0;
  return `<div class="tt-m">${T.part} ${pct(r.part)} · ${T.margen} ${ptu(r.m)} ${T.puntos}</div>` + r.c.filter((c) => c[2] >= lehen - ARGIBIDE_MARJINA).slice(0, 5)
    .map((c) => `<div class="tt-r"><span>${sq(c[3])} ${esc(c[0])}</span><span>${pct(c[2])}</span></div>`).join("");
}
// Resultados con «Bloques»: el % de cada bloque
function blokeBotoZatia(maila, id) {
  const r = erregistroa(state.k, maila, id); if (!r) return `<div class="tt-m">${T.sinDatos}</div>`;
  const z = blokeBotoak(r), zatiak = blokeZatiak(z.v);
  return `<div class="tt-m">${T.part} ${pct(r.part)}</div>${segBarra(zatiak.map((x) => [z.v[x], BLOKE_KOLOREA[x]]))}` +
    zatiak.map((x) => `<div class="tt-r"><span>${sq(BLOKE_KOLOREA[x])} ${T.blokeIzenak[x]}</span><b>${pct(z.p[x])}</b></div>`).join("");
}
// Escaños del ámbito (provincia o superior)
const eserMeta = (n) => `<div class="tt-m">${n} ${T.escanosN}</div>`;
function eserZatia(m, i) {
  const ak = aurrekoa(state.k);
  const e = eserlekuak(state.k, m, i) || [], n = e.reduce((s, x) => s + x[1], 0); if (!n) return `<div class="tt-m">${T.sinEscanos}</div>`;
  const aur = ak && eserlekuak(ak, m, i) ? eserlekuak(ak, m, i).reduce((mp, [, x, , f]) => mp.set(f, (mp.get(f) || 0) + x), new Map()) : null;
  return eserMeta(n) + segBarra(e.map(([, x, kol]) => [x, kol])) +
    e.map(([sig, x, kol, f]) => `<div class="tt-r"><span>${sq(kol)} ${esc(sig)}</span><span>${aldaketa(aur && x - (aur.get(f) || 0), { berdina: false })} <b>${x}</b></span></div>`).join("");
}
// Escaños con «Bloques»: los de cada bloque
function blokeEserZatia(m, i) {
  const ak = aurrekoa(state.k);
  const b = blokeEserlekuak(state.k, m, i), n = b ? b.INB + b.ESK + b[""] : 0; if (!n) return `<div class="tt-m">${T.sinEscanos}</div>`;
  const ba = ak ? blokeEserlekuak(ak, m, i) : null, zatiak = blokeZatiak(b);
  return eserMeta(n) + segBarra(zatiak.map((x) => [b[x], BLOKE_KOLOREA[x]])) +
    zatiak.map((x) => `<div class="tt-r"><span>${sq(BLOKE_KOLOREA[x])} ${T.blokeIzenak[x]}</span><span>${aldaketa(ba && b[x] - ba[x], { berdina: false })} <b>${b[x]}</b></span></div>`).join("");
}
for (const m of MAILAK) {
  map.on("mousemove", m + "-fill", (e) => {
    const f = e.features && e.features[0]; if (!f) return;
    if (!hov || hov.id !== f.id || hov.source !== m) { if (hov) map.setFeatureState(hov, { hover: false }); hov = { source: m, id: f.id }; map.setFeatureState(hov, { hover: true }); }
    tip.innerHTML = argibidea(m, String(f.id)); tip.classList.add("on");
    // junto al ratón (e.point es relativo al mapa, que empieza bajo la barra), sin salirse por la derecha ni por abajo
    const x = Math.min(e.point.x + 16, innerWidth - tip.offsetWidth - 10);
    const y = Math.min(e.point.y + map.getContainer().offsetTop + 6, innerHeight - tip.offsetHeight - 10);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  map.on("mouseleave", m + "-fill", () => { if (hov) map.setFeatureState(hov, { hover: false }); hov = null; tip.classList.remove("on"); });
  map.on("click", m + "-fill", (e) => { const f = e.features && e.features[0]; if (f) hautatu({ maila: m, id: String(f.id) }); });
}

// ---- selección y panel ----
let selRef = null;
function hautatu(h, joan = false) {
  if (selRef) map.setFeatureState(selRef, { sel: false });
  state.hautatua = h; selRef = null;
  if (h && map.getSource(h.maila)) { selRef = { source: h.maila, id: h.id }; map.setFeatureState(selRef, { sel: true }); }
  if (h && joan) { const r = IZENAK[h.maila] && IZENAK[h.maila][h.id]; if (r) map.flyTo({ center: [r[1], r[2]], zoom: Math.max(map.getZoom(), { nazioa: 5.5, autonomia: 6.4, probintzia: 7.4, udalerria: 10, sekzioa: 12 }[h.maila]) }); }
  panela(); urlaIdatzi();
}
// Cuatro cifras de la zona: participación (con su variación), votantes, censo y margen 1.ª–2.ª
function kpis(r, ra) {
  const d = aldaketa(ra && r.part != null && ra.part != null ? r.part - ra.part : null, { puntuak: true });
  return `<div class="kpis"><div class="kpi"><div class="v">${pct(r.part)}${d}</div><div class="k">${T.part}</div></div>
    <div class="kpi"><div class="v">${fmt(r.votantes)}</div><div class="k">${T.votantes}</div></div>
    <div class="kpi"><div class="v">${fmt(r.censo)}</div><div class="k">${T.censo}</div></div>
    <div class="kpi"><div class="v">${ptu(r.m)}</div><div class="k">${T.margenKpi}</div></div></div>`;
}
// Votos por bloques (Resultados, con la capa Bloques): una fila por bloque, con la variación en puntos
function blokeBotoZerrenda(r, ra) {
  const z = blokeBotoak(r), za = ra ? blokeBotoak(ra) : null, zatiak = blokeZatiak(z.v);
  const gehien = Math.max(...zatiak.map((x) => z.p[x]), 1);
  return `<div class="lbl">${T.botoBlokeka}</div>` + zatiak.map((x) => `<div class="row"><span class="nm">${sq(BLOKE_KOLOREA[x])} ${T.blokeIzenak[x]}</span>` +
    `<span class="num">${fmt(z.v[x])} ${aldaketa(za && z.p[x] - za.p[x], { puntuak: true })}</span><span class="pc">${pct(z.p[x])}</span>` +
    `<span class="bar"><i style="width:${(z.p[x] / gehien * 100).toFixed(1)}%;background:${BLOKE_KOLOREA[x]}"></i></span></div>`).join("");
}
// Resultados de la zona: quién supera a quién y las 14 primeras candidaturas
function emaitzak(r) {
  const lehen = r.c[0] ? r.c[0][2] : 0;
  const lehia = r.c.length > 1 ? `<div class="lehia">${T.lehiaTxt(esc(r.c[0][0]), esc(r.c[1][0]), ptu(r.m))}</div>` : "";
  const rows = r.c.slice(0, 14).map((c) => `<div class="row"><span class="nm">${sq(c[3])} ${esc(c[0])}</span><span class="num">${fmt(c[1])}</span><span class="pc">${pct(c[2])}</span><span class="bar"><i style="width:${Math.min(100, c[2] / Math.max(lehen, 1) * 100).toFixed(1)}%;background:${c[3]}"></i></span></div>`).join("");
  return `${lehia}<div class="lbl">${T.resultados} · ${fmt(r.vc)} ${T.vc}</div>${rows}`;
}

// Lista de escaños con variación respecto a la elección anterior, por partido (koloreak.csv: ERC-SOBIRANISTES y ERC son el mismo)
function eserZerrenda(e, ea) {
  const aur = ea ? ea.reduce((m, [, n, , f]) => m.set(f, (m.get(f) || 0) + n), new Map()) : null;
  return e.map(([s, n, k, f]) => `<div class="row"><span class="nm">${sq(k)} ${esc(s)}</span><span class="num">${aldaketa(aur && n - (aur.get(f) || 0))}</span><span class="pc">${n}</span></div>`).join("");
}
// Pestaña Escaños: el Congreso (Estado) o el ámbito elegido, con su hemiciclo, sus escaños y los de cada bloque
function eserlekuOrria(k, ak, h) {
  if (!h) {  // Estado: Congreso entero y escaños de cada nación
    const e = eserlekuak(k, "estatua", "ES"); if (!e) return "";
    const nazioak = Object.keys(IZENAK.nazioa).map((id) => [id, eserlekuak(k, "nazioa", id) || []]).sort((a, b) => b[1].reduce((s, x) => s + x[1], 0) - a[1].reduce((s, x) => s + x[1], 0));
    return `${buruak(T.congreso, `${INFO[k].izena} · ${T.mayoria}`)}${hemizikloa(e, T.escanosN)}${eserZerrenda(e, ak && eserlekuak(ak, "estatua", "ES"))}${blokeZerrenda(k, ak, "estatua", "ES")}
      <div class="lbl">${T.porNacion}</div>${nazioak.map(([id, x]) => { const n = x.reduce((s, y) => s + y[1], 0);
        return `<div class="nazio-eser"><button type="button" data-hautatu="nazioa:${id}">${esc(izena("nazioa", id))}</button><b>${n}</b><span class="seg">${x.map(([s, m, kol]) => `<i style="flex:${m};background:${kol}" title="${esc(s)} ${m}">${m >= n * 0.12 ? m : ""}</i>`).join("")}</span></div>`; }).join("")}`;
  }
  // Ámbito con escaños propios; municipios y secciones no los tienen: se explica y se ofrece su provincia
  const [m, id] = [h.maila, h.id];
  const buru = buruak(esc(izena(h.maila, h.id)), `${T.escanos} · ${T.congreso} ${INFO[k].izena}`, true);
  if (eserlekurikEz(m)) return buru + `<p class="hint">${T.eserBarrutia}</p>${joateko("probintzia", id.slice(0, 2))}`;
  const e = eserlekuak(k, m, id);
  if (!e || !e.length) return buru + `<p class="hint">${T.sinEscanos}</p>`;
  return buru + (m === "probintzia" ? azkenKutxa(k, id) : "") + hemizikloa(e, T.escanosN) + eserZerrenda(e, ak && eserlekuak(ak, m, id)) + blokeZerrenda(k, ak, m, id);
}
// Botón para ir a otra zona (la provincia de un municipio, el municipio de una sección)
const joateko = (maila, id) => `<button type="button" class="ibtn ekintza" data-hautatu="${maila}:${id}">${T.ikusi(esc(izena(maila, id)))}</button>`;
// Cabecera del panel: nombre, línea de datos y, si hay algo elegido, la × para volver al Estado
function buruak(izen, meta, itxi = false) {
  return `<div class="hdr"><div><h2>${izen}</h2><div class="meta">${meta}</div></div>${itxi ? `<button type="button" class="itxi" aria-label="${T.cerrar}" title="${T.cerrar}" data-hautatu="">×</button>` : ""}</div>`;
}
// Migas de pan en la barra de arriba: Estado › nación › comunidad › provincia › municipio
function kokapena() {
  const h = state.hautatua, osoa = [["estatua", "ES"], ...(h ? [...goikoak(h.maila, h.id), [h.maila, h.id]] : [])];
  // comunidad y provincia con el mismo nombre (Murcia › Murcia), una vez; el municipio de Murcia sí va aparte
  const katea = osoa.filter(([m, id], i) => !(i < osoa.length - 1 && osoa[i + 1][0] === "probintzia" && izena(m, id) === izena(...osoa[i + 1])));
  $("#crumb").innerHTML = katea.map(([m, id], i) => i === katea.length - 1 ? `<span class="cur">${esc(izena(m, id))}</span>`
    : `<button type="button" data-hautatu="${m === "estatua" ? "" : `${m}:${id}`}">${esc(izena(m, id))}</button>`).join('<span class="sep">›</span>');
}
// Panel de la derecha: la pestaña abierta, para el Estado o para la zona elegida
function panela() {
  const k = state.k, ak = aurrekoa(k), h = state.hautatua, el = $("#edukia");
  for (const b of document.querySelectorAll("#fitxak [data-fitxa]")) b.setAttribute("aria-selected", b.dataset.fitxa === state.fitxa);
  kokapena();
  if (ak && !DATA_SYNC[ak]) aurretik(prestatu(ak).then(panela));  // la anterior, para las variaciones (▲▼)
  if (state.fitxa === "bilakaera") { el.innerHTML = bilakaeraOrria(h); return; }
  if (state.fitxa === "eserlekuak") { el.innerHTML = eserlekuOrria(k, ak, h); return; }
  if (!h) {
    const r = erregistroa(k, "estatua", "ES"); if (!r) { el.innerHTML = ""; return; }
    const ra = ak ? erregistroa(ak, "estatua", "ES") : null;
    const nazioak = Object.keys(IZENAK.nazioa).map((id) => [id, erregistroa(k, "nazioa", id)]).filter(([, x]) => x).sort((a, b) => b[1].votantes - a[1].votantes);
    el.innerHTML = buruak(T.estado, `${T.congreso} · ${INFO[k].izena}${ak ? ` · ▲▼ ${T.respectoA} ${INFO[ak].izena}` : ""}`) + `${kpis(r, ra)}
      <div class="lbl">${T.naciones}</div><div class="taula"><span class="h">${T.nacion}</span><span class="h num">${T.part}</span><span class="h">${T.primera}</span><span class="h num">${T.margen}</span>
      ${nazioak.map(([id, x]) => `<span><button type="button" data-hautatu="nazioa:${id}">${esc(izena("nazioa", id))}</button></span><span class="num">${pct(x.part)}</span><span>${esc(x.c[0] ? x.c[0][0] : "–")}</span><span class="num">${ptu(x.m)}</span>`).join("")}</div>
      ${state.modua === "blokeak" ? blokeBotoZerrenda(r, ra) : ""}${emaitzak(r)}<p class="hint">${T.estadoHint}</p>`;
    return;
  }
  const r = erregistroa(k, h.maila, h.id), ra = ak && h.maila !== "sekzioa" ? erregistroa(ak, h.maila, h.id) : null;
  const katea = goikoak(h.maila, h.id).map(([m, id]) => `<button type="button" data-hautatu="${m}:${id}">${esc(izena(m, id))}</button>`).join(" › ");
  el.innerHTML = buruak(esc(izena(h.maila, h.id)), `${T.mailak[h.maila]} · ${T.congreso} ${INFO[k].izena}`, true) +
    `${katea ? `<div class="katea">${katea}</div>` : ""}${r ? kpis(r, ra) + (h.maila === "probintzia" ? azkenKutxa(k, h.id) : "") + (state.modua === "blokeak" ? blokeBotoZerrenda(r, ra) : "") + emaitzak(r) : `<p class="hint">${T.sinDatos}</p>`}`;
}
// Botones con data-hautatu (tabla de naciones, migas de pan, ×): eligen esa zona y van a ella; vacío = el Estado
function hautatuBotoia(e) {
  const b = e.target.closest("[data-hautatu]"); if (!b) return;
  if (!b.dataset.hautatu) { hautatu(null); return; }
  const [m, id] = b.dataset.hautatu.split(":"); hautatu({ maila: m, id }, true);
}
$("#edukia").addEventListener("click", hautatuBotoia);
$("#crumb").addEventListener("click", hautatuBotoia);
function fitxaAldatu(f) {
  state.fitxa = f; panela(); urlaIdatzi(); orriaZabaldu(true);
  if (hov && tip.classList.contains("on")) tip.innerHTML = argibidea(hov.source, String(hov.id));  // el puntero sigue a la pestaña
}
$("#fitxak").addEventListener("click", (e) => { const f = e.target.closest("[data-fitxa]"); if (f) fitxaAldatu(f.dataset.fitxa); });

// ---- evolución (pestaña Bilakaera, como en el Behatokia): cómo ha votado la zona en todas las elecciones ----
// Datos: data/bilakaera/<nivel>.json y data/bilakaera/udalerria/<provincia>.json (prozesatu.py): por zona y elección,
// [participación, %INB, %ESK, [[i, %], …], [[i, escaños], …]]. Con la capa Bloques, por bloques; si no, por partidos
// (agrupados por la regla de koloreak.csv aunque cambien las siglas, con el nombre de la última vez). Del Estado al
// municipio: las secciones cambian de un año a otro y no se pueden comparar.
const BILAKAERA = {};  // fichero → datos (o la promesa mientras se cargan)
const BIL_GUTXIENEZ = 4, BIL_LERRO_MAX = 7;  // un partido sale en el gráfico si llega al 4 % alguna vez; como mucho 7
const bilFitxategia = (maila, id) => (maila === "udalerria" ? `data/bilakaera/udalerria/${id.slice(0, 2)}.json` : `data/bilakaera/${maila}.json`);
function bilakaeraDatuak(maila, id) {
  const f = bilFitxategia(maila, id);
  if (!BILAKAERA[f]) BILAKAERA[f] = load(f).then((d) => (BILAKAERA[f] = d), (e) => { delete BILAKAERA[f]; throw e; });
  return BILAKAERA[f];
}
// Líneas del gráfico: [{izena, kolorea, b: {elección: %}}]
function bilLerroak(d, hist, ks) {
  if (state.modua === "blokeak") {
    const balioak = (f) => Object.fromEntries(ks.map((k) => [k, f(hist[k])]));
    return [{ izena: T.blokeIzenak.INB, kolorea: BLOKE_KOLOREA.INB, b: balioak((x) => x[1]) },
      { izena: T.blokeIzenak.ESK, kolorea: BLOKE_KOLOREA.ESK, b: balioak((x) => x[2]) },
      { izena: T.blokeIzenak[""], kolorea: BLOKE_KOLOREA[""], b: balioak((x) => Math.max(0, Math.round((100 - x[1] - x[2]) * 10) / 10)) }];
  }
  // partido → {izena (siglas de la última vez), kolorea, b}. Si en una elección se presentan dos candidaturas del mismo
  // partido (Junts y PDeCAT en 2023, misma regla de koloreak.csv), cuenta la más votada: van de más a menos votos
  const alderdiak = new Map();
  for (const k of ks) for (const [i, p] of hist[k][3]) {
    const a = alderdiak.get(d.f[i]) || { b: {} };
    if (a.b[k] != null) continue;
    a.izena = d.s[i]; a.kolorea = d.k[i]; a.b[k] = p; alderdiak.set(d.f[i], a);
  }
  const gehienez = (a) => Math.max(...Object.values(a.b));
  return [...alderdiak.values()].filter((a) => gehienez(a) >= BIL_GUTXIENEZ).sort((a, b) => gehienez(b) - gehienez(a)).slice(0, BIL_LERRO_MAX);
}
// Gráfico de líneas: x = fecha de cada elección, y = %; la línea se corta donde el partido no se presentó; la elección del
// mapa, marcada; cada punto con su valor (<title>)
function bilGrafikoa(ks, lerroak) {
  const W = 340, H = 180, ML = 30, MR = 12, MT = 10, MB = 22;
  const x0 = dataZ(ks[0]), x1 = dataZ(ks.at(-1));
  const xs = (k) => (ks.length === 1 ? (ML + W - MR) / 2 : ML + (W - ML - MR) * (dataZ(k) - x0) / (x1 - x0));
  const ymax = Math.max(10, Math.ceil(Math.max(...lerroak.flatMap((l) => Object.values(l.b))) / 10) * 10);
  const ys = (v) => MT + (H - MT - MB) * (1 - v / ymax);
  let s = "";
  for (let v = 0; v <= ymax; v += ymax > 50 ? 20 : 10) {
    s += `<line class="bil-grid" x1="${ML}" x2="${W - MR}" y1="${ys(v)}" y2="${ys(v)}"/><text class="bil-ax" x="${ML - 4}" y="${ys(v) + 3}" text-anchor="end">${v}</text>`;
  }
  let azkenX = -Infinity;  // años: uno por año, y sin pisarse (diciembre de 2015 y junio de 2016 quedan muy cerca)
  for (const k of ks) {
    const x = xs(k); if (x - azkenX < 26 || ks.find((y) => y.slice(0, 4) === k.slice(0, 4)) !== k) continue;
    s += `<text class="bil-ax" x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${k.slice(0, 4)}</text>`; azkenX = x;
  }
  if (ks.includes(state.k)) s += `<line class="bil-unea" x1="${xs(state.k)}" x2="${xs(state.k)}" y1="${MT}" y2="${H - MB}"/>`;
  for (const l of lerroak) {
    const tramoak = [[]];
    for (const k of ks) { if (l.b[k] == null) tramoak.push([]); else tramoak.at(-1).push(k); }
    for (const t of tramoak) if (t.length > 1) s += `<polyline class="bil-l" stroke="${l.kolorea}" points="${t.map((k) => `${xs(k).toFixed(1)},${ys(l.b[k]).toFixed(1)}`).join(" ")}"/>`;
    for (const k of ks) if (l.b[k] != null) s += `<circle class="bil-p" cx="${xs(k).toFixed(1)}" cy="${ys(l.b[k]).toFixed(1)}" r="3.2" fill="${l.kolorea}"><title>${esc(l.izena)} · ${INFO[k].izena}: ${pct(l.b[k])}</title></circle>`;
  }
  return `<svg class="bil-graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.bilGrafikoa}">${s}</svg>`;
}
// La pestaña: gráfico, cada línea con su % en la elección del mapa y la variación, y la tabla elección a elección
function bilakaeraOrria(h) {
  const [maila, id] = h ? [h.maila, h.id] : ["estatua", "ES"];
  const buru = buruak(h ? esc(izena(maila, id)) : T.estado, `${T.bilakaera} · ${T.congreso} ${INFO[KK[0]].urtea}–${INFO[KK.at(-1)].urtea}`, !!h);
  if (maila === "sekzioa") return buru + `<p class="hint">${T.bilSekzioa}</p>${joateko("udalerria", sekUdalerria(id))}`;
  const d = BILAKAERA[bilFitxategia(maila, id)];
  if (!d || d instanceof Promise) {
    bilakaeraDatuak(maila, id).then(() => { if (state.fitxa === "bilakaera") panela(); },
      () => { const p = $("#edukia .hint"); if (state.fitxa === "bilakaera" && p) p.textContent = T.error; });
    return buru + `<p class="hint">${T.cargando}</p>`;
  }
  const hist = d.r[id]; if (!hist) return buru + `<p class="hint">${T.sinDatos}</p>`;
  const ks = KK.filter((k) => hist[k]), lerroak = bilLerroak(d, hist, ks);
  const k = ks.includes(state.k) ? state.k : ks.at(-1), ak = ks[ks.indexOf(k) - 1];
  const legenda = lerroak.slice().sort((a, b) => (b.b[k] ?? -1) - (a.b[k] ?? -1)).map((l) => `<div class="bil-leg">${sq(l.kolorea)}<span class="nm">${esc(l.izena)}</span>` +
    `<span class="num">${pct(l.b[k])}</span><span>${aldaketa(ak && l.b[k] != null && l.b[ak] != null ? l.b[k] - l.b[ak] : null, { puntuak: true })}</span></div>`).join("");
  // tabla: primera fuerza (o bloque con más votos), participación y, de la provincia para arriba, escaños
  const blokeak = state.modua === "blokeak", eser = !eserlekurikEz(maila);
  const errenkada = (kk) => {
    const [part, inb, esk, alderdiak, eserlekuak] = hist[kk];
    const eserBloke = (x) => eserlekuak.reduce((n, [i, m]) => n + (d.b[i] === x ? m : 0), 0);
    let lehena, eserTxt = "–";
    if (blokeak) {
      const x = inb >= esk ? "INB" : "ESK";
      lehena = `${sq(BLOKE_KOLOREA[x])} ${T.blokeLabur[x]} <small>${pct(Math.max(inb, esk))}</small>`;
      if (eserlekuak.length) eserTxt = `${sq(BLOKE_KOLOREA.INB)} ${eserBloke("INB")} ${sq(BLOKE_KOLOREA.ESK)} ${eserBloke("ESK")}`;
    } else {
      const [i, p] = alderdiak[0] || [];
      lehena = i == null ? "–" : `${sq(d.k[i])} ${esc(d.s[i])} <small>${pct(p)}</small>`;
      const n = eserlekuak.reduce((s, [, m]) => s + m, 0), irabazlea = eserlekuak.find(([j]) => j === i);
      if (n) eserTxt = `${irabazlea ? irabazlea[1] : 0} / ${n}`;
    }
    const act = kk === k ? ' class="act"' : "";
    return `<span${act}>${INFO[kk].izena}</span><span${act}>${lehena}</span><span class="num${kk === k ? " act" : ""}">${pct(part)}</span>` +
      (eser ? `<span class="num${kk === k ? " act" : ""}">${eserTxt}</span>` : "");
  };
  const taula = `<div class="bil-taula${eser ? " eser" : ""}"><span class="h">${T.hauteskundea}</span><span class="h">${blokeak ? T.blokeak : T.primera}</span>` +
    `<span class="h num">${T.part}</span>${eser ? `<span class="h num">${T.escanos}</span>` : ""}` +
    ks.slice().reverse().map(errenkada).join("") + "</div>";
  return buru + `<div class="lbl">${T.bilEhunekoa}</div>${bilGrafikoa(ks, lerroak)}` +
    `<div class="lbl">${INFO[k].izena}${ak ? ` · ▲▼ ${T.respectoA} ${INFO[ak].izena}` : ""}</div>${legenda}<div class="lbl">${T.bilHauteskundez}</div>${taula}`;
}

// ---- controles ----
// Elección: la línea de tiempo, Q/E y ▶ pasan por aquí
async function hauteskundeaAldatu(k) {
  if (!KK.includes(k)) return;
  state.k = k; lerroaMargotu();
  await eguneratu(); panela();
}
// Capa del mapa (W, M, T)
function moduaAldatu(m) {
  state.modua = m; document.querySelectorAll("[data-modua]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.modua === m));
  $("#maila").disabled = BARRUTIKA.includes(m);  // con «Escaños reñidos», provincias
  legenda(); eguneratu(); panela();
}
document.querySelectorAll("[data-modua]").forEach((b) => b.addEventListener("click", () => moduaAldatu(b.dataset.modua)));
$("#maila").addEventListener("change", (e) => { state.maila = e.target.value; eguneratu(); });
// Leyenda de la capa (y, con «Bloques», del nivel que se ve: último escaño en provincias, votos en el resto)
function legenda() {
  if (state.modua === "blokeak") {  // filas: tramos; columnas: el bloque (provincias: último escaño; resto: más votos)
    const f = fmtZutabea, barrutia = mailaAktiboa() === "probintzia";
    const tarteak = barrutia ? [`≤ ${f(5000)}`, `${f(5000)} – ${f(10000)}`, `${f(10000)} – ${f(20000)}`, `> ${f(20000)}`]
      : [`≤ 5 ${T.puntos}`, "5 – 10", "10 – 20", "> 20"];
    $("#legenda").innerHTML = `<div class="lbl">${barrutia ? T.blokeLeg : T.blokeBotoLeg}</div><div class="legend-azp">${barrutia ? T.blokeLegAzp : T.blokeBotoLegAzp}</div>
      <div class="bloke-leg"><span></span><span class="h">${T.blokeLabur.INB}</span><span class="h">${T.blokeLabur.ESK}</span>
      ${tarteak.map((t, i) => `<span>${t}</span><i style="background:${BLOKE_KOLOREAK.INB[i]}"></i><i style="background:${BLOKE_KOLOREAK.ESK[i]}"></i>`).join("")}</div>
      <div class="legend"><div class="li">${sq(BLOKE_KOLOREAK[""][0])}${T.blokeIzenak[""]}</div><div class="li">${sq(NODATA)}${T.sinDatos}</div></div>`;
    return;
  }
  if (state.modua === "irabazlea") {
    const g = [...(irabazleakMailaka[mailaAktiboa()] || new Map()).values()].sort((a, b) => b.n - a.n).slice(0, 9);
    const izen = (x) => [...x.izenak].sort((a, b) => b[1] - a[1])[0][0];
    $("#legenda").innerHTML = `<div class="lbl">${T.irabazleaLeg}</div><div class="legend">${g.map((x) => `<div class="li">${sq(x.kol)}${esc(izen(x))} <span class="zk">${fmt(x.n)}</span></div>`).join("")}</div>`;
    return;
  }
  const [bins, izen, lab] = state.modua === "part"
    ? [PART_BINS, T.partLeg, ["≤ 58 %", "58 – 64 %", "64 – 70 %", "70 – 76 %", "> 76 %"]]
    : [LEHIA_BINS, T.lehiaLeg, [`≤ ${fmtZutabea(1000)} ${T.botoak}`, ...[[1000, 5000], [5000, 10000], [10000, 20000]].map(([a, b]) => `${fmtZutabea(a)} – ${fmtZutabea(b)}`), `> ${fmtZutabea(20000)}`]];
  $("#legenda").innerHTML = `<div class="lbl">${izen}</div>${state.modua === "lehia" ? `<div class="legend-azp">${T.barrutika}</div>` : ""}<div class="legend">${bins.map(([, c], i) => `<div class="li">${sq(c)}${lab[i]}</div>`).join("")}<div class="li">${sq(NODATA)}${T.sinDatos}</div></div>`;
}
// Buscador de municipios (nombres en la lengua local)
const udalak = Object.entries(IZENAK.udalerria).sort((a, b) => a[1][0].localeCompare(b[1][0], LOKALEA));
$("#udalerriak").innerHTML = udalak.map(([, [n]]) => `<option value="${esc(n)}"></option>`).join("");
$("#bilatu").addEventListener("change", (e) => {
  const v = e.target.value.trim().toLowerCase(); if (!v) return;
  const u = udalak.find(([, [n]]) => n.toLowerCase() === v) || udalak.find(([, [n]]) => n.toLowerCase().includes(v));
  if (u) { map.once("moveend", () => hautatu({ maila: "udalerria", id: u[0] })); map.flyTo({ center: [u[1][1], u[1][2]], zoom: 10.2 }); }
});
// Vista: Península (0) o Canarias (C), en el hueco que dejan los paneles
const ikusi = (b) => map.fitBounds(b, { padding: pad() });
$("#penintsula").addEventListener("click", () => ikusi(PENINSULA));
$("#kanariak").addEventListener("click", () => ikusi(KANARIAK));
// Satélite (S): encender / apagar (con él, los colores dejan ver el terreno)
function sateliteaAldatu() {
  state.satelitea = !state.satelitea; $("#satelitea").setAttribute("aria-pressed", state.satelitea);
  map.setLayoutProperty("sat", "visibility", state.satelitea ? "visible" : "none");
  map.setLayoutProperty("lurra", "visibility", state.satelitea ? "none" : "visible");  // comunales: se ve el terreno
  for (const m of MAILAK) map.setPaintProperty(m + "-fill", "fill-opacity", opakutasuna());
  urlaIdatzi();
}
$("#satelitea").setAttribute("aria-pressed", state.satelitea);
$("#satelitea").addEventListener("click", sateliteaAldatu);
// Móvil: hoja de resultados que se despliega
function orriaZabaldu(z) {
  if (!mugikorra()) return;
  $("#panela").classList.toggle("zabalik", z); $("#heldulekua").setAttribute("aria-expanded", z);
  if (z && $("#app").classList.contains("rail-zabalik")) { $("#app").classList.remove("rail-zabalik"); geziaEguneratu(); }  // una cosa abierta a la vez
  setTimeout(etiketak, 260);
}
$("#heldulekua").addEventListener("click", () => orriaZabaldu(!$("#panela").classList.contains("zabalik")));

// ---- herramientas de la izquierda: la flecha (o L) las esconde y las saca; en el móvil se abren encima del mapa ----
function geziaEguneratu() {
  const ikusgai = mugikorra() ? $("#app").classList.contains("rail-zabalik") : !$("#app").classList.contains("menurik-ez");
  const b = $("#railbtn"); b.setAttribute("aria-expanded", ikusgai); b.querySelector("span").textContent = ikusgai ? "‹" : "›";
  b.setAttribute("aria-label", ikusgai ? T.tresnakEzkutatu : T.tresnakErakutsi);
}
function railAldatu() {
  if (mugikorra()) { if ($("#app").classList.toggle("rail-zabalik")) orriaZabaldu(false); }
  else {
    const ez = $("#app").classList.toggle("menurik-ez");
    try { localStorage.setItem("on-menua", ez ? "ez" : "bai"); } catch { /* sin almacenamiento */ }
  }
  geziaEguneratu(); setTimeout(etiketak, 260);  // los nombres ocupan el hueco que queda libre
}
$("#railbtn").addEventListener("click", railAldatu);
$("#rail").addEventListener("click", (e) => {  // móvil: al elegir capa o vista, las herramientas se cierran
  if (mugikorra() && e.target.closest(".mode")) { $("#app").classList.remove("rail-zabalik"); geziaEguneratu(); }
});
addEventListener("resize", () => { geziaEguneratu(); lerroaMargotu(); });
geziaEguneratu();

// ---- línea de tiempo (abajo): cada elección en su fecha; ▶ las recorre una a una; «Última» vuelve a la más reciente ----
const PLAY_MS = 1800;  // tiempo en cada elección al reproducir
const dataZ = (k) => +k.slice(0, 4) + (+k.slice(4) - 1) / 12;  // 202307 → 2023,5
const DL0 = Math.floor(dataZ(KK[0])), DL1 = Math.floor(dataZ(KK.at(-1))) + 1;
const pista = $("#denboralerroa .dl-pista");
// Escala de la pista: proporcional al tiempo, pero con al menos DL_TARTEA px entre dos elecciones seguidas, para poder
// tocarlas con el dedo (en el móvil, diciembre de 2015 y junio de 2016 quedarían a 7 px). Tramos rectos entre fechas.
const DL_TARTEA = 28;
let dlT = [], dlP = [];  // fechas (en años) y su posición en la pista (0–1): los extremos y cada elección
function dlEskala() {
  const w = pista.clientWidth || 600;
  dlT = [DL0, ...KK.map(dataZ), DL1];
  let g = dlT.slice(1).map((t, i) => t - dlT[i]);  // tramos, en años; el primero y el último van a los extremos
  if (w < (KK.length + 1) * DL_TARTEA) g = g.map((_, i) => (i === 0 || i === g.length - 1 ? 0.5 : 1));  // sin sitio: iguales
  const finkoak = new Set(), artean = (i) => i > 0 && i < g.length - 1;  // tramos entre dos elecciones
  for (let berriak = true; berriak;) {  // los tramos cortos se quedan en DL_TARTEA; el resto, proporcional en lo que sobra
    const libre = g.reduce((s, x, i) => s + (finkoak.has(i) ? 0 : x), 0), px = (w - finkoak.size * DL_TARTEA) / libre;
    berriak = false;
    g.forEach((x, i) => { if (!finkoak.has(i) && artean(i) && x * px < DL_TARTEA) { finkoak.add(i); berriak = true; } });
    if (!berriak) g = g.map((x, i) => (finkoak.has(i) ? DL_TARTEA : x * px) / w);
  }
  dlP = [0]; for (const x of g) dlP.push(dlP.at(-1) + x);
}
function dlKoka(t, nondik = dlT, nora = dlP) {  // fecha → posición (0–1); con los argumentos al revés, posición → fecha
  let i = 1; while (i < nondik.length - 1 && t > nondik[i]) i++;
  return nora[i - 1] + (nora[i] - nora[i - 1]) * (t - nondik[i - 1]) / (nondik[i] - nondik[i - 1] || 1);
}
const dlX = (t) => `${(dlKoka(t) * 100).toFixed(2)}%`;
let playT = null;  // ▶ en marcha: temporizador hasta la siguiente elección
function lerroaMargotu() {
  dlEskala();
  // los años con etiqueta, de izquierda a derecha, con al menos 34 px entre etiquetas («2011» ocupa unos 26)
  const w = pista.clientWidth || 600;
  let urteak = "", azkena = -Infinity;
  for (let y = DL0; y <= DL1; y++) {
    const x = dlKoka(y) * w, ikusi = y < DL1 && x - azkena >= 34;
    if (ikusi) azkena = x;
    urteak += `<span class="dl-urtea" style="left:${dlX(y)}">${ikusi ? y : ""}</span>`;
  }
  const x = dlX(dataZ(state.k));
  pista.innerHTML = `<span class="dl-ardatza"></span>${urteak}` +
    INDEX.hauteskundeak.map((h) => `<button type="button" class="dl-puntua${h.k === state.k ? " act" : ""}" style="left:${dlX(dataZ(h.k))}" data-k="${h.k}"
      title="${h.izena}" aria-label="${h.izena}" aria-pressed="${h.k === state.k}"></button>`).join("") +
    `<span class="dl-kurtsorea" style="left:${x}"></span><span class="dl-heldulekua" role="slider" tabindex="0" style="left:${x}" aria-label="${T.dataAukeratu}"
      aria-valuemin="1" aria-valuemax="${KK.length}" aria-valuenow="${KK.indexOf(state.k) + 1}" aria-valuetext="${INFO[state.k].izena}"></span>`;
  $("#denboralerroa .dl-data").textContent = INFO[state.k].izena;
  $("#dlplay").textContent = playT ? "❚❚" : "▶"; $("#dlplay").setAttribute("aria-label", playT ? T.gelditu : T.erreproduzitu);
}
// Arrastrar el triángulo: mientras se mueve, se ve qué elección queda más cerca; al soltar, cambia el mapa
const hurbilena = (t) => KK.reduce((a, k) => (Math.abs(dataZ(k) - t) < Math.abs(dataZ(a) - t) ? k : a));
function puntuanDago(e) { const r = pista.getBoundingClientRect(); return dlKoka(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), dlP, dlT); }
function aurreikusi(t) {
  const k = hurbilena(t);
  pista.querySelector(".dl-kurtsorea").style.left = pista.querySelector(".dl-heldulekua").style.left = dlX(t);
  $("#denboralerroa .dl-data").textContent = INFO[k].izena;
  pista.querySelectorAll(".dl-puntua").forEach((b) => b.classList.toggle("act", b.dataset.k === k));
}
let arrastaka = false;
pista.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".dl-puntua")) return;  // las elecciones se eligen con un clic
  arrastaka = true; playGelditu(); pista.setPointerCapture(e.pointerId); aurreikusi(puntuanDago(e)); e.preventDefault();
});
pista.addEventListener("pointermove", (e) => { if (arrastaka) aurreikusi(puntuanDago(e)); });
pista.addEventListener("pointerup", (e) => { if (!arrastaka) return; arrastaka = false; hauteskundeaAldatu(hurbilena(puntuanDago(e))); });
pista.addEventListener("pointercancel", () => { arrastaka = false; lerroaMargotu(); });
pista.addEventListener("click", (e) => { const b = e.target.closest(".dl-puntua"); if (b) { playGelditu(); hauteskundeaAldatu(b.dataset.k); } });
pista.addEventListener("keydown", (e) => {  // en el triángulo: ← → elección anterior / siguiente; Inicio / Fin
  if (!e.target.classList.contains("dl-heldulekua") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault(); playGelditu();
  const i = KK.indexOf(state.k), j = e.key === "Home" ? 0 : e.key === "End" ? KK.length - 1 : i + (e.key === "ArrowLeft" ? -1 : 1);
  hauteskundeaAldatu(KK[Math.max(0, Math.min(KK.length - 1, j))]).then(() => pista.querySelector(".dl-heldulekua").focus());
});
function playGelditu() { clearTimeout(playT); playT = null; lerroaMargotu(); }
async function playUrratsa() {
  const i = KK.indexOf(state.k);
  if (i >= KK.length - 1) { playGelditu(); return; }
  aurretik(prestatu(KK[Math.min(KK.length - 1, i + 2)]));  // la siguiente, cargando ya
  await hauteskundeaAldatu(KK[i + 1]);
  if (playT) playT = setTimeout(playUrratsa, PLAY_MS);
}
$("#dlplay").addEventListener("click", async () => {
  if (playT) { playGelditu(); return; }
  playT = -1;  // en marcha; desde la última, se vuelve a empezar por la primera
  if (state.k === KK.at(-1)) await hauteskundeaAldatu(KK[0]); else lerroaMargotu();
  aurretik(prestatu(KK[Math.min(KK.length - 1, KK.indexOf(state.k) + 1)]));
  if (playT) playT = setTimeout(playUrratsa, PLAY_MS);
});
$("#denboralerroa .dl-azkena").addEventListener("click", () => { playGelditu(); hauteskundeaAldatu(KK.at(-1)); });

// ---- ayuda (?) y teclado, como en el Behatokia ----
function laguntza(ireki) {
  $("#laguntza").hidden = !ireki; $("#laguntzabtn").setAttribute("aria-expanded", ireki);
  if (ireki) $("#laguntzaItxi").focus();
}
$("#laguntzabtn").addEventListener("click", () => laguntza($("#laguntza").hidden));
$("#laguntzaItxi").addEventListener("click", () => laguntza(false));
const LASTERBIDEAK = {
  q: () => { playGelditu(); hauteskundeaAldatu(KK[Math.max(0, KK.indexOf(state.k) - 1)]); },
  e: () => { playGelditu(); hauteskundeaAldatu(KK[Math.min(KK.length - 1, KK.indexOf(state.k) + 1)]); },
  p: () => $("#dlplay").click(),
  w: () => moduaAldatu("irabazlea"), m: () => moduaAldatu("lehia"), t: () => moduaAldatu("part"), b: () => moduaAldatu("blokeak"),
  k: () => fitxaAldatu({ emaitzak: "eserlekuak", eserlekuak: "bilakaera", bilakaera: "emaitzak" }[state.fitxa]),
  s: sateliteaAldatu, l: railAldatu, 0: () => ikusi(PENINSULA), c: () => ikusi(KANARIAK),
  "/": () => {
    if (mugikorra() ? !$("#app").classList.contains("rail-zabalik") : $("#app").classList.contains("menurik-ez")) railAldatu();
    $("#bilatu").focus();
  },
  "?": () => laguntza($("#laguntza").hidden),
  Escape: () => {
    const irekiak = document.querySelectorAll("details[open]");
    if (!$("#laguntza").hidden) laguntza(false); else if (irekiak.length) irekiak.forEach((d) => { d.open = false; }); else if (state.hautatua) hautatu(null);
  },
};
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key !== "Escape" && e.target.closest && e.target.closest("input, select, textarea")) return;
  const f = LASTERBIDEAK[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (!f) return;
  e.preventDefault(); f();
});

// ---- arranque ----
document.querySelectorAll("[data-modua]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.modua === state.modua));  // puede venir del enlace
$("#maila").disabled = BARRUTIKA.includes(state.modua);
legenda(); lerroaMargotu();
async function hasi() {
  await eguneratu();
  if (state.hautatua) hautatu(state.hautatua); else panela();
}
if (estiloaPrest) hasi(); else map.once("style.load", hasi);
map.on("moveend", eguneratu);
let etiketaZain = false;  // mientras el mapa se mueve, los nombres se rehacen una vez por fotograma
map.on("move", () => { if (!etiketaZain) { etiketaZain = true; requestAnimationFrame(() => { etiketaZain = false; etiketak(); }); } });
