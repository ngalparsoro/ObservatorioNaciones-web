// Observatorio Electoral de las Naciones · mapa de las elecciones al Congreso (2011-2023) y autonómicas (2008-2026), leídas
// por naciones. Módulo ES sin compilación (lo carga index.html). Datos: data/<k>/<nivel>.json (scripts/prozesatu.py),
// data/autonomikoak/ (scripts/autonomikoak_web.py) y geometría
// geo/ (scripts/geo.py); municipios y secciones se cargan por provincia, solo las que se ven. Textos en testuak.js.
// Disposición del Hauteskunde Behatokia: herramientas a la izquierda, línea de tiempo (con el buscador de elecciones)
// abajo y panel a la derecha.
//
// Capas (state.modua): irabazlea (ganador) · lehia (escaños reñidos: último escaño, por circunscripción) · part
// (participación) · blokeak (investidura / derecha: último escaño en provincias, votos en el resto) · tamaina
// (circunscripciones por tamaño). Pestañas del panel (state.fitxa): emaitzak (resultados), eserlekuak (escaños: solo
// provincia y niveles superiores) y bilakaera (evolución); el puntero sigue a la pestaña. Las autonómicas, en la línea de
// tiempo, con el estado de las autonomías en cada momento (cada comunidad con su elección vigente) o, elegidas en el
// buscador, solo las elecciones de un día o la de una comunidad (el resto del mapa, vacío); sin Estado ni naciones, sin
// bloques ni tamaño de circunscripción, y con los escaños y los escaños reñidos por comunidad (cada parlamento es de una
// comunidad; el último escaño, el de su circunscripción más reñida).
//
// Secciones, en orden: utilidades · idioma y plantilla · constantes de color y niveles · carga de datos · estado y
// enlace · acceso a los datos (votos, escaños, bloques, último escaño) · nombres · mapa · color de cada zona · etiquetas
// · puntero · panel · evolución · controles · herramientas · línea de tiempo y buscador de elecciones · ayuda y teclado
// · arranque.
import * as maplibregl from "./vendor/maplibre-gl.mjs";
// GitHub Pages no manda cabeceras: si alguien mete la web en un marco de otro sitio (clickjacking), se sale de él
if (window.top !== window.self) window.top.location = window.location;

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
// «Circunscripciones»: las provincias por los escaños que eligen en cada elección (prozesatu.py: pequeñas 1-5, medianas 6-9,
// grandes 10 o más). Un solo tono, de menos a más luz sobre el fondo oscuro (no dorado: es el color de las fronteras)
const TAMAINAK = ["txikiak", "ertainak", "handiak"];
const TAMAINA_KOLOREA = { txikiak: "#00818F", ertainak: "#00B8B0", handiak: "#7DF0D8" };
const ARGIBIDE_MARJINA = 10;  // en el puntero (Resultados), solo quien está a 10 puntos o menos de la primera fuerza
const MAILAK = ["nazioa", "autonomia", "probintzia", "udalerria", "sekzioa"];
const ZOOMAK = { nazioa: [0, 5.9], autonomia: [5.9, 6.8], probintzia: [6.8, 8], udalerria: [8, 10.8], sekzioa: [10.8, 24] };
// Imagen de fondo, gratuita y sin clave, como en el Hauteskunde Behatokia: Sentinel-2 cloudless 2024 (EOX, 10 m, CC BY-NC-SA
// 4.0) para todo el mapa y, al acercar (desde el nivel de municipio), las ortofotos del PNOA (IGN, 25-50 cm, CC BY 4.0),
// recortadas a España (geo/maskara.json), porque fuera devuelven relleno blanco. Créditos: los que pide cada licencia
// (el IGN: «CC BY 4.0 scne.es», la fórmula de su servicio; en Melilla su imagen es de Airbus y lo dice el servicio).
const SATELITEA = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg";
const SAT_KREDITUA = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2024</a> (EOX, Copernicus, CC BY-NC-SA)';
const PNOA = "https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&VERSION=1.0.0&Layer=OI.OrthoimageCoverage&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}";
const PNOA_KREDITUA = '<a href="https://pnoa.ign.es" target="_blank" rel="noopener">PNOA máxima actualidad</a> (IGN) CC BY 4.0 ' +
  '<a href="https://www.scne.es" target="_blank" rel="noopener">scne.es</a> · Melilla: Pléiades Neo © Airbus DS (2022)';
const ORTO_ZOOM = 10;  // desde el nivel de municipio
const PENINSULA = [[-9.6, 35.9], [4.5, 43.9]], KANARIAK = [[-18.3, 27.5], [-13.3, 29.5]];
const bin = (v, bins) => { if (v == null || isNaN(v)) return NODATA; for (const [l, c] of bins) if (v <= l) return c; return NODATA; };

// ---- carga de datos (con la huella de la versión: ver arriba) ----
const load = async (u) => {
  const r = await fetch(huellaz(u), BERTSIOA_DU ? { cache: "force-cache" } : {});
  if (!r.ok) throw new Error(u); return r.json();
};
let INDEX, AUT, IZENAK, GEO_NAZ, GEO_AUT, GEO_PROB;
try {
  [INDEX, AUT, IZENAK, GEO_NAZ, GEO_AUT, GEO_PROB] = await Promise.all(["data/index.json", "data/autonomikoak/index.json", "geo/izenak.json", "geo/nazioa.json", "geo/autonomia.json", "geo/probintzia.json"].map(load));
} catch (e) { $("#kargatzen").textContent = T.error; throw e; }
// Los nombres de los 8.100 municipios (geo/udal_izenak.json, 330 KB) no hacen falta para el primer pintado: se piden al
// acercarse, al buscar o al elegir un municipio (una sola vez), y hasta entonces no hay ninguno
IZENAK.udalerria = {};
let udalIzenakZain = null;
const udalIzenakLortu = () => (udalIzenakZain ??= load("geo/udal_izenak.json").then((u) => { IZENAK.udalerria = u; bilatzaileaBete(); etiketak(); })
  .catch((e) => { udalIzenakZain = null; throw e; }));
// Dos tipos de elección (state.mota). El Congreso (k = AAAAMM), en su línea de tiempo. Las autonómicas
// (scripts/autonomikoak_web.py), de dos maneras: en la línea de tiempo, el estado de las autonomías en cada momento
// (k = «a» + AAAAMM: cada día en que vota alguna comunidad desde mayo de 2011, con la elección vigente de cada una,
// INFO[k].osagaiak, y ● las que votan ese día, INFO[k].berriak); y, elegidas en el buscador, solo las elecciones de un día
// (k = «e» + AAAAMM) o la de una comunidad (k = «e» + AAAAMM + «.» + comunidad). Sin datos publicados: INFO[k].hutsik.
// Cada elección es un fichero (data/autonomikoak/hauteskundea/<cca>-<AAAAMM>.json): la web junta los de cada vista.
const AUT_BAT = AUT.egunak.flatMap((h) => Object.entries(h.osagaiak).map(([cca, hk]) => ({ k: `e${hk}.${cca}`, urtea: h.urtea, hila: h.hila, osagaiak: { [cca]: hk } })));
const AUT_HK = {};  // comunidad → sus elecciones (AAAAMM), en orden
for (const h of AUT.egunak) for (const [cca, hk] of Object.entries(h.osagaiak)) (AUT_HK[cca] ??= []).push(hk);
// las fechas de antes de mayo de 2011 (Andalucía 2008, Galicia y País Vasco 2009, Cataluña 2010), con la clave de la
// evolución («a» + AAAAMM, como las demás): están en el buscador, pero no en la línea de tiempo
const AUT_AURREKOAK = AUT.egunak.filter((h) => !AUT.datak.some((x) => x.k === `a${h.k.slice(1)}`)).map((h) => ({ k: `a${h.k.slice(1)}`, urtea: h.urtea, hila: h.hila }));
const HAUTESKUNDE_GUZTIAK = [...INDEX.hauteskundeak, ...AUT.datak, ...AUT.egunak, ...AUT_BAT, ...AUT_AURREKOAK];
for (const h of HAUTESKUNDE_GUZTIAK) h.izena = `${T.hilak[+h.hila - 1]} ${h.urtea}`;  // «jul 2023», en el idioma elegido
IZENAK.nazioa.RE[0] = T.restoEstado;  // el único nombre de nación que no es propio
const INFO = Object.fromEntries(HAUTESKUNDE_GUZTIAK.map((h) => [h.k, h]));
const MOTAK = { kongresua: INDEX.hauteskundeak.map((h) => h.k), autonomikoak: AUT.datak.map((h) => h.k) };  // las de la línea de tiempo
// Fechas: dataZ en años (julio de 2023 → 2023,5) y hilZ en meses (2023 · 12 + 6), la unidad de la línea de tiempo
const dataZ = (k) => +INFO[k].urtea + (+INFO[k].hila - 1) / 12;
const hilZ = (k) => +INFO[k].urtea * 12 + +INFO[k].hila - 1;
const GAUR = (() => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); })();  // este mes
const hilKodea = (m) => `${Math.floor(m / 12)}${String(m % 12 + 1).padStart(2, "0")}`;  // meses → AAAAMM (enlace)
const kodeHil = (s) => (/^\d{6}$/.test(s || "") ? +s.slice(0, 4) * 12 + +s.slice(4) - 1 : null);
const hilIzena = (m) => `${T.hilak[m % 12]} ${Math.floor(m / 12)}`;  // «feb 2014»
// ¿Se puede ver k con este tipo de elección? (autonómicas: la línea de tiempo y lo que se elige en el buscador)
const ikusgarria = (k, mota) => (mota === "autonomikoak" ? !!(INFO[k] && INFO[k].osagaiak) : MOTAK.kongresua.includes(k));
// ¿Autonómicas? (la línea de tiempo, «a…», o lo elegido en el buscador, «e…»: un día o una comunidad)
const autKoa = (k) => /^[ae]/.test(k);
const hautaketa = (k) => k.startsWith("e");
// Lo que tiene cada tipo: las autonómicas, sin bloques (son los del Congreso) ni circunscripciones por tamaño (cada
// parlamento reparte a su manera)
const MODUAK = { kongresua: ["irabazlea", "lehia", "part", "blokeak", "tamaina"], autonomikoak: ["irabazlea", "lehia", "part"] };
const FITXAK = { kongresua: ["emaitzak", "eserlekuak", "bilakaera"], autonomikoak: ["emaitzak", "eserlekuak", "bilakaera"] };
const GOIK = INDEX.goikoak;  // provincia → comunidad, comunidad → nación
const autonomikoak = () => state.mota === "autonomikoak";
// La comunidad de una zona (para saber si vota en una fecha de las autonómicas); null en el Estado, una nación o un tamaño
function autCca(maila, id) {
  if (maila === "autonomia") return id;
  if (["probintzia", "udalerria", "sekzioa"].includes(maila)) return GOIK.probintzia[id.slice(0, 2)] || null;
  return null;
}
const sekUdalerria = (sek) => INDEX.batuak[sek.slice(0, 5)] || sek.slice(0, 5);  // municipio (de hoy) de una sección

// ---- estado (y enlace compartible: #k=202307&m=lehia&s=udalerria:20069&p=lng,lat,zoom; autonómicas: h=a&k=a202305, y
// lo elegido en el buscador: k=e202305, k=e202305.13; el mes de la línea de tiempo, si no es el de la elección: t=AAAAMM) ----
const URL0 = new URLSearchParams(location.hash.slice(1));
const MOTA0 = URL0.get("h") === "a" ? "autonomikoak" : "kongresua";
let KK = MOTAK[MOTA0];  // las de la línea de tiempo: las del tipo elegido
// La línea de tiempo va de la primera elección a hoy (o a la última, si es posterior), mes a mes; en el mes m se ve la última
// elección hasta entonces (la primera, si m es anterior)
const DLM0 = () => hilZ(KK[0]), DLM1 = () => Math.max(hilZ(KK.at(-1)), GAUR);
const muga = (m) => Math.min(Math.max(m, DLM0()), DLM1());
const indarrean = (m) => KK.filter((k) => hilZ(k) <= m).at(-1) || KK[0];
const state = {
  mota: MOTA0,
  k: ikusgarria(URL0.get("k"), MOTA0) ? URL0.get("k") : KK[KK.length - 1],
  modua: MODUAK[MOTA0].includes(URL0.get("m")) ? URL0.get("m") : "irabazlea",
  fitxa: FITXAK[MOTA0].includes(URL0.get("f")) ? URL0.get("f") : "emaitzak",  // pestaña del panel
  satelitea: URL0.get("sat") !== "0",
  maila: "auto",
  hautatua: null,  // {maila, id}
  une: null,  // el mes de la línea de tiempo (con lo elegido en el buscador, el de su elección)
};
{ const t = kodeHil(URL0.get("t")); if (t != null && !hautaketa(state.k)) { state.une = muga(t); state.k = indarrean(state.une); } else state.une = hilZ(state.k); }
if (URL0.get("s")) {  // (las autonómicas no tienen naciones ni tamaños)
  const [m, id] = URL0.get("s").split(":");
  const ondo = MOTA0 === "autonomikoak" ? MAILAK.includes(m) && m !== "nazioa" : MAILAK.includes(m) || (m === "tamaina" && TAMAINAK.includes(id));
  if (ondo && id) state.hautatua = { maila: m, id };
}
function urlaIdatzi() {
  const q = new URLSearchParams({ k: state.k, m: state.modua });
  if (!hautaketa(state.k) && state.une !== hilZ(state.k)) q.set("t", hilKodea(state.une));
  if (autonomikoak()) q.set("h", "a");
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
  // dos ficheros: orokorra.json (Estado, naciones, comunidades, provincias, tamaños y escaños) y udalerria.json
  if (!DATA[k]) DATA[k] = (autKoa(k) ? autDatuak(k) : Promise.all(["orokorra", "udalerria"].map((m) => load(`data/${k}/${m}.json`)))
    .then(([orokorra, udalerria]) => ({ ...orokorra, udalerria, sek: {} })))
    .catch((e) => { delete DATA[k]; throw e; });
  return DATA[k];
}
// Autonómicas: la vista k junta las elecciones que enseña (las vigentes en ese momento o las elegidas en el buscador):
// comunidad, provincias y escaños de cada una (data/autonomikoak/hauteskundea/<cca>-<AAAAMM>.json) y sus municipios
// (udalerria/<cca>-<AAAAMM>.json). Cada fichero se pide una vez y sirve para todas las vistas. Sin Estado, naciones ni
// circunscripciones por tamaño.
const AUT_UDAL = {}, AUT_HAUT = {};
const autUdalerriak = (g) => (AUT_UDAL[g] ??= load(`data/autonomikoak/udalerria/${g}.json`).catch((e) => { delete AUT_UDAL[g]; throw e; }));
const autHauteskundeFitx = (g) => (AUT_HAUT[g] ??= load(`data/autonomikoak/hauteskundea/${g}.json`).catch((e) => { delete AUT_HAUT[g]; throw e; }));
async function autDatuak(k) {
  const gakoak = Object.entries(INFO[k].osagaiak).map(([cca, hk]) => `${cca}-${hk}`);
  const [fitxak, udalak] = await Promise.all([Promise.all(gakoak.map(autHauteskundeFitx)), Promise.all(gakoak.map(autUdalerriak))]);
  return { ...autBatu(gakoak, fitxak), udalerria: taulakBatu(udalak), sek: {} };
}
// Las elecciones de una vista en las tablas de siempre: comunidades, provincias y escaños ({autonomia, azkena, barrutiak},
// por comunidad). Cada fichero trae sus candidaturas: los índices se rehacen
function autBatu(gakoak, fitxak) {
  const s = [], k = [], f = [], idx = new Map();
  const autonomia = { s, k, f, r: {}, cera: {} }, probintzia = { s, k, f, r: {}, cera: {} }, eserlekuak = { s, k, f, autonomia: {}, azkena: {}, barrutiak: {} };
  fitxak.forEach((t, n) => {
    const cca = gakoak[n].slice(0, 2);
    const b = t.s.map((sig, i) => {
      const g = `${sig}\u0000${t.k[i]}\u0000${t.f[i]}`;
      if (!idx.has(g)) { idx.set(g, s.length); s.push(sig); k.push(t.k[i]); f.push(t.f[i]); }
      return idx.get(g);
    });
    const zona = ([censo, votantes, vc, lista]) => [censo, votantes, vc, lista.map(([i, v]) => [b[i], v])];
    const eser = (lista) => lista.map(([i, m]) => [b[i], m]);
    autonomia.r[cca] = zona(t.autonomia);
    for (const [p, x] of Object.entries(t.probintzia)) probintzia.r[p] = zona(x);
    eserlekuak.autonomia[cca] = eser(t.eserlekuak);
    const [a, bb, falta, m, aukerak, iz, prob] = t.azkena;
    eserlekuak.azkena[cca] = [b[a], b[bb], falta, m, aukerak.map(([i, x]) => [b[i], x]), iz, prob];
    if (t.barrutiak.length) eserlekuak.barrutiak[cca] = t.barrutiak.map(([iz_, p, x, [a_, b_, f_, m_]]) => [iz_, p, eser(x), [b[a_], b[b_], f_, m_]]);
    // el voto exterior (donde la fuente lo da): por provincia y, sumado, la comunidad
    const zc = ([censo, vot, zur, bal, vc, lista]) => [censo, vot, zur, bal, vc, lista.map(([i, v]) => [b[i], v])];
    for (const [p, x] of Object.entries(t.cera || {})) probintzia.cera[p] = zc(x);
    const ps = Object.values(t.cera || {});
    if (ps.length) {
      const batu = (i) => (ps.some((x) => x[i] == null) ? null : ps.reduce((n, x) => n + x[i], 0));
      const botoak = new Map();
      for (const x of ps) for (const [i, v] of x[5]) botoak.set(b[i], (botoak.get(b[i]) || 0) + v);
      autonomia.cera[cca] = [batu(0), batu(1), batu(2), batu(3), batu(4), [...botoak].sort((x, y) => y[1] - x[1])];
    }
  });
  return { autonomia, probintzia, eserlekuak };
}
// Varias tablas de votos en una (cada fichero trae su lista de candidaturas: los índices se rehacen)
function taulakBatu(taulak) {
  const out = { s: [], k: [], f: [], b: [], r: {} }, idx = new Map();
  for (const t of taulak) {
    const berria = t.s.map((s, i) => {
      const g = `${s}\u0000${t.k[i]}\u0000${t.f[i]}`;
      if (!idx.has(g)) { idx.set(g, out.s.length); out.s.push(s); out.k.push(t.k[i]); out.f.push(t.f[i]); }
      return idx.get(g);
    });
    for (const [id, [censo, votantes, vc, lista]] of Object.entries(t.r)) out.r[id] = [censo, votantes, vc, lista.map(([i, v]) => [berria[i], v])];
  }
  return out;
}
const aurretik = (p) => p.catch(() => {});  // lo que se carga por adelantado: si falla, ya se pedirá cuando haga falta
const DATA_SYNC = {};  // k → datos ya cargados (para no esperar al pintar)
async function prestatu(k) { DATA_SYNC[k] = await datuak(k); return DATA_SYNC[k]; }
async function sekzioDatuak(k, cpro) {
  const d = await prestatu(k);
  if (!d.sek[cpro]) d.sek[cpro] = (autKoa(k) ? autSekzioak(k, cpro) : load(`data/${k}/sekzioa/${cpro}.json`))
    .then((x) => (d.sek[cpro] = x), (e) => { delete d.sek[cpro]; throw e; });
  return d.sek[cpro];
}
// Autonómicas: las secciones de la elección que tiene la comunidad de la provincia en esa fecha, si su fuente viene por
// mesa (AUT.sekzioak: elección → año de su seccionado); si no, null (la provincia se ve por municipios)
const autSekGakoa = (k, cpro) => { const cca = GOIK.probintzia[cpro], hk = INFO[k].osagaiak[cca], g = hk && `${cca}-${hk}`; return g && AUT.sekzioak[g] ? g : null; };
const AUT_SEK = {};
function autSekzioak(k, cpro) {
  const g = autSekGakoa(k, cpro); if (!g) return Promise.resolve(null);
  return (AUT_SEK[`${g}/${cpro}`] ??= load(`data/autonomikoak/sekzioa/${g}/${cpro}.json`).catch((e) => { delete AUT_SEK[`${g}/${cpro}`]; throw e; }));
}
// El seccionado (año) con que se dibuja una provincia en la elección k: el de la elección o, en las autonómicas, el de la
// elección de su comunidad (null: sin secciones)
const sekUrtea = (k, cpro) => (autKoa(k) ? (autSekGakoa(k, cpro) && AUT.sekzioak[autSekGakoa(k, cpro)]) || null : INFO[k].sekzioUrtea);
// Registro de una zona: {censo, votantes, vc (votos a candidaturas), part (%), m (diferencia 1.ª–2.ª en puntos),
// c: [[siglas, votos, %, color, partido, bloque]]} (partido: regla de koloreak.csv; bloque: INB, ESK o «»).
// De la provincia para arriba, con el voto exterior (CERA) donde la fuente lo da, como el resultado oficial: entonces
// partE es la participación de los residentes (sin él), la de la capa del mapa y la evolución
const CERA_MAILAK = new Set(["estatua", "nazioa", "autonomia", "probintzia", "tamaina"]);
function erregistroa(k, maila, id) {
  const d = DATA_SYNC[k]; if (!d) return null;
  const f = maila === "sekzioa" ? d.sek[id.slice(0, 2)] : d[maila === "estatua" ? "estatua" : maila];
  if (!f || f instanceof Promise || !f.r[id]) return null;
  let [censo, votantes, vc, lista] = f.r[id], partE = null;
  const x = CERA_MAILAK.has(maila) && f.cera && f.cera[id];
  if (x) {
    const [cc, cv, , , cvc, cl] = x, v = new Map(lista);
    for (const [i, n] of cl) v.set(i, (v.get(i) || 0) + n);
    lista = [...v].sort((a, b) => b[1] - a[1]); vc += cvc;
    if (cc != null && cv != null && censo) { partE = (100 * votantes) / censo; censo += cc; votantes += cv; }
  }
  const c = lista.map(([i, v]) => [f.s[i], v, vc ? (100 * v) / vc : null, f.k[i], f.f[i], (f.b || [])[i] || ""]);
  return { censo, votantes, vc, c, part: censo ? (100 * votantes) / censo : null, partE, cera: !!x,
           m: c.length > 1 ? c[0][2] - c[1][2] : c.length ? 100 : null };
}
const partEgoiliar = (r) => (r.partE ?? r.part);  // la de los residentes (sin voto exterior)
// El voto exterior (CERA) de una zona, de la provincia para arriba: {censo, votantes, zur, bal, vc, part, c}; null si la
// fuente no lo da aparte (autonómicas) o la zona no tiene (municipios y secciones)
function ceraErregistroa(k, maila, id) {
  const d = DATA_SYNC[k]; if (!d) return null;
  const f = d[maila], x = f && f.cera && f.cera[id]; if (!x) return null;
  const [censo, votantes, zur, bal, vc, lista] = x;
  const c = lista.map(([i, v]) => [f.s[i], v, vc ? (100 * v) / vc : null, f.k[i], f.f[i]]);
  return { censo, votantes, zur, bal, vc, c, part: censo && votantes != null ? (100 * votantes) / censo : null };
}
// La elección con la que se compara (▲▼). En el Congreso, la anterior. En las autonómicas, la anterior de la comunidad de la
// zona (la vista de esa sola elección); null sin zona elegida o si su comunidad no está en la vista
function aurrekoa(k, h = state.hautatua) {
  if (!autKoa(k)) { const i = KK.indexOf(k); return i > 0 ? KK[i - 1] : null; }
  const cca = h && autCca(h.maila, h.id), hk = cca && INFO[k].osagaiak[cca]; if (!hk) return null;
  const aurrekoak = AUT_HK[cca].filter((x) => x < hk);
  return aurrekoak.length ? `e${aurrekoak.at(-1)}.${cca}` : null;
}
// En las autonómicas, la elección de una comunidad en la vista k (AAAAMM; null si no está) y sus avisos (testuak.js: autOharrak)
const autHauteskundea = (k, cca) => (autKoa(k) && INFO[k].osagaiak && INFO[k].osagaiak[cca]) || null;
// Una zona fuera de la vista (autonómicas: su comunidad no está en lo elegido o no tiene datos en ese momento), vacía
const kanpoan = (k, maila, id) => { const cca = autKoa(k) && autCca(maila, id); return !!cca && !INFO[k].osagaiak[cca]; };
const autHkIzena = (hk) => INFO[`e${hk}`].izena;
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
// Tamaño de una circunscripción en una elección (txikiak, ertainak, handiak), sus escaños y las provincias de cada grupo
const tamainaZein = (k, cpro) => { const d = DATA_SYNC[k]; return (d && d.eserlekuak.tamainak && d.eserlekuak.tamainak[cpro]) || null; };
const probEserlekuak = (k, cpro) => (eserlekuak(k, "probintzia", cpro) || []).reduce((s, x) => s + x[1], 0);
const tamainaProbintziak = (k, t) => { const d = DATA_SYNC[k]; return d ? Object.keys(d.eserlekuak.tamainak || {}).filter((p) => d.eserlekuak.tamainak[p] === t) : []; };
// Escaños de cada bloque en un ámbito: {INB, ESK, "": otros}
function blokeEserlekuak(k, maila, id) {
  const e = eserlekuak(k, maila, id); if (!e) return null;
  return e.reduce((o, x) => { o[x[4]] += x[1]; return o; }, { INB: 0, ESK: 0, "": 0 });
}
// Bloques en el orden de las listas; «otros» solo si tiene algo
const BLOKEAK = ["INB", "ESK", ""];
const blokeZatiak = (o) => BLOKEAK.filter((x) => o[x] || x !== "");
// Escaños: en el Congreso, de la provincia (la circunscripción) para arriba; en las autonómicas, solo de la comunidad, que
// es la de su parlamento. Municipios y secciones no tienen escaños propios: ahí no se enseñan escaños
const eserlekurikEz = (maila) => (autonomikoak() ? maila !== "autonomia" : maila === "udalerria" || maila === "sekzioa");
// El ámbito del último escaño (Escaños reñidos): la provincia en el Congreso; la comunidad en las autonómicas
const barrutiMaila = () => (autonomikoak() ? "autonomia" : "probintzia");

// Último escaño (prozesatu.py y autonomikoak_web.py: D'Hondt con el voto CERA) de una provincia o, en las autonómicas, de
// una comunidad: quién lo ganó, la candidatura que menos votos necesitaba para quitárselo y cuántos; para los bloques, la
// del otro bloque que menos votos necesitaba (x[4], de menos a más). En las autonómicas, el de la circunscripción más
// reñida de la comunidad y, si tiene varias, cuál: su nombre (x[5]: isla, circunscripción de Asturias…) o su provincia (x[6])
function azkenEserlekua(k, id) {
  const d = DATA_SYNC[k], e = d && d.eserlekuak, x = e && e.azkena && e.azkena[id]; if (!x) return null;
  const ba = (e.b || [])[x[0]] || "", beste = ba === "INB" ? "ESK" : ba === "ESK" ? "INB" : null;
  const bj = beste && (x[4] || []).find(([i]) => e.b[i] === beste);
  return { a: e.s[x[0]], b: e.s[x[1]], falta: x[2], n: x[3], ba, beste: bj ? beste : null, bj: bj ? e.s[bj[0]] : null, bf: bj ? bj[1] : null,
    barrutia: x[5] ? barrutiIzena(x[5]) : x[6] ? izena("probintzia", x[6]) : "" };
}
// Nombre de una circunscripción autonómica que no es una provincia: las islas, por su nombre; las de Asturias, la
// autonómica de Canarias y las de Murcia (números), con la palabra «circunscripción» en el idioma de la web
const barrutiIzena = (iz) => (/^\d+$/.test(iz) ? T.barrutiaZk(iz) : T.barrutiIzenak[iz] || iz);
// La frase del último escaño: con partidos (panel) o solo bloques (puntero de «Bloques»); delante, la circunscripción
const azkenTestua = (z, alderdirik = true) => (z.barrutia ? `${esc(z.barrutia)}. ` : "") + (state.modua !== "blokeak" ? T.azkenaTxt(z.n, esc(z.a), esc(z.b), fmt(z.falta))
  : z.ba ? T.blokeTxt(z.n, alderdirik && esc(z.a), T.blokeIzenak[z.ba], z.beste && T.blokeIzenak[z.beste], fmt(z.bf), alderdirik && esc(z.bj))
  : T.blokeKanpoTxt(z.n, alderdirik && esc(z.a)));
const azkenKutxa = (k, id) => { const z = azkenEserlekua(k, id); return z ? `<div class="lehia">${azkenTestua(z)}</div>` : ""; };
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
  if (maila === "tamaina") return T.tamainaIzenak[id] || id;
  if (maila === "sekzioa") { const u = IZENAK.udalerria[sekUdalerria(id)]; return `${u ? u[0] : sekUdalerria(id)} · ${id.slice(5, 7)}-${id.slice(7)}`; }
  const r = IZENAK[maila] && IZENAK[maila][id]; return r ? r[0] : id;
}
function goikoak(maila, id) {  // de la nación (en las autonómicas, de la comunidad) hacia abajo, sin el propio
  const out = [];
  const cpro = ["sekzioa", "udalerria", "probintzia"].includes(maila) ? id.slice(0, 2) : null;
  const cca = maila === "autonomia" ? id : cpro ? GOIK.probintzia[cpro] : null;
  const naz = maila === "nazioa" || autonomikoak() ? null : cca ? GOIK.autonomia[cca] : null;
  if (naz) out.push(["nazioa", naz]);
  if (cca && maila !== "autonomia" && !(naz && IZENAK.autonomia[cca][0] === IZENAK.nazioa[naz][0])) out.push(["autonomia", cca]);
  if (cpro && maila !== "probintzia" && !(cca && IZENAK.probintzia[cpro][0] === IZENAK.autonomia[cca][0])) out.push(["probintzia", cpro]);  // Nafarroa, Madrid…: comunidad = provincia
  if (maila === "sekzioa") out.push(["udalerria", sekUdalerria(id)]);
  return out;
}

// ---- ortofotos del PNOA, recortadas a España ----
// Cada tesela «orto://z/x/y» se compone aquí. Fuera de España no se pide nada (queda transparente y se ve el Sentinel-2 de
// debajo); entera dentro, va la del PNOA tal cual; en la frontera o en la costa, recortada con la parte del contorno que
// la cruza. El contorno (0,9 MB) se carga la primera vez que hace falta. Si el servidor del IGN falla, queda el satélite.
let maskara = null;
const maskaraLortu = () => (maskara ??= load("geo/maskara.json").then((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map(([eraztuna]) => {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of eraztuna) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { bbox: [w, s, e, n], eraztuna };
})));
const lonTile = (x, n) => x / n * 360 - 180;
const latTile = (y, n) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
// ¿algún trozo del segmento dentro del rectángulo [oeste, sur, este, norte]? (Liang-Barsky)
const zatiaBarruan = ([x1, y1], [x2, y2], [w, s, e, n]) => {
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[x1 - x2, x1 - w], [x2 - x1, e - x1], [y1 - y2, y1 - s], [y2 - y1, n - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); }
  }
  return true;
};
const mugaGurutzatzen = (eraztuna, t) => eraztuna.some((a, i) => i > 0 && zatiaBarruan(eraztuna[i - 1], a, t));
const barruan = ([x, y], eraztuna) => {  // punto en polígono (rayo hacia el este)
  let b = false;
  for (let i = 0, j = eraztuna.length - 1; i < eraztuna.length; j = i++) {
    const [xi, yi] = eraztuna[i], [xj, yj] = eraztuna[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) b = !b;
  }
  return b;
};
// El contorno, solo dentro del rectángulo (Sutherland-Hodgman): así el recorte de cada tesela es corto
const moztu = (eraztuna, [w, s, e, n]) => {
  let pts = eraztuna;
  for (const [ok, ebaki] of [
    [(p) => p[0] >= w, (a, b) => [w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= e, (a, b) => [e, a[1] + (b[1] - a[1]) * (e - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= s, (a, b) => [a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]), s]],
    [(p) => p[1] <= n, (a, b) => [a[0] + (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]), n]]]) {
    const irt = [];
    pts.forEach((b, i) => {
      const a = pts[(i + pts.length - 1) % pts.length];
      if (ok(b)) { if (!ok(a)) irt.push(ebaki(a, b)); irt.push(b); } else if (ok(a)) irt.push(ebaki(a, b));
    });
    pts = irt;
    if (!pts.length) break;
  }
  return pts;
};
let hutsa = null;  // tesela transparente
const hutsaLortu = () => (hutsa ??= (() => {  // (sin getContext, convertToBlob falla: «no rendering context»)
  const c = new OffscreenCanvas(256, 256);
  c.getContext("2d");
  return c.convertToBlob({ type: "image/png" }).then((x) => x.arrayBuffer());
})());
maplibregl.addProtocol("orto", async (params, abort) => {
  const [z, x, y] = params.url.slice("orto://".length).split("/").map(Number), n = 2 ** z;
  const t = [lonTile(x, n), latTile(y + 1, n), lonTile(x + 1, n), latTile(y, n)];  // oeste, sur, este, norte
  const ondoan = (await maskaraLortu()).filter(({ bbox: b }) => !(t[2] < b[0] || t[0] > b[2] || t[3] < b[1] || t[1] > b[3]));
  const mugan = ondoan.filter((p) => mugaGurutzatzen(p.eraztuna, t));
  const osorik = !mugan.length && ondoan.some((p) => barruan([(t[0] + t[2]) / 2, (t[1] + t[3]) / 2], p.eraztuna));
  if (!mugan.length && !osorik) return { data: await hutsaLortu() };  // fuera de España: ni se pide
  let r;
  try {
    r = await fetch(PNOA.replace("{z}", z).replace("{x}", x).replace("{y}", y), { signal: abort.signal });
  } catch (e) { if (abort.signal.aborted) throw e; return { data: await hutsaLortu() }; }
  if (!r.ok) return { data: await hutsaLortu() };
  if (osorik) return { data: await r.arrayBuffer() };
  const img = await createImageBitmap(await r.blob());
  const px = (lon) => ((lon + 180) / 360 * n - x) * 256;
  const py = (lat) => ((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n - y) * 256;
  const m = (t[2] - t[0]) * 0.02, zabala = [t[0] - m, t[1] - m, t[2] + m, t[3] + m];  // un poco más: el corte, fuera de la tesela
  const recorte = new Path2D();
  for (const p of mugan) moztu(p.eraztuna, zabala).forEach(([lon, lat], i) => (i ? recorte.lineTo(px(lon), py(lat)) : recorte.moveTo(px(lon), py(lat))));
  const lienzo = new OffscreenCanvas(256, 256), ctx = lienzo.getContext("2d");
  ctx.clip(recorte, "evenodd");
  ctx.drawImage(img, 0, 0, 256, 256);
  return { data: await (await lienzo.convertToBlob({ type: "image/png" })).arrayBuffer() };
});

// ---- mapa ----
const GEO = { nazioa: GEO_NAZ, autonomia: GEO_AUT, probintzia: GEO_PROB,
  udalerria: { type: "FeatureCollection", features: [] }, sekzioa: { type: "FeatureCollection", features: [] } };
for (const m of ["nazioa", "autonomia", "probintzia"]) for (const f of GEO[m].features) f.properties.id = f.id;
// «lurra»: todo el territorio en gris «sin datos», debajo (comunales sin municipio que el seccionado no cubre)
const sources = { lurra: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  sat: { type: "raster", tiles: [SATELITEA], tileSize: 256, maxzoom: 13, attribution: SAT_KREDITUA },  // EOX no da más detalle
  orto: { type: "raster", tiles: ["orto://{z}/{x}/{y}"], tileSize: 256, minzoom: ORTO_ZOOM, maxzoom: 19, attribution: PNOA_KREDITUA } };
const layers = [{ id: "atzealdea", type: "background", paint: { "background-color": "#0C131A" } },
  { id: "sat", type: "raster", source: "sat", layout: { visibility: state.satelitea ? "visible" : "none" } },
  { id: "orto", type: "raster", source: "orto", minzoom: ORTO_ZOOM, layout: { visibility: state.satelitea ? "visible" : "none" } },
  { id: "lurra", type: "fill", source: "lurra", layout: { visibility: state.satelitea ? "none" : "visible" }, paint: { "fill-color": NODATA } }];
// El contorno (geo/lurra.json, 260 KB) solo se pide cuando se ve: sin satélite (al empezar o al apagarlo)
let lurraZain = null;
const lurraLortu = () => (lurraZain ??= load("geo/lurra.json").then((g) => map.getSource("lurra").setData(g)).catch((e) => { lurraZain = null; throw e; }));
// Fuera de la elección (autonómicas: las comunidades que no votan ese día), ni color ni bordes: el mapa, limpio
const KANPO = ["boolean", ["feature-state", "kanpo"], false];
const opakutasuna = () => ["case", KANPO, 0, ["boolean", ["feature-state", "hover"], false], state.satelitea ? 0.85 : 1, state.satelitea ? 0.62 : 0.88];
for (const m of MAILAK) {
  sources[m] = { type: "geojson", data: GEO[m], promoteId: "id" };
  layers.push({ id: m + "-fill", type: "fill", source: m, layout: { visibility: "none" }, paint: {
    "fill-color": ["coalesce", ["feature-state", "c"], NODATA],
    "fill-opacity": opakutasuna() } });
  layers.push({ id: m + "-line", type: "line", source: m, layout: { visibility: "none" }, paint: {
    "line-color": ["case", ["boolean", ["feature-state", "sel"], false], "#F2B544", "#0C131A"],
    "line-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 1, KANPO, 0, 1],
    "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 2.5, m === "sekzioa" ? 0.3 : 0.6] } });
}
sources.mugak = { type: "geojson", data: GEO_NAZ };  // fronteras de nación (autonómicas: de las comunidades que votan), siempre encima
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
  if (mugikorra()) return { top: 96, bottom: 170, left: 10, right: 10 };
  return { top: 30, bottom: 110, left: $("#app").classList.contains("menurik-ez") ? 40 : 290, right: 444 };
}
let estiloaPrest = false; map.once("style.load", () => { estiloaPrest = true; });

// Recuadro de cada provincia (para saber qué municipios y secciones hay que cargar) y de cada comunidad (para ir a las de
// una fecha de las autonómicas)
function laukia(f) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => { if (typeof c[0] === "number") { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
  walk(f.geometry.coordinates); return [x0, y0, x1, y1];
}
const PROB_BBOX = Object.fromEntries(GEO_PROB.features.map((f) => [f.id, laukia(f)]));
const AUT_BBOX = Object.fromEntries(GEO_AUT.features.map((f) => [f.id, laukia(f)]));
function ikusgaiProbintziak() {
  const b = map.getBounds(), [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  return Object.entries(PROB_BBOX).filter(([, [x0, y0, x1, y1]]) => x0 < e && x1 > w && y0 < n && y1 > s).map(([p]) => p);
}
// Secciones: cada provincia con el seccionado de su elección (en las autonómicas, cada comunidad tiene la suya; puede
// cambiar de año al cambiar de fecha); al cambiar, se quita lo de las provincias que ya no valen y se pide lo que falta
const kargatuta = { udalerria: new Set(), sekzioa: new Map() };  // sekzioa: provincia → año cargado
const sekGeo = {};  // provincia → sus secciones
async function sekzioGeoKargatu(probak) {
  let aldatu = false;
  for (const [p, u] of kargatuta.sekzioa) if (u !== sekUrtea(state.k, p)) { kargatuta.sekzioa.delete(p); delete sekGeo[p]; aldatu = true; }
  const behar = probak.filter((p) => !kargatuta.sekzioa.has(p)).map((p) => [p, sekUrtea(state.k, p)]);
  behar.forEach(([p, u]) => kargatuta.sekzioa.set(p, u));
  const bildumak = await Promise.all(behar.map(([p, u]) => (u ? load(`geo/sekzioak/${u}/${p}.json`).catch(() => ({ features: [] })) : { features: [] })));
  behar.forEach(([p, u], i) => {
    if (kargatuta.sekzioa.get(p) !== u) return;  // mientras se cargaba, otra elección
    for (const f of bildumak[i].features) f.properties.id = f.id;
    sekGeo[p] = bildumak[i].features; aldatu = true;
  });
  if (!aldatu) return false;
  GEO.sekzioa.features = Object.values(sekGeo).flat();
  map.getSource("sekzioa").setData(GEO.sekzioa);
  return true;
}
async function geoKargatu(maila, probak) {
  if (maila === "sekzioa") return sekzioGeoKargatu(probak);
  const falta = probak.filter((p) => !kargatuta[maila].has(p));
  if (!falta.length) return false;
  falta.forEach((p) => kargatuta[maila].add(p));
  const bildumak = await Promise.all(falta.map((p) => load(`geo/udalerriak/${p}.json`).catch(() => ({ features: [] }))));
  for (const fc of bildumak) for (const f of fc.features) { f.properties.id = f.id; GEO[maila].features.push(f); }
  map.getSource(maila).setData(GEO[maila]);
  return true;
}

// ---- color de cada zona (feature-state: no se rehace la geometría al cambiar de elección o de capa) ----
function kolorea(r, maila, id) {
  if (state.modua === "lehia") { const z = maila === barrutiMaila() && azkenEserlekua(state.k, id); return z ? bin(z.falta, LEHIA_BINS) : NODATA; }
  if (state.modua === "tamaina") { const t = maila === "probintzia" && tamainaZein(state.k, id); return t ? TAMAINA_KOLOREA[t] : NODATA; }
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
  return bin(partEgoiliar(r), PART_BINS);
}
const margotuta = {};  // nivel → firma de lo último pintado
const irabazleakMailaka = {};  // nivel → partido → zonas que gana
function margotu(maila) {
  const sinadura = `${state.k}|${state.modua}|${GEO[maila].features.length}|${maila === "udalerria" && azkenAzpian}`;  // (con o sin secciones encima)
  if (margotuta[maila] === sinadura) return;
  margotuta[maila] = sinadura;
  const irabazleak = irabazleakMailaka[maila] = new Map();  // leyenda del modo Ganador: quién gana cuántas zonas
  // municipios debajo de las secciones (autonómicas): en la leyenda, solo los de las provincias sin secciones
  const ezkutuan = maila === "udalerria" && azkenAzpian ? (id) => !!sekUrtea(state.k, id.slice(0, 2)) : () => false;
  for (const f of GEO[maila].features) {
    const id = String(f.id), kanpo = kanpoan(state.k, maila, id), r = kanpo ? null : erregistroa(state.k, maila, id);
    map.setFeatureState({ source: maila, id: f.id }, { c: kolorea(r, maila, id), kanpo });
    if (r && r.c[0] && !ezkutuan(String(f.id))) {  // por partido: PSC, PSE-EE y PSN-PSOE cuentan juntos (con el nombre más frecuente)
      const [s, , , kol, f] = r.c[0], g = irabazleak.get(f) || { kol, n: 0, izenak: new Map() };
      g.n++; g.izenak.set(s, (g.izenak.get(s) || 0) + 1); irabazleak.set(f, g);
    }
  }
  legenda();
}
// «Escaños reñidos» y «Circunscripciones» solo tienen sentido por circunscripción: con ellas, siempre provincias (en las
// autonómicas, comunidades: su circunscripción más reñida). «Bloques», en todos los niveles. Las autonómicas no tienen
// naciones: con su zoom, comunidades
const BARRUTIKA = ["lehia", "tamaina"];
function mailaAktiboa() {
  if (BARRUTIKA.includes(state.modua)) return barrutiMaila();
  const m = state.maila !== "auto" ? state.maila : MAILAK.find((x) => map.getZoom() < ZOOMAK[x][1]);
  return autonomikoak() && m === "nazioa" ? "autonomia" : m;
}
// Fronteras doradas, encima: las de las naciones en el Congreso; en las autonómicas, las de las comunidades que votan
let mugenGakoa = "nazioak";
function mugakEguneratu() {  // (en la línea de tiempo, las que votan ese día; con el buscador, las elegidas)
  const g = autonomikoak() ? state.k : "nazioak"; if (g === mugenGakoa) return;
  mugenGakoa = g;
  const ccak = !autonomikoak() ? [] : hautaketa(state.k) ? Object.keys(INFO[state.k].osagaiak) : INFO[state.k].berriak;
  map.getSource("mugak").setData(autonomikoak() ? { type: "FeatureCollection", features: GEO_AUT.features.filter((f) => ccak.includes(f.id)) } : GEO_NAZ);
}
// Autonómicas a nivel de sección: las provincias cuya elección no tiene secciones (su fuente no viene por mesa) se ven
// por municipios, debajo; los municipios de las demás, ocultos (si no, se verían a través de las secciones)
let azkenIragazkia = "null";
function udalAzpian(m) {
  const azpian = m === "sekzioa" && autonomikoak();
  const iragazkia = azpian ? ["!", ["in", ["slice", ["to-string", ["get", "id"]], 0, 2], ["literal", Object.keys(GOIK.probintzia).filter((p) => sekUrtea(state.k, p))]]] : null;
  if (JSON.stringify(iragazkia) !== azkenIragazkia) {  // solo si cambia (al moverse el mapa, no)
    for (const s of ["-fill", "-line"]) map.setFilter("udalerria" + s, iragazkia);
    azkenIragazkia = JSON.stringify(iragazkia);
  }
  return azpian;
}
let azkenMaila = null, azkenAzpian = false;
async function eguneratu() {
  if (map.getZoom() >= UDAL_HASI - 0.5 || state.maila === "udalerria" || state.maila === "sekzioa") aurretik(udalIzenakLortu());
  mugakEguneratu();
  const m = mailaAktiboa(), azpian = udalAzpian(m);
  const mailaBerria = m !== azkenMaila || azpian !== azkenAzpian;
  if (mailaBerria) {
    for (const x of MAILAK) for (const s of ["-fill", "-line"]) map.setLayoutProperty(x + s, "visibility", x === m || (azpian && x === "udalerria") ? "visible" : "none");
    azkenMaila = m; azkenAzpian = azpian;
  }
  const k = state.k;
  await prestatu(k);
  if (k !== state.k) return;  // mientras se cargaba, otra elección (la línea de tiempo en marcha): la pinta su llamada
  if (m === "udalerria" || m === "sekzioa") {
    const probak = ikusgaiProbintziak();
    if (m === "sekzioa") await Promise.all(probak.map((p) => sekzioDatuak(state.k, p)));
    if (await geoKargatu(m, probak)) margotuta[m] = null;
    if (azpian && await geoKargatu("udalerria", probak)) margotuta.udalerria = null;
  }
  if (azpian) margotu("udalerria");
  margotu(m); nabarmendu();  // el grupo elegido de «Circunscripciones» puede cambiar con la elección (Jaén, Badajoz)
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
  // sin censo (Cantabria 2019, autonómicas), por los votos
  if (!udalOrdenak[k]) udalOrdenak[k] = Object.entries(d.udalerria.r).map(([id, r]) => [id, r[0] ?? r[2]]).sort((a, b) => b[1] - a[1]);
  return udalOrdenak[k];
}
// Candidatos en orden de importancia: [nombre, lon, lat, clase, tamaño de letra, espaciado, se puede mover, relleno]. Con las
// provincias y sus ciudades a la vez: primero las ciudades grandes, luego las provincias (que se apartan un poco si no
// caben en su sitio) y luego las demás; la capital que se llama como su provincia (León, Sevilla…) no se repite
const izenGakoa = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function etiketaHautagaiak(m, z) {
  const mailakoak = m === "udalerria" || m === "sekzioa" ? [] : Object.entries(IZENAK[m]).filter(([id]) => !kanpoan(state.k, m, id))  // autonómicas: las que votan
    .map(([, [n, x, y]]) => [n, x, y, m, ...MAILA_LETRA[m], true]);
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
  if (kanpoan(state.k, maila, id)) return `<div class="tt-n">${esc(izena(maila, id))}</div><div class="tt-m">${hautaketa(state.k) ? T.autEzTip : T.sinDatos}</div>`;
  const blokeak = state.modua === "blokeak", eser = state.fitxa === "eserlekuak" && !eserlekurikEz(maila);
  const zenbakiak = eser ? (blokeak ? blokeEserZatia : eserZatia)(maila, id) : (blokeak ? blokeBotoZatia : botoZatia)(maila, id);
  return `<div class="tt-n">${esc(izena(maila, id))}</div>${argibideEsaldia(maila, id)}${zenbakiak}`;
}
function argibideEsaldia(maila, id) {
  if (state.modua === "tamaina" && maila === "probintzia") {  // el tamaño de la circunscripción
    const t = tamainaZein(state.k, id); return t ? `<div class="tt-azkena">${T.tamainaTxt(T.tamainaIzenak[t], probEserlekuak(state.k, id))}</div>` : "";
  }
  if (["lehia", "blokeak"].includes(state.modua) && maila === barrutiMaila()) {  // el último escaño
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
  return `<div class="tt-m">${T.part} ${partTestua(r)} · ${T.margen} ${ptu(r.m)} ${T.puntos}</div>` + r.c.filter((c) => c[2] >= lehen - ARGIBIDE_MARJINA).slice(0, 5)
    .map((c) => `<div class="tt-r"><span>${sq(c[3])} ${esc(c[0])}</span><span>${pct(c[2])}</span></div>`).join("");
}
// Resultados con «Bloques»: el % de cada bloque
function blokeBotoZatia(maila, id) {
  const r = erregistroa(state.k, maila, id); if (!r) return `<div class="tt-m">${T.sinDatos}</div>`;
  const z = blokeBotoak(r), zatiak = blokeZatiak(z.v);
  return `<div class="tt-m">${T.part} ${partTestua(r)}</div>${segBarra(zatiak.map((x) => [z.v[x], BLOKE_KOLOREA[x]]))}` +
    zatiak.map((x) => `<div class="tt-r"><span>${sq(BLOKE_KOLOREA[x])} ${T.blokeIzenak[x]}</span><b>${pct(z.p[x])}</b></div>`).join("");
}
// Escaños del ámbito (provincia o superior)
const eserMeta = (n) => `<div class="tt-m">${n} ${T.escanosN}</div>`;
function eserZatia(m, i) {
  const ak = aurrekoa(state.k, { maila: m, id: i });
  const e = eserlekuak(state.k, m, i) || [], n = e.reduce((s, x) => s + x[1], 0); if (!n) return `<div class="tt-m">${T.sinEscanos}</div>`;
  const aur = eserAurrekoak(e, ak && eserlekuak(ak, m, i));
  return eserMeta(n) + segBarra(e.map(([, x, kol]) => [x, kol])) +
    e.map((y) => { const [sig, x, kol] = y; return `<div class="tt-r"><span>${sq(kol)} ${esc(sig)}</span><span>${aldaketa(aur && x - aur(y), { berdina: false })} <b>${x}</b></span></div>`; }).join("");
}
// Escaños con «Bloques»: los de cada bloque
function blokeEserZatia(m, i) {
  const ak = aurrekoa(state.k, { maila: m, id: i });
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
  map.on("click", m + "-fill", (e) => {  // con «Circunscripciones», la provincia lleva a su grupo
    const f = e.features && e.features[0]; if (!f) return;
    const t = state.modua === "tamaina" && m === "probintzia" && tamainaZein(state.k, String(f.id));
    hautatu(t ? { maila: "tamaina", id: t } : { maila: m, id: String(f.id) });
  });
}

// ---- selección y panel ----
// Respuesta al toque (INP de Core Web Vitals, como en el Behatokia): primero se pinta lo que cambia al tocar (pestaña,
// elección, capa, zona resaltada) y lo pesado (panel, colores del mapa) va en el fotograma siguiente. arnasa deja pintar;
// el setTimeout de reserva, por si la pestaña está en segundo plano (sin requestAnimationFrame)
const arnasa = () => new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 100); });
let selRefs = [];
function nabarmendu() {  // la zona elegida, con borde; un grupo de «Circunscripciones», todas sus provincias
  for (const r of selRefs) map.setFeatureState(r, { sel: false });
  const h = state.hautatua;
  selRefs = !h ? [] : h.maila === "tamaina" ? tamainaProbintziak(state.k, h.id).map((p) => ({ source: "probintzia", id: p }))
    : map.getSource(h.maila) ? [{ source: h.maila, id: h.id }] : [];
  for (const r of selRefs) map.setFeatureState(r, { sel: true });
}
async function hautatu(h, joan = false) {
  if (h && (h.maila === "udalerria" || h.maila === "sekzioa")) await udalIzenakLortu();  // su nombre, en el panel y el enlace
  state.hautatua = h; nabarmendu();
  if (h && joan) { const r = IZENAK[h.maila] && IZENAK[h.maila][h.id]; if (r) map.flyTo({ center: [r[1], r[2]], zoom: Math.max(map.getZoom(), { nazioa: 5.5, autonomia: 6.4, probintzia: 7.4, udalerria: 10, sekzioa: 12 }[h.maila]) }); }
  urlaIdatzi(); arnasa().then(panela);  // primero la zona resaltada, luego el panel
}
// Cuatro cifras de la zona: participación (con su variación), votantes, censo y margen 1.ª–2.ª
// Participación con el voto exterior y, entre paréntesis, la de los residentes (la del mapa)
const partTestua = (r) => `${pct(r.part)}${r.partE != null ? ` (${T.egoiliarrak} ${pct(r.partE)})` : ""}`;
function kpis(r, ra) {
  // la oficial y, con voto exterior, debajo y con su propia cifra, la de los residentes (la del mapa). ▲▼ con la misma
  // base: la oficial solo frente a otra oficial; la de residentes, siempre
  const aldea = (x, y) => aldaketa(x != null && y != null ? x - y : null, { puntuak: true });
  const d = !ra ? "" : r.partE != null ? (ra.partE != null ? aldea(r.part, ra.part) : "") : aldea(r.part, partEgoiliar(ra));
  const e = r.partE != null ? `<div class="v v2">${pct(r.partE)}${ra ? aldea(r.partE, partEgoiliar(ra)) : ""}</div><div class="k">${T.egoiliarrak}</div>` : "";
  return `<div class="kpis"><div class="kpi"><div class="v">${pct(r.part)}${d}</div><div class="k">${T.part}</div>${e}</div>
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

// Escaños de cada candidatura en la elección anterior (para la variación): por siglas; si cambian, por partido
// (koloreak.csv: ERC-SOBIRANISTES y ERC son el mismo). Dos candidaturas del mismo partido en la misma lista (MÉS y MÉS per
// Menorca), cada una con las suyas
function eserAurrekoak(e, ea) {
  if (!ea) return null;
  const orain = new Set(e.map(([s]) => s)), siglaz = new Map(ea.map(([s, n]) => [s, n]));
  const alderdiz = ea.filter(([s]) => !orain.has(s)).reduce((m, [, n, , f]) => m.set(f, (m.get(f) || 0) + n), new Map());
  return ([s, , , f]) => (siglaz.has(s) ? siglaz.get(s) : alderdiz.get(f) || 0);
}
// Lista de escaños con variación respecto a la elección anterior
function eserZerrenda(e, ea) {
  const aur = eserAurrekoak(e, ea);
  return e.map((x) => { const [s, n, k] = x; return `<div class="row"><span class="nm">${sq(k)} ${esc(s)}</span><span class="num">${aldaketa(aur && n - aur(x))}</span><span class="pc">${n}</span></div>`; }).join("");
}
// Debajo del Estado: las naciones o, con «Circunscripciones», los tres grupos por tamaño — [nivel, título, columna]
const umeak = () => (state.modua === "tamaina" ? ["tamaina", T.tamainaLbl, T.tamainaZut] : ["nazioa", T.naciones, T.nacion]);
// Un grupo de «Circunscripciones»: su tramo de escaños y sus provincias (de más a menos escaños; cada una lleva a la suya)
function tamainaZatia(k, id) {
  const probak = tamainaProbintziak(k, id).sort((a, b) => probEserlekuak(k, b) - probEserlekuak(k, a));
  return `<details class="tamaina-prob"><summary>${T.probintziakN(probak.length)}</summary><div>${probak.map((p) =>
    `<button type="button" data-hautatu="probintzia:${p}">${esc(izena("probintzia", p))} <span class="zk">${probEserlekuak(k, p)}</span></button>`).join("")}</div></details>`;
}
// Pestaña Escaños: el Congreso (Estado) o el ámbito elegido, con su hemiciclo, sus escaños y los de cada bloque
function eserlekuOrria(k, ak, h) {
  if (autonomikoak()) return autEserlekuOrria(k, ak, h);
  if (!h) {  // Estado: Congreso entero y escaños de cada nación
    const e = eserlekuak(k, "estatua", "ES"); if (!e) return "";
    const [um] = umeak(), guztiak = (x) => x.reduce((s, y) => s + y[1], 0);
    const zonak = (um === "tamaina" ? TAMAINAK : Object.keys(IZENAK.nazioa)).map((id) => [id, eserlekuak(k, um, id) || []]);
    if (um === "nazioa") zonak.sort((a, b) => guztiak(b[1]) - guztiak(a[1]));
    return `${buruak(T.congreso, `${INFO[k].izena} · ${T.mayoria}`)}${hemizikloa(e, T.escanosN)}${eserZerrenda(e, ak && eserlekuak(ak, "estatua", "ES"))}${blokeZerrenda(k, ak, "estatua", "ES")}
      <div class="lbl">${um === "tamaina" ? T.porTamaina : T.porNacion}</div>${zonak.map(([id, x]) => { const n = guztiak(x);
        return `<div class="nazio-eser"><button type="button" data-hautatu="${um}:${id}">${esc(izena(um, id))}</button><b>${n}</b><span class="seg">${x.map(([s, m, kol]) => `<i style="flex:${m};background:${kol}" title="${esc(s)} ${m}">${m >= n * 0.12 ? m : ""}</i>`).join("")}</span></div>`; }).join("")}`;
  }
  // Ámbito con escaños propios; municipios y secciones no los tienen: se explica y se ofrece su provincia
  const [m, id] = [h.maila, h.id];
  const buru = buruak(esc(izena(h.maila, h.id)), `${T.escanos} · ${T.congreso} ${INFO[k].izena}`, true);
  if (eserlekurikEz(m)) return buru + eserlekurikEzZatia(m, id);
  const e = eserlekuak(k, m, id);
  if (!e || !e.length) return buru + `<p class="hint">${T.sinEscanos}</p>`;
  return buru + (m === "probintzia" ? azkenKutxa(k, id) : "") + hemizikloa(e, T.escanosN) + eserZerrenda(e, ak && eserlekuak(ak, m, id)) + blokeZerrenda(k, ak, m, id);
}
// Botón para ir a otra zona (la provincia de un municipio, el municipio de una sección)
const joateko = (maila, id) => `<button type="button" class="ibtn ekintza" data-hautatu="${maila}:${id}">${T.ikusi(esc(izena(maila, id)))}</button>`;
// Sin escaños propios: por qué, y el botón a donde están (la provincia en el Congreso; la comunidad en las autonómicas)
const eserlekurikEzZatia = (maila, id) => (autonomikoak() ? `<p class="hint">${T.eserBarrutiaAut}</p>${joateko("autonomia", autCca(maila, id))}`
  : `<p class="hint">${T.eserBarrutia}</p>${joateko("probintzia", id.slice(0, 2))}`);
// Voto exterior (CERA) de una zona de la provincia para arriba: sus cifras y sus candidaturas, ya sumadas en los resultados de
// la zona. Las autonómicas sin CERA en la fuente, un aviso (sus resultados van sin él)
function ceraZatia(k, ak, maila, id, r) {
  if (!["probintzia", "autonomia", "nazioa", "estatua", "tamaina"].includes(maila) || !r) return "";
  const c = ceraErregistroa(k, maila, id), ca = ak ? ceraErregistroa(ak, maila, id) : null;
  if (!c) return autonomikoak() && !(INFO[k].osagaiak && (AUT.oharrak[`${autCca(maila, id)}-${autHauteskundea(k, autCca(maila, id))}`] || []).includes("cera")) ? `<div class="lbl">${T.ceraLbl}</div><p class="hint">${T.ceraEz}</p>` : "";
  const d = aldaketa(ca && c.part != null && ca.part != null ? c.part - ca.part : null, { puntuak: true });
  const lehen = c.c[0] ? c.c[0][2] : 0;
  return `<div class="lbl">${T.ceraLbl}</div><div class="kpis"><div class="kpi"><div class="v">${pct(c.part)}${d}</div><div class="k">${T.part}</div></div>
    <div class="kpi"><div class="v">${fmt(c.votantes)}</div><div class="k">${T.votantes}</div></div><div class="kpi"><div class="v">${fmt(c.censo)}</div><div class="k">${T.censo}</div></div>
    <div class="kpi"><div class="v">${fmt(c.vc)}</div><div class="k">${T.vc}</div></div></div>` +
    c.c.slice(0, 8).map((x) => `<div class="row"><span class="nm">${sq(x[3])} ${esc(x[0])}</span><span class="num">${fmt(x[1])}</span><span class="pc">${pct(x[2])}</span><span class="bar"><i style="width:${Math.min(100, x[2] / Math.max(lehen, 1) * 100).toFixed(1)}%;background:${x[3]}"></i></span></div>`).join("") +
    `<p class="hint">${T.ceraBarne}</p>`;
}
// Cabecera del panel: nombre, línea de datos y, si hay algo elegido, la × para volver al Estado
function buruak(izen, meta, itxi = false) {
  return `<div class="hdr"><div><h2>${izen}</h2><div class="meta">${meta}</div></div>${itxi ? `<button type="button" class="itxi" aria-label="${T.cerrar}" title="${T.cerrar}" data-hautatu="">×</button>` : ""}</div>`;
}
// Migas de pan en la barra de arriba: Estado › nación › comunidad › provincia › municipio (autonómicas: Autonómicas ›
// comunidad › …)
function kokapena() {
  const h = state.hautatua, osoa = [["estatua", "ES"], ...(h ? [...goikoak(h.maila, h.id), [h.maila, h.id]] : [])];
  const izen = (m, id) => (m === "estatua" && autonomikoak() ? T.autonomicas : izena(m, id));
  // comunidad y provincia con el mismo nombre (Murcia › Murcia), una vez; el municipio de Murcia sí va aparte
  const katea = osoa.filter(([m, id], i) => !(i < osoa.length - 1 && osoa[i + 1][0] === "probintzia" && izen(m, id) === izen(...osoa[i + 1])));
  $("#crumb").innerHTML = katea.map(([m, id], i) => i === katea.length - 1 ? `<span class="cur">${esc(izen(m, id))}</span>`
    : `<button type="button" data-hautatu="${m === "estatua" ? "" : `${m}:${id}`}">${esc(izen(m, id))}</button>`).join('<span class="sep">›</span>');
}
// ---- autonómicas en el panel ----
const AUT_EZ = ["18", "19"];  // Ceuta y Melilla: sus asambleas se votan con las municipales, no son parlamentos autonómicos
// Las comunidades de la vista k (o, con todas, las diecisiete), por orden alfabético
const izenez = (ccak) => ccak.sort((a, b) => izena("autonomia", a).localeCompare(izena("autonomia", b), LOKALEA));
const autCcak = (k) => izenez(Object.keys(INFO[k].osagaiak));
const autCcakDenak = () => izenez(Object.keys(GOIK.autonomia).filter((c) => !AUT_EZ.includes(c)));
// La pista del panel: la línea de tiempo o lo elegido en el buscador
const autHint = (k) => (hautaketa(k) ? T.autHintBilatu : T.autHint);
// Sin zona elegida: no hay total del Estado. En la línea de tiempo, cada comunidad con su elección vigente (● las que votan
// ese día) y su primera fuerza; con lo elegido en el buscador, esas comunidades, con su participación y su primera fuerza
// (tres columnas: con cuatro, en el móvil pequeño no caben; el margen, en la ficha de cada una)
function autOrokorra(k) {
  const lehena = (x) => (x && x.c[0] ? `${sq(x.c[0][3])} ${esc(x.c[0][0])}` : T.sinDatos), hutsik = INFO[k].hutsik || [];
  if (!hautaketa(k)) {
    const berriak = new Set(INFO[k].berriak);
    return buruak(T.autParlamentuak, `${T.autonomicas} · ${hilIzena(state.une)}`) +
      `<div class="lbl">${T.autIndarrean}</div><div class="taula hiru"><span class="h">${T.mailak.autonomia}</span><span class="h">${T.hauteskundea}</span><span class="h">${T.primera}</span>
      ${autCcakDenak().map((c) => { const hk = autHauteskundea(k, c), x = hk && erregistroa(k, "autonomia", c);
      return `<span><button type="button" data-hautatu="autonomia:${c}">${esc(izena("autonomia", c))}</button></span>` +
        `<span class="aut-data${berriak.has(c) ? " berria" : ""}">${hk ? autHkIzena(hk) : "–"}</span><span>${lehena(x)}</span>`; }).join("")}</div>` +
      `<p class="hint">${T.autHint}</p>`;
  }
  return buruak(T.autParlamentuak, `${T.autonomicas} · ${INFO[k].izena}`) +
    `<div class="lbl">${T.autBozkatu}</div><div class="taula hiru"><span class="h">${T.mailak.autonomia}</span><span class="h num">${T.part}</span><span class="h">${T.primera}</span>
    ${autCcak(k).map((c) => { const x = erregistroa(k, "autonomia", c);
    return `<span><button type="button" data-hautatu="autonomia:${c}">${esc(izena("autonomia", c))}</button></span><span class="num">${pct(x && x.part)}</span>` +
      `<span>${lehena(x)}</span>`; }).join("")}</div>` +
    (hutsik.length ? `<p class="hint">${T.autFalta(hutsik.map((c) => esc(izena("autonomia", c))).join(", "))}</p>` : "") + `<p class="hint">${T.autHintBilatu}</p>`;
}
// Con una zona elegida: de qué elección son los datos, lo que hay que saber de la fuente (partidos sumados en «Otros», sin
// participación, escrutinio provisional, papeleta de isla) y con cuál se compara
function autMeta(k, h) {
  const hk = autHauteskundea(k, autCca(h.maila, h.id));
  return hk ? `${T.autonomicas} ${autHkIzena(hk)}` : T.autonomicas;
}
function autZatiak(k, h, ak) {
  const cca = autCca(h.maila, h.id); if (!cca) return "";
  const hk = autHauteskundea(k, cca); if (!hk) return autKanpo(k, cca);
  return (AUT.oharrak[`${cca}-${hk}`] || []).map((o) => `<p class="hint">${T.autOharrak[o]}</p>`).join("") +
    (ak ? `<div class="lbl">▲▼ ${T.respectoA} ${INFO[ak].izena}</div>` : "");
}
// Una zona cuya comunidad no está en la vista (no la eligió el buscador, o no tiene datos publicados): por qué y sus
// elecciones, cada una con un botón que enseña esa sola elección
function autKanpo(k, cca) {
  if (AUT_EZ.includes(cca)) return `<p class="hint">${T.autCeutaMelilla}</p>`;
  const iz = esc(izena("autonomia", cca)), hks = AUT_HK[cca] || [];
  const zergatik = !hautaketa(k) || (INFO[k].hutsik || []).includes(cca) ? T.autEzDago : k.includes(".") ? T.autEzHautatua(iz) : T.autEzBozkatu(iz, INFO[k].izena);
  return `<p class="hint">${zergatik}</p>` + (hks.length ? `<div class="lbl">${T.autBereak}</div><div class="aut-datak">${hks.map((hk) =>
    `<button type="button" class="ibtn" data-k="e${hk}.${cca}">${autHkIzena(hk)}</button>`).join("")}</div>` : "");
}
// Una fila de escaños: la comunidad (botón), su total y la barra por candidaturas
function eserErrenkada(maila, id, x) {
  const n = x.reduce((s, y) => s + y[1], 0);
  return `<div class="nazio-eser"><button type="button" data-hautatu="${maila}:${id}">${esc(izena(maila, id))}</button><b>${n}</b>` +
    `<span class="seg">${x.map(([s, m, kol]) => `<i style="flex:${m};background:${kol}" title="${esc(s)} ${m}">${m >= n * 0.12 ? m : ""}</i>`).join("")}</span></div>`;
}
// Las circunscripciones de una comunidad que tiene varias (provincias, islas, las de Asturias, Murcia hasta 2015, la
// autonómica de Canarias): los escaños de cada una y su último escaño
function barrutiZatia(k, cca) {
  const d = DATA_SYNC[k], e = d && d.eserlekuak, l = e && e.barrutiak && e.barrutiak[cca]; if (!l) return "";
  return `<div class="lbl">${T.barrutiakLbl}</div>` + l.map(([iz, prob, x, [a, b, falta, n]]) =>
    `<div class="nazio-eser barrutia"><span>${esc(iz ? T.barrutiLabur(iz) : izena("probintzia", prob))}</span><b>${n}</b><span class="seg">${x.map(([i, m]) =>
      `<i style="flex:${m};background:${e.k[i]}" title="${esc(e.s[i])} ${m}">${m >= n * 0.12 ? m : ""}</i>`).join("")}</span>` +
    `<span class="barruti-azk">${T.azkenaLabur(esc(e.s[a]), esc(e.s[b]), fmt(falta))}</span></div>`).join("");
}
// Pestaña Escaños en las autonómicas: sin zona, el parlamento de cada comunidad de la vista; una comunidad, el suyo,
// con su último escaño (el de su circunscripción más reñida) y sus circunscripciones; lo demás no tiene escaños propios
function autEserlekuOrria(k, ak, h) {
  if (!h) return buruak(T.autParlamentuak, `${T.escanos} · ${T.autonomicas} · ${hautaketa(k) ? INFO[k].izena : hilIzena(state.une)}`) + `<div class="lbl">${T.porComunidad}</div>` +
    autCcak(k).map((c) => [c, eserlekuak(k, "autonomia", c)]).filter(([, x]) => x && x.length).map(([c, x]) => eserErrenkada("autonomia", c, x)).join("") +
    `<p class="hint">${autHint(k)}</p>`;
  const [m, id] = [h.maila, h.id], cca = autCca(m, id);
  const e = eserlekurikEz(m) ? null : eserlekuak(k, m, id), n = e ? e.reduce((s, x) => s + x[1], 0) : 0;
  const buru = buruak(esc(izena(m, id)), `${T.escanos} · ${autMeta(k, h)}${n ? ` · ${T.mayoriaN(Math.floor(n / 2) + 1)}` : ""}`, true);
  if (cca && !autHauteskundea(k, cca)) return buru + autKanpo(k, cca);
  if (eserlekurikEz(m)) return buru + eserlekurikEzZatia(m, id);
  if (!n) return buru + `<p class="hint">${T.sinEscanos}</p>`;
  return buru + azkenKutxa(k, id) + hemizikloa(e, T.escanosN) + eserZerrenda(e, ak && eserlekuak(ak, m, id)) + barrutiZatia(k, id);
}
// Panel de la derecha: la pestaña abierta, para el Estado o para la zona elegida
function panela() {
  const k = state.k, ak = aurrekoa(k), h = state.hautatua, el = $("#edukia");
  for (const b of document.querySelectorAll("#fitxak [data-fitxa]")) b.setAttribute("aria-selected", b.dataset.fitxa === state.fitxa);
  kokapena();
  if (ak && !DATA_SYNC[ak]) aurretik(prestatu(ak).then(panela));  // la anterior, para las variaciones (▲▼)
  if (state.fitxa === "bilakaera") { el.innerHTML = bilakaeraOrria(h); return; }
  if (state.fitxa === "eserlekuak") { el.innerHTML = eserlekuOrria(k, ak, h); return; }
  if (!h && autonomikoak()) { el.innerHTML = autOrokorra(k); return; }
  if (!h) {
    const r = erregistroa(k, "estatua", "ES"); if (!r) { el.innerHTML = ""; return; }
    const ra = ak ? erregistroa(ak, "estatua", "ES") : null;
    const [um, lbl, zut] = umeak();
    const zonak = (um === "tamaina" ? TAMAINAK : Object.keys(IZENAK.nazioa)).map((id) => [id, erregistroa(k, um, id)]).filter(([, x]) => x);
    if (um === "nazioa") zonak.sort((a, b) => b[1].votantes - a[1].votantes);
    el.innerHTML = buruak(T.estado, `${T.congreso} · ${INFO[k].izena}${ak ? ` · ▲▼ ${T.respectoA} ${INFO[ak].izena}` : ""}`) + `${kpis(r, ra)}
      <div class="lbl">${lbl}</div><div class="taula"><span class="h">${zut}</span><span class="h num">${T.part}</span><span class="h">${T.primera}</span><span class="h num">${T.margen}</span>
      ${zonak.map(([id, x]) => `<span><button type="button" data-hautatu="${um}:${id}">${esc(izena(um, id))}</button></span><span class="num">${pct(x.part)}</span><span>${esc(x.c[0] ? x.c[0][0] : "–")}</span><span class="num">${ptu(x.m)}</span>`).join("")}</div>
      ${state.modua === "blokeak" ? blokeBotoZerrenda(r, ra) : ""}${emaitzak(r)}${ceraZatia(k, ak, "estatua", "ES", r)}<p class="hint">${T.estadoHint}</p>`;
    return;
  }
  const r = erregistroa(k, h.maila, h.id), ra = ak && h.maila !== "sekzioa" ? erregistroa(ak, h.maila, h.id) : null, kanpo = kanpoan(k, h.maila, h.id);
  const katea = goikoak(h.maila, h.id).map(([m, id]) => `<button type="button" data-hautatu="${m}:${id}">${esc(izena(m, id))}</button>`).join(" › ");
  const meta = h.maila === "tamaina" ? T.tamainaTarteak[h.id] : T.mailak[h.maila];
  const aut = autonomikoak();
  el.innerHTML = buruak(esc(izena(h.maila, h.id)), `${meta} · ${aut ? autMeta(k, h) : `${T.congreso} ${INFO[k].izena}`}`, true) +
    `${katea ? `<div class="katea">${katea}</div>` : ""}${aut ? autZatiak(k, h, ra && ak) : ""}${h.maila === "tamaina" ? tamainaZatia(k, h.id) : ""}${r ? kpis(r, ra) + (h.maila === barrutiMaila() ? azkenKutxa(k, h.id) : "") + (state.modua === "blokeak" ? blokeBotoZerrenda(r, ra) : "") + emaitzak(r) + ceraZatia(k, ra && ak, h.maila, h.id, r) : kanpo ? "" : `<p class="hint">${T.sinDatos}</p>`}`;
}
// Botones con data-hautatu (tabla de naciones, migas de pan, ×): eligen esa zona y van a ella; vacío = el Estado
function hautatuBotoia(e) {
  const b = e.target.closest("[data-hautatu]"); if (!b) return;
  if (!b.dataset.hautatu) { hautatu(null); return; }
  const [m, id] = b.dataset.hautatu.split(":"); hautatu({ maila: m, id }, true);
}
$("#edukia").addEventListener("click", hautatuBotoia);
$("#edukia").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) { playGelditu(); hauteskundeaAldatu(b.dataset.k); } });  // las elecciones de una comunidad
$("#crumb").addEventListener("click", hautatuBotoia);
async function fitxaAldatu(f) {
  state.fitxa = f; urlaIdatzi(); orriaZabaldu(true);
  for (const b of document.querySelectorAll("#fitxak [data-fitxa]")) b.setAttribute("aria-selected", b.dataset.fitxa === f);  // primero la pestaña
  await arnasa(); panela();
  if (hov && tip.classList.contains("on")) tip.innerHTML = argibidea(hov.source, String(hov.id));  // el puntero sigue a la pestaña
}
$("#fitxak").addEventListener("click", (e) => { const f = e.target.closest("[data-fitxa]"); if (f) fitxaAldatu(f.dataset.fitxa); });

// ---- evolución (pestaña Bilakaera, como en el Behatokia): cómo ha votado la zona en todas las elecciones ----
// Datos: data/bilakaera/<nivel>.json y data/bilakaera/udalerria/<provincia>.json (prozesatu.py): por zona y elección,
// [participación, %INB, %ESK, [[i, %], …], [[i, escaños], …]] (provincias, + [último escaño, siguiente, votos que le
// faltaron, escaños, tamaño]). Sigue a la capa: partidos (Ganador), bloques, participación (con el Estado de referencia),
// último escaño (Escaños reñidos) y prima del primer partido por tamaño (Circunscripciones). Del Estado al municipio y por
// tamaño de circunscripción: las secciones cambian de un año a otro y no se pueden comparar.
const BILAKAERA = {};  // fichero → datos (o la promesa mientras se cargan)
const BIL_GUTXIENEZ = 4, BIL_LERRO_MAX = 7;  // un partido sale en el gráfico si llega al 4 % alguna vez; como mucho 7
// (autonómicas: data/autonomikoak/bilakaera/, cada zona en sus propias elecciones)
const bilFitxategia = (maila, id = "") => `data/${autonomikoak() ? "autonomikoak/" : ""}bilakaera/${maila === "udalerria" ? `udalerria/${id.slice(0, 2)}` : maila}.json`;
function bilakaeraDatuak(f) {
  if (!BILAKAERA[f]) BILAKAERA[f] = load(f).then((d) => (BILAKAERA[f] = d), (e) => { delete BILAKAERA[f]; throw e; });
  return BILAKAERA[f];
}
// Ficheros que necesita la pestaña: el de la zona y, según la capa, el del Estado (Participación), el de las provincias
// (Escaños reñidos, de una zona mayor) o el de los tamaños (Circunscripciones, en el Estado)
function bilBeharrak(maila, id) {
  const f = [bilFitxategia(maila, id)];
  if (state.modua === "part" && maila !== "estatua" && !autonomikoak()) f.push(bilFitxategia("estatua"));  // autonómicas: sin Estado
  if (state.modua === "lehia" && !autonomikoak() && maila !== "probintzia") f.push(bilFitxategia("probintzia"));
  if (state.modua === "tamaina" && maila === "estatua") f.push(bilFitxategia("tamaina"));
  return f;
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
// aukerak (otras capas): balioa (valor en el texto de cada punto), ardatza (marcas del eje), ymin/ymax/pausoa, ML (margen)
// y, en cada línea, marra (discontinua, de referencia) y koloreak (color de cada punto: quién ganó el último escaño)
function bilGrafikoa(ks, lerroak, aukerak = {}) {
  const W = 340, H = 180, ML = aukerak.ML || 30, MR = 12, MT = 10, MB = 22;
  const balioa = aukerak.balioa || pct, ardatza = aukerak.ardatza || String;
  const x0 = dataZ(ks[0]), x1 = dataZ(ks.at(-1));
  const xs = (k) => (ks.length === 1 ? (ML + W - MR) / 2 : ML + (W - ML - MR) * (dataZ(k) - x0) / (x1 - x0));
  const guztiak = lerroak.flatMap((l) => Object.values(l.b));
  const ymin = aukerak.ymin ?? 0, ymax = aukerak.ymax ?? Math.max(10, Math.ceil(Math.max(...guztiak) / 10) * 10);
  const pausoa = aukerak.pausoa || (ymax - ymin > 50 ? 20 : 10);
  const ys = (v) => MT + (H - MT - MB) * (1 - (v - ymin) / (ymax - ymin));
  let s = "";
  for (let v = ymin; v <= ymax + 1e-9; v += pausoa) {
    s += `<line class="bil-grid" x1="${ML}" x2="${W - MR}" y1="${ys(v)}" y2="${ys(v)}"/><text class="bil-ax" x="${ML - 4}" y="${ys(v) + 3}" text-anchor="end">${ardatza(v)}</text>`;
  }
  let azkenX = -Infinity;  // años: uno por año, y sin pisarse (diciembre de 2015 y junio de 2016 quedan muy cerca)
  for (const k of ks) {
    const x = xs(k); if (x - azkenX < 26 || ks.find((y) => INFO[y].urtea === INFO[k].urtea) !== k) continue;
    s += `<text class="bil-ax" x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${INFO[k].urtea}</text>`; azkenX = x;
  }
  const markatu = aukerak.k || state.k;  // la elección del mapa (autonómicas: la vigente en esa fecha)
  if (ks.includes(markatu)) s += `<line class="bil-unea" x1="${xs(markatu)}" x2="${xs(markatu)}" y1="${MT}" y2="${H - MB}"/>`;
  for (const l of lerroak) {
    const tramoak = [[]];
    for (const k of ks) { if (l.b[k] == null) tramoak.push([]); else tramoak.at(-1).push(k); }
    for (const t of tramoak) if (t.length > 1) s += `<polyline class="bil-l${l.marra ? " marra" : ""}" stroke="${l.kolorea}" points="${t.map((k) => `${xs(k).toFixed(1)},${ys(l.b[k]).toFixed(1)}`).join(" ")}"/>`;
    for (const k of ks) if (l.b[k] != null) s += `<circle class="bil-p" cx="${xs(k).toFixed(1)}" cy="${ys(l.b[k]).toFixed(1)}" r="${l.koloreak ? 4.5 : 3.2}" fill="${(l.koloreak && l.koloreak[k]) || l.kolorea}"><title>${esc(l.izena)} · ${INFO[k].izena}: ${balioa(l.b[k])}</title></circle>`;
  }
  return `<svg class="bil-graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.bilGrafikoa}">${s}</svg>`;
}
// Leyenda bajo el gráfico: cada línea con su valor en la elección del mapa y la variación
const bilLegenda = (lerroak, k, ak, balioa = pct, aldea = { puntuak: true }) => lerroak.map((l) => `<div class="bil-leg">${sq(l.kolorea)}` +
  `<span class="nm">${esc(l.izena)}</span><span class="num">${balioa(l.b[k])}</span><span>${aldaketa(ak && l.b[k] != null && l.b[ak] != null ? l.b[k] - l.b[ak] : null, aldea)}</span></div>`).join("");
const bilTaula = (zutabeak, errenkadak, zenbakiak = []) => `<div class="bil-taula" style="grid-template-columns:auto 1fr${" auto".repeat(zutabeak.length - 2)}">` +
  zutabeak.map((z, i) => `<span class="h${zenbakiak.includes(i) ? " num" : ""}">${z}</span>`).join("") + errenkadak.join("") + "</div>";
const bilGelaxka = (testua, act, num) => `<span class="${[act ? "act" : "", num ? "num" : ""].join(" ").trim()}">${testua}</span>`;
// Participación: la de la zona y, de referencia, la del Estado; el eje, de cerca (de 5 en 5)
function partBilakaera(maila, id, hist, ks, k, ak, nonoiz) {
  const es = maila !== "estatua" && !autonomikoak() && BILAKAERA[bilFitxategia("estatua")].r.ES;  // autonómicas: sin Estado
  // sin participación en alguna elección (Cantabria 2019, autonómicas): hueco en la línea y «–» en la tabla
  const lerroak = [{ izena: izena(maila, id), kolorea: "#B6CFE3", b: Object.fromEntries(ks.filter((x) => hist[x][0] != null).map((x) => [x, hist[x][0]])) }];
  if (es) lerroak.push({ izena: T.estado, kolorea: "#6A8090", marra: true, b: Object.fromEntries(ks.map((x) => [x, es[x][0]])) });
  const v = lerroak.flatMap((l) => Object.values(l.b));
  if (!v.length) return `<p class="hint">${T.autOharrak.partik}</p>`;
  const ymin = Math.floor((Math.min(...v) - 2) / 5) * 5, ymax = Math.ceil((Math.max(...v) + 2) / 5) * 5;
  const aldea = (x) => { const a = ks[ks.indexOf(x) - 1]; return a && hist[x][0] != null && hist[a][0] != null ? hist[x][0] - hist[a][0] : null; };
  const taula = bilTaula([T.hauteskundea, T.part, ...(es ? [T.estado] : [])], ks.slice().reverse().map((x) =>
    bilGelaxka(INFO[x].izena, x === k) + bilGelaxka(`${pct(hist[x][0])} ${aldaketa(aldea(x), { puntuak: true })}`, x === k)
    + (es ? bilGelaxka(pct(es[x][0]), x === k, true) : "")), [2]);
  return `<div class="lbl">${T.partLeg}</div>${bilGrafikoa(ks, lerroak, { ymin, ymax, pausoa: 5, k })}${nonoiz}${bilLegenda(lerroak, k, ak)}` +
    `<div class="lbl">${T.bilHauteskundez}</div>${taula}`;
}
// Escaños reñidos, en una provincia (en las autonómicas, una comunidad: su circunscripción más reñida en cada elección, con
// su nombre): votos que le faltaron a la siguiente para el último escaño; cada punto, del color de quien lo ganó
function lehiaBilakaera(d, hist, ks, k) {
  const z = (x) => hist[x][5], izen = (i) => esc(d.s[i]);
  const barr = (x) => { if (!autonomikoak()) return ""; const [, , , , iz, p] = z(x); return esc(iz ? barrutiIzena(iz) : p ? izena("probintzia", p) : ""); };
  const lerroa = { izena: T.lehiaLeg, kolorea: "#6A8090", b: Object.fromEntries(ks.map((x) => [x, z(x)[2]])), koloreak: Object.fromEntries(ks.map((x) => [x, d.k[z(x)[0]]])) };
  const gehienez = Math.max(...Object.values(lerroa.b)), pausoa = [1000, 2000, 5000, 10000, 20000, 50000].find((p) => gehienez / p <= 5) || 100000;
  const [a, b, falta, n] = z(k);
  const taula = bilTaula([T.hauteskundea, T.bilAzkena, T.bilHurrengoa, T.botoak], ks.slice().reverse().map((x) => { const [i, j, f] = z(x);
    return bilGelaxka(`${INFO[x].izena}${barr(x) ? ` <small>${barr(x)}</small>` : ""}`, x === k) + bilGelaxka(`${sq(d.k[i])} ${izen(i)}`, x === k) + bilGelaxka(`${sq(d.k[j])} ${izen(j)}`, x === k) + bilGelaxka(fmtZutabea(f), x === k, true); }), [3]);
  return `<div class="lbl">${T.lehiaLeg}</div>${bilGrafikoa(ks, [lerroa], { ymax: Math.ceil(gehienez / pausoa) * pausoa, pausoa, balioa: (v) => `${fmtZutabea(v)} ${T.botoak}`, ardatza: fmtZutabea, ML: 44 })}` +
    `<div class="lehia">${barr(k) ? `${barr(k)}. ` : ""}${T.azkenaTxt(n, izen(a), izen(b), fmt(falta))}</div><div class="lbl">${T.bilHauteskundez}</div>${taula}`;
}
// Escaños reñidos, en una zona mayor del Congreso (Estado, nación, comunidad, tamaño): cuántos últimos escaños se decidieron
// por pocos votos
const LEHIA_MUGAK = [[1000, "#E0704F"], [5000, "#EFC48F"]];
function lehiaBatura(maila, id, ks, k, ak, nonoiz) {
  const P = BILAKAERA[bilFitxategia("probintzia")].r, Z = (p, x) => P[p][x];
  const barruan = (p, x) => maila === "estatua" || (maila === "nazioa" && GOIK.autonomia[GOIK.probintzia[p]] === id)
    || (maila === "autonomia" && GOIK.probintzia[p] === id) || (maila === "tamaina" && Z(p, x)[5][4] === id);
  const probak = (x) => Object.keys(P).filter((p) => Z(p, x) && Z(p, x)[5] && barruan(p, x));
  const lerroak = LEHIA_MUGAK.map(([m, kol]) => ({ izena: `≤ ${fmtZutabea(m)} ${T.botoak}`, kolorea: kol, b: Object.fromEntries(ks.map((x) => [x, probak(x).filter((p) => Z(p, x)[5][2] <= m).length])) }));
  const gehienez = Math.max(2, ...lerroak.flatMap((l) => Object.values(l.b))), pausoa = gehienez > 10 ? 5 : gehienez > 4 ? 2 : 1;
  const gertuena = (x) => probak(x).sort((p, q) => Z(p, x)[5][2] - Z(q, x)[5][2])[0];
  const taula = bilTaula([T.hauteskundea, T.bilGertuena, ...LEHIA_MUGAK.map(([m]) => `≤ ${fmtZutabea(m)}`)], ks.slice().reverse().map((x) => { const g = gertuena(x);
    return bilGelaxka(INFO[x].izena, x === k) + bilGelaxka(g ? `${esc(izena("probintzia", g))} <small>${fmtZutabea(Z(g, x)[5][2])}</small>` : "–", x === k)
      + lerroak.map((l) => bilGelaxka(`${l.b[x]} / ${probak(x).length}`, x === k, true)).join(""); }), [2, 3]);
  return `<div class="lbl">${T.bilLehiaBatura}</div>${bilGrafikoa(ks, lerroak, { ymax: Math.ceil(gehienez / pausoa) * pausoa, pausoa, balioa: String })}${nonoiz}` +
    `${bilLegenda(lerroak, k, ak, String, { berdina: false })}<div class="lbl">${T.bilHauteskundez}</div>${taula}`;
}
// Circunscripciones, en el Estado: la prima del primer partido de cada tamaño (% de escaños − % de votos), lo que explica el tamaño
function primaBilakaera(ks, k, ak, nonoiz) {
  const t = BILAKAERA[bilFitxategia("tamaina")];
  const lehena = (h) => { const [i, p] = h[3][0], n = h[4].reduce((s, [, m]) => s + m, 0), e = (h[4].find(([j]) => j === i) || [i, 0])[1];
    return { i, p, eser: n ? 100 * e / n : 0, prima: n ? Math.round((100 * e / n - p) * 10) / 10 : null }; };
  const lerroak = TAMAINAK.map((g) => ({ izena: T.tamainaLabur[g], kolorea: TAMAINA_KOLOREA[g], b: Object.fromEntries(ks.map((x) => [x, lehena(t.r[g][x]).prima])) }));
  const v = lerroak.flatMap((l) => Object.values(l.b));
  const ymin = Math.min(0, Math.floor(Math.min(...v) / 5) * 5), ymax = Math.ceil(Math.max(...v) / 5) * 5;
  const pts = (x) => `${x > 0 ? "+" : ""}${ptu(x)}`;
  const taula = bilTaula([T.hauteskundea, ...TAMAINAK.map((g) => T.tamainaLabur[g])], ks.slice().reverse().map((x) => bilGelaxka(INFO[x].izena, x === k) +
    TAMAINAK.map((g) => { const l = lehena(t.r[g][x]); return bilGelaxka(`${sq(t.k[l.i])} ${esc(t.s[l.i])} <small>${pts(l.prima)}</small>`, x === k); }).join("")));
  return `<div class="lbl">${T.bilPrimaLbl}</div>${bilGrafikoa(ks, lerroak, { ymin, ymax, pausoa: 5, balioa: (x) => `${pts(x)} ${T.puntos}` })}${nonoiz}` +
    `${bilLegenda(lerroak, k, ak, (x) => `${pts(x)}`)}<div class="lbl">${T.bilHauteskundez}</div>${taula}`;
}
// La pestaña: gráfico, cada línea con su % en la elección del mapa y la variación, y la tabla elección a elección
function bilakaeraOrria(h) {
  const [maila, id] = h ? [h.maila, h.id] : ["estatua", "ES"], aut = autonomikoak();
  const buru = buruak(h ? esc(izena(maila, id)) : T.estado, `${T.bilakaera} · ${aut ? T.autonomicas : `${T.congreso} ${INFO[KK[0]].urtea}–${INFO[KK.at(-1)].urtea}`}`, !!h);
  if (maila === "sekzioa") return buru + `<p class="hint">${T.bilSekzioa}</p>${joateko("udalerria", sekUdalerria(id))}`;
  if (aut && maila === "estatua") return buru + `<p class="hint">${T.autBilEstatua}</p>`;  // autonómicas: sin total del Estado
  const falta = bilBeharrak(maila, id).filter((f) => !BILAKAERA[f] || BILAKAERA[f] instanceof Promise);
  if (falta.length) {
    Promise.all(falta.map(bilakaeraDatuak)).then(() => { if (state.fitxa === "bilakaera") panela(); },
      () => { const p = $("#edukia .hint"); if (state.fitxa === "bilakaera" && p) p.textContent = T.error; });
    return buru + `<p class="hint">${T.cargando}</p>`;
  }
  const d = BILAKAERA[bilFitxategia(maila, id)];
  const hist = d.r[id]; if (!hist) return buru + `<p class="hint">${T.sinDatos}</p>`;
  // las elecciones de la zona, en orden; la del mapa (autonómicas: la última de la zona hasta la fecha elegida)
  const ks = aut ? Object.keys(hist).sort((a, b) => dataZ(a) - dataZ(b)) : KK.filter((k) => hist[k]);
  const k0 = ks.filter((x) => hilZ(x) <= (hautaketa(state.k) ? hilZ(state.k) : state.une)).at(-1) ?? ks.at(-1), ak0 = ks[ks.indexOf(k0) - 1];
  const nonoiz = `<div class="lbl">${INFO[k0].izena}${ak0 ? ` · ▲▼ ${T.respectoA} ${INFO[ak0].izena}` : ""}</div>`;
  if (state.modua === "part") return buru + partBilakaera(maila, id, hist, ks, k0, ak0, nonoiz);
  if (state.modua === "lehia") {
    if (eserlekurikEz(maila)) return buru + eserlekurikEzZatia(maila, id);
    return buru + (maila === barrutiMaila() ? lehiaBilakaera(d, hist, ks, k0) : lehiaBatura(maila, id, ks, k0, ak0, nonoiz));
  }
  if (state.modua === "tamaina" && maila === "estatua") return buru + primaBilakaera(ks, k0, ak0, nonoiz);
  const lerroak = bilLerroak(d, hist, ks);
  const k = k0, ak = ak0;
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
  return buru + `<div class="lbl">${T.bilEhunekoa}</div>${bilGrafikoa(ks, lerroak, { k })}` +
    `<div class="lbl">${INFO[k].izena}${ak ? ` · ▲▼ ${T.respectoA} ${INFO[ak].izena}` : ""}</div>${legenda}<div class="lbl">${T.bilHauteskundez}</div>${taula}` +
    (CERA_MAILAK.has(maila) ? `<p class="hint">${T.bilCera}</p>` : "");
}

// ---- controles ----
// Elección: la línea de tiempo, Q/E, ▶, el buscador y los botones del panel pasan por aquí. Elegida en el buscador (joan),
// en las autonómicas el mapa va a sus comunidades, y la zona elegida se deja si no está en lo elegido
async function hauteskundeaAldatu(k, joan = false, une = null) {
  if (!ikusgarria(k, state.mota)) return;
  state.k = k; state.une = une ?? (hautaketa(k) ? hilZ(k) : muga(hilZ(k))); lerroaMargotu();
  if (joan && hautaketa(k)) {
    if (state.hautatua && kanpoan(k, state.hautatua.maila, state.hautatua.id)) state.hautatua = null;
    autIkusi(k);
  }
  await arnasa(); await eguneratu(); if (state.k === k) panela();  // primero la línea de tiempo, luego el mapa y el panel
}
// Las comunidades elegidas en el buscador, en el hueco libre del mapa (Canarias, aparte: si votan también otras, la
// Península, como al empezar)
function autIkusi(k) {
  let ccak = Object.keys(INFO[k].osagaiak); if (!ccak.length) return;
  if (ccak.length > 1) ccak = ccak.filter((c) => c !== "05");
  const b = ccak.map((c) => AUT_BBOX[c]).reduce((a, x) => [Math.min(a[0], x[0]), Math.min(a[1], x[1]), Math.max(a[2], x[2]), Math.max(a[3], x[3])]);
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad(), maxZoom: 7.9 });  // como mucho, provincias
}
// Capa del mapa (W, M, T, B, D); en las autonómicas, sin Bloques ni Circunscripciones
async function moduaAldatu(m) {
  if (!MODUAK[state.mota].includes(m)) return;
  state.modua = m; document.querySelectorAll("[data-modua]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.modua === m));
  $("#maila").disabled = BARRUTIKA.includes(m);  // con «Escaños reñidos», provincias (autonómicas: comunidades)
  legenda(); await arnasa(); eguneratu(); panela();  // primero el botón y la leyenda, luego el mapa y el panel
}
document.querySelectorAll("[data-modua]").forEach((b) => b.addEventListener("click", () => moduaAldatu(b.dataset.modua)));
// Tipo de elección (A): Congreso o autonómicas. Se pasa a la línea de tiempo del otro tipo, en la misma fecha (la primera,
// si no hay ninguna antes); lo que el otro tipo no tiene (capas, nivel de nación, naciones y tamaños elegidos) vuelve a lo
// de siempre
async function motaAldatu(mota) {
  if (mota === state.mota || !MOTAK[mota]) return;
  playGelditu();
  const m = state.une;
  state.mota = mota; KK = MOTAK[mota];
  state.une = muga(m); state.k = indarrean(state.une);
  if (!MODUAK[mota].includes(state.modua)) state.modua = "irabazlea";
  if (!FITXAK[mota].includes(state.fitxa)) state.fitxa = "emaitzak";
  if (autonomikoak() && state.maila === "nazioa") state.maila = "auto";
  if (state.hautatua && autonomikoak() && ["tamaina", "nazioa"].includes(state.hautatua.maila)) state.hautatua = null;
  motaKontrolak(); lerroaMargotu(); legenda();
  await arnasa(); await eguneratu(); nabarmendu(); panela();
}
// Los controles de cada tipo: las capas que no tiene (las autonómicas, Bloques y Circunscripciones), ocultas, y el nivel
// de nación, que las autonómicas tampoco tienen
function motaKontrolak() {
  document.querySelectorAll("[data-mota]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mota === state.mota));
  document.querySelectorAll("[data-modua]").forEach((b) => {
    b.hidden = !MODUAK[state.mota].includes(b.dataset.modua);
    b.setAttribute("aria-pressed", b.dataset.modua === state.modua);
  });
  document.querySelectorAll("#fitxak [data-fitxa]").forEach((b) => { b.hidden = !FITXAK[state.mota].includes(b.dataset.fitxa); });
  const naz = $("#maila option[value=nazioa]"); naz.hidden = naz.disabled = autonomikoak();
  $("#maila").value = state.maila; $("#maila").disabled = BARRUTIKA.includes(state.modua);
  $("#dlbilatu").placeholder = autonomikoak() ? T.dataBilatuPhAut : T.dataBilatuPh;
}
document.querySelectorAll("[data-mota]").forEach((b) => b.addEventListener("click", () => motaAldatu(b.dataset.mota)));
$("#maila").addEventListener("change", (e) => { state.maila = e.target.value; eguneratu(); });
// Leyenda de la capa (y, con «Bloques», del nivel que se ve: último escaño en provincias, votos en el resto)
function legenda() {
  if (state.modua === "tamaina") {  // los tres tamaños, con su tramo de escaños
    $("#legenda").innerHTML = `<div class="lbl">${T.tamainaLeg}</div><div class="legend-azp">${T.tamainaLegAzp}</div><div class="legend">` +
      TAMAINAK.map((t) => `<div class="li">${sq(TAMAINA_KOLOREA[t])}${T.tamainaLabur[t]} <span class="zk">${T.tamainaTarteak[t]}</span></div>`).join("") + "</div>";
    return;
  }
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
    // autonómicas a nivel de sección: también los municipios de las provincias sin secciones (se suman por partido)
    const mailak = mailaAktiboa() === "sekzioa" && azkenAzpian ? ["sekzioa", "udalerria"] : [mailaAktiboa()];
    const batera = new Map();
    for (const m of mailak) for (const [f, x] of irabazleakMailaka[m] || new Map()) {
      const g = batera.get(f) || { kol: x.kol, n: 0, izenak: new Map() };
      g.n += x.n; for (const [iz, n] of x.izenak) g.izenak.set(iz, (g.izenak.get(iz) || 0) + n); batera.set(f, g);
    }
    const g = [...batera.values()].sort((a, b) => b.n - a.n).slice(0, 9);
    const izen = (x) => [...x.izenak].sort((a, b) => b[1] - a[1])[0][0];
    // el nivel en el título (no en el subtítulo, que en el móvil no se ve): «Primera fuerza por nivel: provincia»
    const lbl = `${T.irabazleaLeg}: <span class="maila">${mailak.map((m) => T.mailak[m].toLocaleLowerCase(HIZK)).join(" · ")}</span>`;
    $("#legenda").innerHTML = `<div class="lbl">${lbl}</div><div class="legend">${g.map((x) => `<div class="li">${sq(x.kol)}${esc(izen(x))} <span class="zk">${fmt(x.n)}</span></div>`).join("")}</div>`;
    return;
  }
  const [bins, izen, lab] = state.modua === "part"
    ? [PART_BINS, T.partLeg, ["≤ 58 %", "58 – 64 %", "64 – 70 %", "70 – 76 %", "> 76 %"]]
    : [LEHIA_BINS, T.lehiaLeg, [`≤ ${fmtZutabea(1000)} ${T.botoak}`, ...[[1000, 5000], [5000, 10000], [10000, 20000]].map(([a, b]) => `${fmtZutabea(a)} – ${fmtZutabea(b)}`), `> ${fmtZutabea(20000)}`]];
  $("#legenda").innerHTML = `<div class="lbl">${izen}</div>${state.modua === "lehia" ? `<div class="legend-azp">${autonomikoak() ? T.barrutikaAut : T.barrutika}</div>` : ""}<div class="legend">${bins.map(([, c], i) => `<div class="li">${sq(c)}${lab[i]}</div>`).join("")}<div class="li">${sq(NODATA)}${T.sinDatos}</div></div>`;
}
// Buscador de municipios (nombres en la lengua local)
// También con las otras formas del nombre (izenak.json, 4.º campo): «Gijón» lleva a Xixón y «Pamplona» a Iruñea
// La lista (8.100 municipios y sus otros nombres) se arma cuando llegan los nombres: al tocar el buscador, si no antes
let udalak = [];
const izenGuztiak = ([, [n, , , besteak = []]]) => [n, ...besteak];
function bilatzaileaBete() {
  udalak = Object.entries(IZENAK.udalerria).sort((a, b) => a[1][0].localeCompare(b[1][0], LOKALEA));
  $("#udalerriak").innerHTML = udalak.flatMap(izenGuztiak).map((n) => `<option value="${esc(n)}"></option>`).join("");
}
$("#bilatu").addEventListener("focus", () => aurretik(udalIzenakLortu()));
$("#bilatu").addEventListener("change", (e) => {
  const v = e.target.value.trim().toLowerCase(); if (!v) return;
  const u = udalak.find((x) => izenGuztiak(x).some((n) => n.toLowerCase() === v)) || udalak.find((x) => izenGuztiak(x).some((n) => n.toLowerCase().includes(v)));
  if (u) { map.once("moveend", () => hautatu({ maila: "udalerria", id: u[0] })); map.flyTo({ center: [u[1][1], u[1][2]], zoom: 10.2 }); }
});
// Vista: Península (0) o Canarias (C), en el hueco que dejan los paneles
const ikusi = (b) => map.fitBounds(b, { padding: pad() });
$("#penintsula").addEventListener("click", () => ikusi(PENINSULA));
$("#kanariak").addEventListener("click", () => ikusi(KANARIAK));
// Satélite (S): encender / apagar (con él, los colores dejan ver el terreno)
function sateliteaAldatu() {
  state.satelitea = !state.satelitea; $("#satelitea").setAttribute("aria-pressed", state.satelitea);
  for (const l of ["sat", "orto"]) map.setLayoutProperty(l, "visibility", state.satelitea ? "visible" : "none");
  ortoKreditua();
  map.setLayoutProperty("lurra", "visibility", state.satelitea ? "none" : "visible");  // comunales: se ve el terreno
  if (!state.satelitea) aurretik(lurraLortu());
  for (const m of MAILAK) map.setPaintProperty(m + "-fill", "fill-opacity", opakutasuna());
  urlaIdatzi();
}
$("#satelitea").setAttribute("aria-pressed", state.satelitea);
$("#satelitea").addEventListener("click", sateliteaAldatu);
// Crédito de las ortofotos a pie de mapa (lo pide la licencia del IGN): solo cuando se ven
function ortoKreditua() { $("#ortokreditua").hidden = !(state.satelitea && map.getZoom() >= ORTO_ZOOM); }
map.on("zoom", ortoKreditua);
ortoKreditua();
// Móvil: hoja de resultados que se despliega
function orriaZabaldu(z) {
  if (!mugikorra()) return;
  $("#panela").classList.toggle("zabalik", z); $("#app").classList.toggle("orria-zabalik", z); $("#heldulekua").setAttribute("aria-expanded", z);
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

// ---- línea de tiempo (abajo; en el móvil, arriba): el estado en cada momento (en las autonómicas, cada comunidad con su
// elección vigente), a escala del tiempo y mes a mes, sin marcas de las elecciones: el mapa cambia al pasar por una; ▶
// avanza un mes cada PLAY_MS. A la derecha, el buscador de elecciones: en las autonómicas, un día (todas las que votaron) o
// una comunidad, y el mapa enseña solo eso, hasta volver a la línea de tiempo (× o moverla) ----
const PLAY_MS = 80;  // ▶: tiempo en cada mes (de 2011 a hoy, unos quince segundos)
const pista = $("#denboralerroa .dl-pista");
const dlKoka = (m) => Math.min(1, Math.max(0, (m - DLM0()) / Math.max(1, DLM1() - DLM0())));  // mes → posición (0–1)
const dlX = (m) => `${(dlKoka(m) * 100).toFixed(2)}%`;
// Debajo de la fecha: la elección del Congreso que se ve; en las autonómicas, la línea de tiempo (cada comunidad con su
// parlamento vigente) o lo elegido en el buscador (las elecciones de ese día o las de una sola comunidad)
function dlOsaera(k) {
  if (!autonomikoak()) return T.osaeraKong(INFO[k].izena);
  if (!hautaketa(k)) return T.osaeraAut;
  const izenak = dlIzenak(k);
  return k.includes(".") ? T.bakarrik(izenak[0]) : `${T.egunekoak} · ${izenak.join(", ")}`;
}
let playT = null;  // ▶ en marcha: temporizador hasta el mes siguiente
function lerroaMargotu() {
  // los años, cada uno en su enero, con al menos 34 px entre etiquetas («2011» ocupa unos 26)
  const w = pista.clientWidth || 600;
  let urteak = "", azkena = -Infinity;
  for (let y = Math.ceil(DLM0() / 12); y * 12 <= DLM1(); y++) {
    const x = dlKoka(y * 12) * w, ikusi = x - azkena >= 34 && w - x >= 13;
    if (ikusi) azkena = x;
    urteak += `<span class="dl-urtea" style="left:${dlX(y * 12)}">${ikusi ? y : ""}</span>`;
  }
  const x = dlX(state.une);
  pista.innerHTML = `<span class="dl-ardatza"></span>${urteak}<span class="dl-kurtsorea" style="left:${x}"></span><span class="dl-heldulekua" role="slider"
    tabindex="0" style="left:${x}" aria-label="${T.dataAukeratu}" aria-valuemin="0" aria-valuemax="${DLM1() - DLM0()}" aria-valuenow="${muga(state.une) - DLM0()}"
    aria-valuetext="${hilIzena(state.une)}"></span>`;
  $("#denboralerroa").classList.toggle("hautaketa", hautaketa(state.k));
  $("#dlitzuli").hidden = !hautaketa(state.k);
  $("#denboralerroa .dl-data").textContent = hautaketa(state.k) ? INFO[state.k].izena : hilIzena(state.une);
  $("#denboralerroa .dl-osaera").textContent = dlOsaera(state.k);
  $("#dlplay").textContent = playT ? "❚❚" : "▶"; $("#dlplay").setAttribute("aria-label", playT ? T.gelditu : T.erreproduzitu);
  if (dlHautatu.open) dlZerrendaMargotu();
}
// El mes m en la línea de tiempo: el triángulo y la fecha; si con él cambia la elección vigente (o se sale de lo elegido
// en el buscador), también el mapa y el panel
function uneJarri(m) {
  m = muga(m);
  const k = indarrean(m);
  if (k !== state.k || hautaketa(state.k)) { hauteskundeaAldatu(k, false, m); return; }
  state.une = m;
  const h = pista.querySelector(".dl-heldulekua");
  pista.querySelector(".dl-kurtsorea").style.left = h.style.left = dlX(m);
  h.setAttribute("aria-valuenow", m - DLM0()); h.setAttribute("aria-valuetext", hilIzena(m));
  $("#denboralerroa .dl-data").textContent = hilIzena(m);
}
// Lo que depende del mes y no de la elección (el enlace, la cabecera del panel), al terminar de moverse
const uneAmaitu = () => { urlaIdatzi(); panela(); };
// Arrastrar (o tocar) la pista: el triángulo sigue al dedo, mes a mes
function puntuanDago(e) {
  const r = pista.getBoundingClientRect();
  return Math.round(DLM0() + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (DLM1() - DLM0()));
}
let arrastaka = false;
pista.addEventListener("pointerdown", (e) => {
  arrastaka = true; playGelditu(); pista.setPointerCapture(e.pointerId); uneJarri(puntuanDago(e)); e.preventDefault();
});
pista.addEventListener("pointermove", (e) => { if (arrastaka) uneJarri(puntuanDago(e)); });
pista.addEventListener("pointerup", (e) => { if (!arrastaka) return; arrastaka = false; uneJarri(puntuanDago(e)); uneAmaitu(); });
pista.addEventListener("pointercancel", () => { arrastaka = false; uneAmaitu(); });
pista.addEventListener("keydown", (e) => {  // en el triángulo: ← → un mes (con Mayús, un año); Re Pág / Av Pág, un año; Inicio / Fin
  if (!e.target.classList.contains("dl-heldulekua")) return;
  const urtea = e.shiftKey ? 12 : 1;
  const pausoak = { ArrowLeft: -urtea, ArrowRight: urtea, PageDown: -12, PageUp: 12 };
  if (!(e.key in pausoak) && !["Home", "End"].includes(e.key)) return;
  e.preventDefault(); playGelditu();
  uneJarri(e.key === "Home" ? DLM0() : e.key === "End" ? DLM1() : state.une + pausoak[e.key]);
  uneAmaitu(); pista.querySelector(".dl-heldulekua").focus();
});
function playGelditu() { clearTimeout(playT); playT = null; lerroaMargotu(); }
function playUrratsa() {
  if (state.une >= DLM1()) { playGelditu(); uneAmaitu(); return; }
  uneJarri(state.une + 1);
  const hurrengoa = KK.find((k) => hilZ(k) > state.une); if (hurrengoa) aurretik(prestatu(hurrengoa));  // la siguiente, cargando ya
  playT = setTimeout(playUrratsa, PLAY_MS);
}
$("#dlplay").addEventListener("click", () => {
  if (playT) { playGelditu(); uneAmaitu(); return; }
  // desde lo elegido en el buscador, en su momento de la línea de tiempo; desde el final, por el principio
  if (hautaketa(state.k)) uneJarri(muga(hilZ(state.k))); else if (state.une >= DLM1()) uneJarri(DLM0());
  playT = setTimeout(playUrratsa, PLAY_MS); lerroaMargotu();
});
$("#dlitzuli").addEventListener("click", () => uneJarri(muga(hilZ(state.k))));  // vuelta a la línea de tiempo, en ese momento
// La anterior y la siguiente (Q, E): en la línea de tiempo, el estado de antes o de después; con lo elegido en el
// buscador, el día con elecciones de antes o de después, o la elección anterior o siguiente de la misma comunidad
function aldamenekoa(k, d) {
  let l = KK;
  if (hautaketa(k)) { const cca = k.split(".")[1]; l = cca ? AUT_HK[cca].map((hk) => `e${hk}.${cca}`) : AUT.egunak.map((h) => h.k); }
  const i = l.indexOf(k); return l[Math.max(0, Math.min(l.length - 1, i + d))];
}

// El buscador: todas las elecciones del tipo, de la más reciente a la más antigua; se busca por el mes (abreviado o
// entero), el año y, en las autonómicas, la comunidad (también con sus otros nombres: Galicia, País Vasco, Navarra…), sin
// tildes ni mayúsculas. En las autonómicas, los días con elecciones y, si se busca una comunidad, cada elección suya
const dlHautatu = $("#dlhautatu"), dlBilatu = $("#dlbilatu"), dlZerrenda = $("#dlzerrenda");
// Las comunidades de una vista de las autonómicas, por orden alfabético (en el Congreso, ninguna)
const dlIzenak = (k) => (autKoa(k) ? autCcak(k).map((c) => izena("autonomia", c)) : []);
const komGakoa = (cca) => izenGakoa([izena("autonomia", cca), ...(AUT.izenak[cca] || [])].join(" "));
// Lo que se busca de cada elección: el mes (abreviado y entero), el año y sus comunidades
function dlGakoa(k) {
  const h = INFO[k], m = +h.hila - 1, ccak = h.osagaiak ? Object.keys(h.osagaiak) : [];
  return izenGakoa([T.hilak[m], T.hilabeteak[m], h.urtea, ...ccak.map(komGakoa)].join(" "));
}
function dlAukerak() {
  const hitzak = izenGakoa(dlBilatu.value).split(/\s+/).filter(Boolean), denak = (g) => hitzak.every((x) => g.includes(x));
  if (!autonomikoak()) return KK.slice().reverse().filter((k) => denak(dlGakoa(k)));
  const bat = hitzak.length ? AUT_BAT.slice().reverse().filter((h) => denak(dlGakoa(h.k)) && hitzak.some((x) => komGakoa(h.k.split(".")[1]).includes(x))).map((h) => h.k) : [];
  // un día en que votó una sola comunidad, si ya está su elección, no se repite
  const bakarra = (k) => { const ccak = Object.keys(INFO[k].osagaiak); return ccak.length === 1 && bat.includes(`${k}.${ccak[0]}`); };
  return [...bat, ...AUT.egunak.slice().reverse().map((h) => h.k).filter((k) => denak(dlGakoa(k)) && !bakarra(k))];
}
let dlKs = [], dlFoku = 0;  // las elecciones de la lista (las que encajan con lo buscado) y la resaltada (flechas e Intro)
function dlZerrendaMargotu() {
  dlKs = dlAukerak();
  dlFoku = Math.min(dlFoku, dlKs.length - 1);
  dlZerrenda.innerHTML = dlKs.map((k) => `<button type="button" role="option" id="dl-${k}" class="dl-aukera${k.includes(".") ? " bat" : ""}" data-k="${k}" tabindex="-1" aria-selected="${k === state.k}">` +
    `<b>${INFO[k].izena}</b><span>${esc(k.includes(".") ? T.bakarrik(dlIzenak(k)[0]) : dlIzenak(k).join(", "))}</span></button>`).join("") || `<div class="dl-ezer">${T.dataEzDago}</div>`;
  dlFokuaJarri();
}
function dlFokuaJarri() {  // la resaltada, a la vista (sin mover nada más que la lista)
  dlZerrenda.querySelectorAll(".dl-aukera").forEach((b, i) => b.classList.toggle("foku", i === dlFoku));
  const b = dlKs[dlFoku] && document.getElementById(`dl-${dlKs[dlFoku]}`);
  if (!b) { dlBilatu.removeAttribute("aria-activedescendant"); return; }
  dlBilatu.setAttribute("aria-activedescendant", b.id);
  if (b.offsetTop < dlZerrenda.scrollTop) dlZerrenda.scrollTop = b.offsetTop;
  else if (b.offsetTop + b.offsetHeight > dlZerrenda.scrollTop + dlZerrenda.clientHeight) dlZerrenda.scrollTop = b.offsetTop + b.offsetHeight - dlZerrenda.clientHeight;
}
// Al abrir, todas, con la elegida resaltada (si está); se prepara en el momento (el evento toggle llega después: borraría
// lo que ya se hubiera escrito)
function dlIreki() {
  dlBilatu.value = ""; dlHautatu.open = true;
  dlFoku = Math.max(0, dlAukerak().indexOf(state.k)); dlZerrendaMargotu();
  if (matchMedia("(hover: hover)").matches) dlBilatu.focus();  // en el móvil, el teclado no sale hasta tocar el buscador
}
const dlItxi = () => { dlHautatu.open = false; dlHautatu.querySelector("summary").focus(); };
dlHautatu.querySelector("summary").addEventListener("click", (e) => { e.preventDefault(); if (dlHautatu.open) dlItxi(); else dlIreki(); });
dlHautatu.addEventListener("toggle", () => $("#denboralerroa").classList.toggle("zabalik", dlHautatu.open));  // (también al cerrarse desde fuera)
function dlAukeratu(k) { dlItxi(); playGelditu(); hauteskundeaAldatu(k, true); }
dlBilatu.addEventListener("input", () => { dlFoku = 0; dlZerrendaMargotu(); });
dlBilatu.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); dlFoku = Math.max(0, Math.min(dlKs.length - 1, dlFoku + (e.key === "ArrowDown" ? 1 : -1))); dlFokuaJarri(); }
  else if (e.key === "Enter") { e.preventDefault(); if (dlKs[dlFoku]) dlAukeratu(dlKs[dlFoku]); }
  else if (e.key === "Escape") { e.stopPropagation(); dlItxi(); }
});
dlZerrenda.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) dlAukeratu(b.dataset.k); });

// ---- ayuda (?) y teclado, como en el Behatokia ----
function laguntza(ireki) {
  $("#laguntza").hidden = !ireki; $("#laguntzabtn").setAttribute("aria-expanded", ireki);
  if (ireki) $("#laguntzaItxi").focus();
}
$("#laguntzabtn").addEventListener("click", () => laguntza($("#laguntza").hidden));
$("#laguntzaItxi").addEventListener("click", () => laguntza(false));
const LASTERBIDEAK = {
  q: () => { playGelditu(); hauteskundeaAldatu(aldamenekoa(state.k, -1)); },
  e: () => { playGelditu(); hauteskundeaAldatu(aldamenekoa(state.k, 1)); },
  p: () => $("#dlplay").click(),
  f: () => { dlIreki(); dlBilatu.focus(); },
  w: () => moduaAldatu("irabazlea"), m: () => moduaAldatu("lehia"), t: () => moduaAldatu("part"), b: () => moduaAldatu("blokeak"),
  d: () => moduaAldatu("tamaina"), a: () => motaAldatu(autonomikoak() ? "kongresua" : "autonomikoak"),
  k: () => { const f = FITXAK[state.mota]; fitxaAldatu(f[(f.indexOf(state.fitxa) + 1) % f.length]); },  // la siguiente pestaña del tipo
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
motaKontrolak();  // tipo de elección, capa y pestaña: pueden venir del enlace
legenda(); lerroaMargotu();
async function hasi() {
  if (!state.satelitea) aurretik(lurraLortu());
  await eguneratu();
  if (state.hautatua) hautatu(state.hautatua); else panela();
}
if (estiloaPrest) hasi(); else map.once("style.load", hasi);
map.on("moveend", eguneratu);
let etiketaZain = false;  // mientras el mapa se mueve, los nombres se rehacen una vez por fotograma
map.on("move", () => { if (!etiketaZain) { etiketaZain = true; requestAnimationFrame(() => { etiketaZain = false; etiketak(); }); } });
