// ---- Folioa: el resumen de la zona en un folio A4 (botón «↓ PDF» de la cabecera del panel) ----
// Dos páginas con lo que la web sabe de la zona elegida: quién es, su última elección al Congreso y la autonómica
// (una, o una fila por comunidad si la zona tiene varias) y en qué se aparta de lo que la rodea; y cómo ha cambiado
// desde 2011 y de qué está hecha, con un mapa de sus piezas un escalón por debajo (Estado → naciones, Catalunya →
// comunidades, Andalucía → provincias, Sevilla (provincia) → municipios, Sevilla (municipio) → secciones), cada una
// del color de quien gana en ella. Las cifras son las que ya publica la web: se leen de data/ como las lee el panel,
// no se recalculan.
// El folio va en tema claro (es el que se imprime) y con las letras del sitio.
// jsPDF y las letras se cargan solo al pulsar: son 530 kB que no hacen falta para ver el mapa.
// Es el gemelo del folio del Hauteskunde Behatokia, con los niveles de aquí.

// ---- paleta (tema claro de tema.css) y medidas del folio, en mm ----
const TINTA = [0x16, 0x22, 0x2C], TINTA_HI = [0x06, 0x0D, 0x13], LAUSO = [0x41, 0x57, 0x67], ILUN = [0x55, 0x6B, 0x7B];
const MARRA = [0xA3, 0xB6, 0xC5], MARRA_2 = [0xC6, 0xD4, 0xDD], URREA = [0xA9, 0x76, 0x08];
const PANELA = [0xF4, 0xF7, 0xF9], GORA = [0x3A, 0x74, 0x0C], BEHERA = [0xA8, 0x3A, 0x1A];
const GRISA = "#8A8F94";
const W = 210, H = 297, ERTZA = 14, ZAB = W - 2 * ERTZA;
const C_MARJINA = 1;  // margen interior de cada celda, como el de fpdf2: así el folio del navegador cuadra con el de notebooks/
// Lo de dentro: del Estado las naciones, de una nación sus comunidades, de una comunidad sus provincias, de una
// provincia sus municipios y de un municipio sus secciones censales
const BARNEKOA = { estatua: "nazioa", nazioa: "autonomia", autonomia: "probintzia", probintzia: "udalerria", udalerria: "sekzioa" };
const GOIKOA = { udalerria: "probintzia", probintzia: "autonomia", autonomia: "nazioa", nazioa: "estatua" };
const KANARIAK_LON = -11;  // al oeste de aquí solo están las Canarias: van aparte, como en todos los mapas del Estado
const SEK_GEHIENEZ = 3000;  // más secciones que esto no se dibujan: el folio tardaría y no se distinguirían

// ---- lo que pasa app.js: los datos y las funciones de la web, para no repetir ninguna cuenta ----
let T, HIZK, LOKALEA, fmt, INDEX, AUT, GOIK, INFO, GEO, DATA_SYNC, state, load, huellaz, izena, sekUdalerria,
  sekUrtea, prestatu, erregistroa, ceraErregistroa, eserlekuak, sekzioDatuak, autHauteskundeFitx, autUdalerriak,
  udalIzenakLortu;
function testuingurua(ctx) {
  ({ T, HIZK, LOKALEA, fmt, INDEX, AUT, GOIK, INFO, GEO, DATA_SYNC, state, load, huellaz, izena, sekUdalerria,
    sekUrtea, prestatu, erregistroa, ceraErregistroa, eserlekuak, sekzioDatuak, autHauteskundeFitx, autUdalerriak,
    udalIzenakLortu } = ctx);
}

let TRESNAK = null;
async function tresnak() {
  if (TRESNAK) return TRESNAK;
  const [, letrak] = await Promise.all([import(huellaz("./vendor/jspdf.umd.min.js")), import(huellaz("./vendor/pdf-letrak.js"))]);
  const jsPDF = (window.jspdf || {}).jsPDF;
  if (!jsPDF) throw new Error("jsPDF");
  TRESNAK = { jsPDF, letrak: letrak.default };
  return TRESNAK;
}

// ---- la zona del folio: la elegida en el mapa (una sección, su municipio) o el Estado ----
function folioZona() {
  const h = state.hautatua;
  if (!h) return { maila: "estatua", id: "ES", izena: izena("estatua", "ES") };
  if (h.maila === "tamaina") return null;  // los grupos de circunscripciones no son un territorio: no tienen folio
  const maila = h.maila === "sekzioa" ? "udalerria" : h.maila;
  const id = h.maila === "sekzioa" ? sekUdalerria(h.id) : h.id;
  return { maila, id, izena: izena(maila, id) };
}

// ---- los datos: los mismos ficheros que sirve la web, leídos como los lee el panel ----
const azkena = () => INDEX.hauteskundeak.at(-1).k;  // la última elección al Congreso (la que abre el mapa)
const hautIzena = (k) => T.folio.hautIzena(T.hilabeteak[+INFO[k].hila - 1], INFO[k].urtea);
const GEO_CACHE = {};
const geoLortu = (u) => (GEO_CACHE[u] ??= load(u).catch(() => null));

function goikoaZein(maila, id) {
  if (maila === "udalerria") return id.slice(0, 2);
  if (maila === "probintzia") return GOIK.probintzia[id] || "";
  if (maila === "autonomia") return GOIK.autonomia[id] || "";
  return maila === "nazioa" ? "ES" : "";
}
// La cadena de zonas de encima: municipio → provincia → comunidad → nación → Estado (siempre la del territorio,
// aunque se esté viendo el mapa de las autonómicas, que no tiene naciones)
function gurasoak(z) {
  const out = [];
  let maila = z.maila, id = z.id;
  while (maila !== "estatua" && GOIKOA[maila]) {
    const berria = GOIKOA[maila];
    id = goikoaZein(maila, id) || "ES";
    maila = berria;
    out.push({ maila, id, izena: izena(maila, id) });
  }
  return out;
}

// Las zonas de un nivel en una elección (los municipios y las secciones van en su propio fichero)
function mailaIdak(k, maila, cpro) {
  const d = DATA_SYNC[k];
  if (!d) return [];
  const f = maila === "sekzioa" ? d.sek[cpro] : d[maila];
  return f && !(f instanceof Promise) && f.r ? Object.keys(f.r) : [];
}
// ¿Esa zona de `maila` está dentro de la zona del folio?
function barnekoaDa(z, maila, id) {
  if (z.maila === "estatua") return true;
  const cpro = maila === "udalerria" ? id.slice(0, 2) : maila === "probintzia" ? id : "";
  if (z.maila === "probintzia") return cpro === z.id;
  const cca = cpro ? GOIK.probintzia[cpro] || "" : maila === "autonomia" ? id : "";
  if (z.maila === "autonomia") return cca === z.id;
  if (z.maila === "nazioa") return (GOIK.autonomia[cca] || "") === z.id;
  return false;
}
// El nivel de dentro y sus zonas. Si solo sale una pieza (una nación de una sola comunidad, una comunidad de una
// sola provincia), se baja otro escalón: un mapa de una pieza no dice nada
function barneMaila(z, k) {
  let maila = BARNEKOA[z.maila];
  while (maila && maila !== "sekzioa") {
    const idak = mailaIdak(k, maila).filter((i) => barnekoaDa(z, maila, i));
    if (idak.length > 1) return { maila, idak };
    maila = BARNEKOA[maila];
  }
  if (maila === "sekzioa") {
    const idak = mailaIdak(k, "sekzioa", z.id.slice(0, 2)).filter((i) => sekUdalerria(i) === z.id);
    return { maila: "sekzioa", idak: idak.sort() };
  }
  return { maila: "", idak: [] };
}

// ---- autonómicas: una entrada por cada comunidad de la zona, con su última elección ----
const autAutonomiak = () => Object.keys(AUT.datak.at(-1).osagaiak).sort();
// Las comunidades que caen dentro de la zona, de las que eligen parlamento propio (Ceuta y Melilla, no)
function zonakoAutonomiak(z) {
  const autok = autAutonomiak();
  if (z.maila === "estatua") return autok;
  if (z.maila === "nazioa") return autok.filter((a) => GOIK.autonomia[a] === z.id);
  if (z.maila === "autonomia") return autok.includes(z.id) ? [z.id] : [];
  const cca = GOIK.probintzia[z.maila === "udalerria" ? z.id.slice(0, 2) : z.id] || "";
  return autok.includes(cca) ? [cca] : [];
}
// El resultado en una autonómica, montado como los del Congreso (el fichero de la elección, tal como lo sirve la web)
async function autErreg(aut, hk, maila, id) {
  const g = `${aut}-${hk}`;
  const d = await (maila === "udalerria" ? autUdalerriak(g) : autHauteskundeFitx(g)).catch(() => null);
  if (!d) return null;
  const fila = maila === "autonomia" ? d.autonomia : maila === "probintzia" ? (d.probintzia || {})[id] : (d.r || {})[id];
  if (!fila) return null;
  const [censo, votantes, vc, lista] = fila;
  const c = lista.map(([i, v]) => [d.s[i], v, vc ? (100 * v) / vc : null, d.k[i], d.f[i], ""]);
  // los escaños son los del parlamento: solo cuando la zona es la comunidad entera
  const eser = maila === "autonomia" ? (d.eserlekuak || []).map(([i, n]) => [d.s[i], n, d.k[i]]) : [];
  const autIz = izena("autonomia", aut);
  return { censo, votantes, vc, c, part: censo ? (100 * votantes) / censo : null, partE: null, eser, aut, hk, autIzena: autIz,
    izena: T.folio.autIzena(autIz, T.hilabeteak[+hk.slice(4, 6) - 1], hk.slice(0, 4)),
    m: c.length > 1 && c[0][2] != null ? c[0][2] - c[1][2] : null };
}
// Con los datos de la zona cuando la zona está dentro de una sola comunidad (una provincia, un municipio), y con los
// de la comunidad entera cuando la zona la contiene (una nación, el Estado)
async function autErregistroak(z) {
  const autok = zonakoAutonomiak(z), osag = AUT.datak.at(-1).osagaiak;
  const bakarra = autok.length === 1 && (z.maila === "probintzia" || z.maila === "udalerria");
  const out = await Promise.all(autok.map((aut) => (osag[aut]
    ? autErreg(aut, osag[aut], bakarra ? z.maila : "autonomia", bakarra ? z.id : aut) : null)));
  return out.filter((r) => r && r.c.length);  // una comunidad sin candidaturas publicadas no da fila
}

// ---- cómo ha cambiado: lo que la web dibuja en «Evolución» (data/bilakaera/) ----
// Las candidaturas se siguen por partido («f»), no por siglas: ERC-SOBIRANISTES y ERC, o Podemos y SUMAR, son la
// misma línea. El rótulo es el de las siglas más recientes de ese partido.
async function bilakaera(z) {
  const fitx = z.maila === "udalerria" ? `data/bilakaera/udalerria/${z.id.slice(0, 2)}.json` : `data/bilakaera/${z.maila}.json`;
  const d = await load(fitx).catch(() => null);
  const h = d && d.r && d.r[z.id];
  if (!h) return null;
  const izenez = {}, kolorez = {}, filak = [];
  for (const k of Object.keys(h).sort()) {
    const [part, , , botoak] = h[k];
    const fila = { k, part, pct: {} };
    for (const [i, p] of botoak) {
      const alderdia = d.f[i];
      izenez[alderdia] = d.s[i]; kolorez[alderdia] = d.k[i];
      fila.pct[alderdia] = Math.round(((fila.pct[alderdia] || 0) + p) * 100) / 100;
    }
    filak.push(fila);
  }
  return filak.length ? { filak, izenez, kolorez } : null;
}

// ---- en qué se diferencia: puntos de más o de menos que su provincia, su comunidad, su nación y el Estado ----
// Las candidaturas se comparan por partido («f»): en una comunidad el PSOE se llama PSC o PSdeG-PSOE, y en el Estado, PSOE
function aldeak(z, D) {
  if (!D.erreg) return null;
  const nireak = alderdika(D.erreg);
  const izenez = {}, kolorez = {}, nirea = {};
  for (const [f, x] of Object.entries(nireak)) { izenez[f] = x.izena; kolorez[f] = x.kol; nirea[f] = x.pct; }
  const ref = [];
  for (const g of D.gurasoak) {
    if (!g.rec) continue;
    // una zona no se compara consigo misma: Ceuta (municipio, provincia y comunidad) o Madrid (provincia y
    // comunidad) son el mismo territorio y la columna saldría a cero
    if (g.rec.censo === D.erreg.censo && g.rec.votantes === D.erreg.votantes) continue;
    // el nombre se repite (Sevilla, municipio y provincia): se distingue con el nivel
    const etiketa = g.izena !== z.izena ? g.izena : `${g.izena} (${mailaIzena(g.maila).toLowerCase()})`;
    const p = {};
    for (const [f, x] of Object.entries(alderdika(g.rec))) { p[f] = x.pct; if (!izenez[f]) { izenez[f] = x.izena; kolorez[f] = x.kol; } }
    // la comunidad y la nación con el mismo nombre (Andalucía, Madrid…) son el mismo territorio: una sola columna
    const bera = ref.findIndex((r) => r.etiketa === etiketa);
    if (bera >= 0) ref[bera] = { etiketa, p }; else ref.push({ etiketa, p });
  }
  if (!ref.length) return null;
  const alderdiak = Object.keys(nirea).filter((f) => nirea[f] != null).sort((a, b) => nirea[b] - nirea[a]);
  return alderdiak.length ? { alderdiak, nirea, izenez, kolorez, ref } : null;
}

// El reparto de una zona por partido («f»), sumando las candidaturas que son el mismo partido: así se comparan una
// comunidad y el Estado (PSC, PSdeG-PSOE y PSOE) y se junta lo que la fuente da en varias filas (SUMAR, por provincias).
// El rótulo y el color, los de la candidatura mayor de ese partido en esa zona.
function alderdika(rec) {
  const o = {};
  for (const c of rec.c) {
    const x = (o[c[4]] ??= { pct: 0, izena: c[0], kol: c[3], handiena: -1 });
    x.pct = Math.round((x.pct + (c[2] || 0)) * 100) / 100;
    if ((c[2] || 0) > x.handiena) { x.handiena = c[2] || 0; x.izena = c[0]; x.kol = c[3]; }
  }
  return o;
}

const mailaIzena = (maila) => (maila === "estatua" ? izena("estatua", "ES") : T.mailak[maila] || maila);

// Todo lo que el folio necesita, descargado (lo que ya esté en memoria no se vuelve a pedir)
async function datuak(z) {
  const k = azkena();
  await prestatu(k);  // las tablas de esa elección (DATA_SYNC[k]): es de donde lee todo lo demás
  if (z.maila === "udalerria") await sekzioDatuak(k, z.id.slice(0, 2)).catch(() => {});
  const [bil, autok] = await Promise.all([bilakaera(z), autErregistroak(z)]);
  const barne = barneMaila(z, k);
  const D = { k, bil, autok, barne,
    erreg: erregistroa(k, z.maila, z.id),
    cera: ceraErregistroa(k, z.maila, z.id),
    eser: eserlekuak(k, z.maila, z.id),
    gurasoak: gurasoak(z).map((g) => ({ ...g, rec: erregistroa(k, g.maila, g.id) })) };
  // las piezas de dentro, con su resultado: las secciones por código, las demás de más a menos censo
  D.barneak = barne.idak.map((i) => ({ id: i, izena: izena(barne.maila, i), rec: erregistroa(k, barne.maila, i) }))
    .filter((x) => x.rec && x.rec.c.length);
  if (barne.maila !== "sekzioa") D.barneak.sort((a, b) => b.rec.censo - a.rec.censo);
  const [geoak, kanpoa] = await Promise.all([geometriak(z, k, barne, D), kanpoLerroa(z)]);
  D.geoak = geoak; D.ingurua = kanpoa;
  D.aldeak = aldeak(z, D);
  return D;
}

// Los polígonos de lo que compone la zona, con su resultado: [[geometría, registro|null], …]
async function geometriak(z, k, barne, D) {
  const { maila, idak } = barne;
  if (!idak.length) return [];
  const multzoa = new Set(idak);
  const recak = new Map(D.barneak.map((x) => [x.id, x.rec]));  // por id: Madrid tiene 2.450 secciones
  const rec = (id) => recak.get(id) || null;
  let feats = [];
  if (maila === "sekzioa") {
    if (idak.length > SEK_GEHIENEZ) return [];
    const cpro = z.id.slice(0, 2), u = sekUrtea(k, cpro);
    const g = u ? await geoLortu(`geo/sekzioak/${u}/${cpro}.json`) : null;
    feats = ((g && g.features) || []).filter((f) => multzoa.has(String(f.id)));
  } else if (maila === "udalerria") {
    const probak = [...new Set(idak.map((i) => i.slice(0, 2)))].sort();
    const bildumak = await Promise.all(probak.map((p) => geoLortu(`geo/udalerriak/${p}.json`)));
    feats = bildumak.flatMap((b) => (b && b.features) || []).filter((f) => multzoa.has(String(f.id)));
  } else {
    feats = ((GEO[maila] || { features: [] }).features || []).filter((f) => multzoa.has(String(f.id)));
  }
  return feats.map((f) => [f.geometry, rec(String(f.id))]);
}
// El contorno de la zona, para cerrar el mapa
async function kanpoLerroa(z) {
  if (z.maila === "estatua") return [];
  if (z.maila === "udalerria") {
    const g = await geoLortu(`geo/udalerriak/${z.id.slice(0, 2)}.json`);
    return ((g && g.features) || []).filter((f) => String(f.id) === z.id).map((f) => f.geometry);
  }
  return ((GEO[z.maila] || { features: [] }).features || []).filter((f) => String(f.id) === z.id).map((f) => f.geometry);
}

// ---- de cifras y colores a texto ----
const kol = (hex) => { const h = String(hex || GRISA).replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const irabKol = (rec) => (rec && rec.c && rec.c.length ? rec.c[0][3] : GRISA);  // el color de quien gana en esa pieza
const pctT = (v, hamarren = 1) => (v == null ? "—" : v.toLocaleString(LOKALEA, { minimumFractionDigits: hamarren, maximumFractionDigits: hamarren }) + " %");
const ptuT = (v) => (v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString(LOKALEA, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const handiz = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// ---- piezas sueltas (una celda de fpdf2: texto centrado en una caja de 0,42 × el cuerpo) ----
function foT(doc, x, y, s, letra = "Saira", neurria = 9, tinta = TINTA, w = 0, align = "L") {
  doc.setFont(letra, "normal"); doc.setFontSize(neurria); doc.setTextColor(tinta[0], tinta[1], tinta[2]);
  const ww = w || ZAB;
  const xx = align === "R" ? x + ww - C_MARJINA : align === "C" ? x + ww / 2 : x + C_MARJINA;
  doc.text(String(s), xx, y + neurria * 0.21, { baseline: "middle", align: align === "R" ? "right" : align === "C" ? "center" : "left" });
}
function moztu(doc, s, w, letra = "Saira", neurria = 8) {  // recorta a lo ancho que hay, con puntos suspensivos
  doc.setFont(letra, "normal"); doc.setFontSize(neurria);
  s = String(s);
  if (doc.getTextWidth(s) <= w) return s;
  while (s && doc.getTextWidth(s + "…") > w) s = s.slice(0, -1);
  return s.replace(/[ ,·]+$/, "") + "…";
}
function bete(doc, x, y, w, h, tinta) { doc.setFillColor(tinta[0], tinta[1], tinta[2]); doc.rect(x, y, w, h, "F"); }
function marra(doc, x1, y1, x2, y2, tinta = MARRA, zab = 0.3) {
  doc.setDrawColor(tinta[0], tinta[1], tinta[2]); doc.setLineWidth(zab); doc.line(x1, y1, x2, y2);
}
function atala(doc, y, izenburua) {  // título de sección: filete y rótulo en mayúsculas
  marra(doc, ERTZA, y, W - ERTZA, y);
  foT(doc, ERTZA, y + 1.6, String(izenburua).toUpperCase(), "SairaB", 8, URREA);
  return y + 7.5;
}
function barra(doc, x, y, w, h, zatiak) {  // barra de 100 % repartida por candidaturas, con el color de cada una
  const guzt = zatiak.reduce((a, [, p]) => a + (p || 0), 0) || 100;
  for (const [hexa, pct_] of zatiak) {
    const zab = w * (pct_ || 0) / guzt;
    if (zab < 0.6) continue;
    bete(doc, x, y, zab, h, kol(hexa));
    x += zab;
  }
}
function txipa(doc, x, y, hexa, oharra, w = 44, neurria = 7.2) {  // cuadradito de color con su rótulo
  bete(doc, x, y + 0.5, 2.2, 2.2, kol(hexa));
  foT(doc, x + 3.2, y, moztu(doc, oharra, w - 4, "Saira", neurria), "Saira", neurria, LAUSO, w - 4);
}

// ---- el mapa de la zona ----
const eraztunak = (g) => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
const erdigunea = (ez) => {  // la longitud media de unos anillos: sirve para saber si una pieza está en las Canarias
  const pp = ez.flat();
  return pp.length ? pp.reduce((s, p) => s + p[0], 0) / pp.length : 0;
};
// Cada pieza (nación, comunidad, provincia, municipio o sección) con el color de quien gana en ella. Las Canarias,
// en un recuadro aparte: si no, el Atlántico se come el mapa
function mapa(doc, geoak, x, y, w, h, ing) {
  const ezak = geoak.map(([g, r]) => [eraztunak(g), r]);
  const kanariak = ezak.filter(([ez]) => erdigunea(ez) < KANARIAK_LON);
  const nagusia = ezak.filter(([ez]) => erdigunea(ez) >= KANARIAK_LON);
  const ingEz = (ing || []).map(eraztunak);
  if (kanariak.length && nagusia.length) {
    const kw = w * 0.32, kh = h * 0.26;
    marraztu(doc, nagusia, ingEz.filter((e) => erdigunea(e) >= KANARIAK_LON), x, y, w, h - kh - 2);
    doc.setDrawColor(MARRA_2[0], MARRA_2[1], MARRA_2[2]); doc.setLineWidth(0.2);
    doc.rect(x, y + h - kh, kw, kh);
    marraztu(doc, kanariak, [], x + 1, y + h - kh + 1, kw - 2, kh - 2);
  } else {
    marraztu(doc, ezak, ingEz, x, y, w, h);
  }
}
// Dibuja unas piezas ajustadas a su caja, con la proyección del mapa a esta escala (los grados de longitud se
// encogen con el coseno de la latitud)
function marraztu(doc, ezak, ing, x, y, w, h) {
  const puntuak = ezak.flatMap(([ez]) => ez.flat());
  if (!puntuak.length) return;
  const lon = puntuak.map((p) => p[0]), lat = puntuak.map((p) => p[1]);
  const lon0 = Math.min(...lon), lon1 = Math.max(...lon), lat0 = Math.min(...lat), lat1 = Math.max(...lat);
  const kx = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
  const zab = Math.max((lon1 - lon0) * kx, 1e-6), alt = Math.max(lat1 - lat0, 1e-6);
  const s = Math.min(w / zab, h / alt);
  const dx = x + (w - zab * s) / 2 - lon0 * kx * s, dy = y + (h - alt * s) / 2 + lat1 * s;
  const proi = (p) => [p[0] * kx * s + dx, dy - p[1] * s];

  doc.setLineWidth(0.1); doc.setDrawColor(255, 255, 255);
  for (const [ez, rec] of ezak) {
    const c = kol(irabKol(rec));
    doc.setFillColor(c[0], c[1], c[2]);
    for (const eraztuna of ez) {
      let aurrekoa = null;
      for (let i = 0; i < eraztuna.length; i++) {
        const pt = proi(eraztuna[i]);
        // a esta escala, dos puntos tan juntos son el mismo (menos trabajo y folio más liviano)
        if (aurrekoa && i < eraztuna.length - 1 && Math.abs(pt[0] - aurrekoa[0]) + Math.abs(pt[1] - aurrekoa[1]) < 0.12) continue;
        if (aurrekoa === null) doc.moveTo(pt[0], pt[1]); else doc.lineTo(pt[0], pt[1]);
        aurrekoa = pt;
      }
      doc.close();
    }
    doc.fillStrokeEvenOdd();  // los agujeros (enclaves, lagos) quedan huecos
  }
  for (const ez of ing) {  // el contorno de la zona, por encima de las piezas
    doc.setDrawColor(LAUSO[0], LAUSO[1], LAUSO[2]); doc.setLineWidth(0.25);
    for (const eraztuna of ez) {
      eraztuna.forEach((p, i) => { const pt = proi(p); if (i === 0) doc.moveTo(pt[0], pt[1]); else doc.lineTo(pt[0], pt[1]); });
      doc.close();
    }
    doc.stroke();
  }
}

// ---- bloques del folio ----
function goiburua(doc, z, D, orria, guztira) {
  const kateak = [mailaIzena(z.maila)];
  for (const g of D.gurasoak) {  // sin repetir nombres: Sevilla (municipio y provincia), Andalucía (comunidad y nación)
    if (g.maila !== "estatua" && !kateak.includes(g.izena) && g.izena !== z.izena) kateak.push(g.izena);
  }
  foT(doc, ERTZA, ERTZA, z.izena, "SairaB", 25, TINTA_HI, 120);
  foT(doc, ERTZA, ERTZA + 11.5, moztu(doc, kateak.join(" · "), 120, "Saira", 9.5), "Saira", 9.5, LAUSO, 120);
  foT(doc, W - ERTZA - 70, ERTZA + 1, T.folio.izenburua, "SairaM", 9, TINTA, 70, "R");
  foT(doc, W - ERTZA - 70, ERTZA + 6, T.folio.webgunea, "Saira", 8, ILUN, 70, "R");
  foT(doc, W - ERTZA - 70, ERTZA + 10.5, `${new Date().toISOString().slice(0, 10)}  ·  ${orria}/${guztira}`, "Mono", 7.5, ILUN, 70, "R");
  return ERTZA + 18;
}

// La fila de cifras de la zona
function kpiak(doc, z, D, y) {
  const r = D.erreg || {};
  const kutxak = [[T.censo, fmt(r.censo)], [T.votantes, fmt(r.votantes)]];
  if (D.barne.idak.length) kutxak.push([T.folio.mailakPlural[D.barne.maila] || D.barne.maila, fmt(D.barne.idak.length)]);
  if (D.cera) kutxak.push([T.folio.ceraZentsua, fmt(D.cera.censo)]);
  const gur = D.gurasoak.filter((g) => g.maila !== "estatua");
  if (gur.length && kutxak.length < 5) kutxak.push([mailaIzena(gur.at(-1).maila), gur.at(-1).izena]);
  const w = (ZAB - 3 * (kutxak.length - 1)) / kutxak.length;
  kutxak.forEach(([etiketa, balioa], i) => {
    const x = ERTZA + i * (w + 3);
    bete(doc, x, y, w, 15, PANELA);
    foT(doc, x + 3, y + 2.8, moztu(doc, String(etiketa).toUpperCase(), w - 6, "Saira", 7), "Saira", 7, ILUN, w - 6);
    foT(doc, x + 3, y + 7.4, moztu(doc, balioa, w - 6, "SairaM", 12), /^[\d—–]/.test(String(balioa)) ? "MonoM" : "SairaM", 12, TINTA_HI, w - 6);
  });
  return y + 21;
}

// Una elección: participación, quién gana, el reparto del voto y los escaños
function hauteskundea(doc, etiketa, izenburua, r, y, eser, cera) {
  const wEzk = 52;
  foT(doc, ERTZA, y, etiketa, "SairaM", 11, TINTA_HI, wEzk);
  foT(doc, ERTZA, y + 5, moztu(doc, izenburua, wEzk, "Saira", 7.5), "Saira", 7.5, ILUN, wEzk);
  if (!r || !r.c.length) {
    foT(doc, ERTZA + 58, y + 2, T.folio.daturikEz, "Saira", 8, ILUN);
    return y + 14;
  }
  foT(doc, ERTZA, y + 11, `${handiz(T.part)} ${pctT(r.part, 2)}`, "Mono", 7.5, LAUSO, wEzk);
  if (r.partE != null) foT(doc, ERTZA, y + 15, `${T.egoiliarrak} ${pctT(r.partE, 2)}`, "Mono", 7, ILUN, wEzk);

  const x0 = ERTZA + 58, w0 = ZAB - 58;
  let irab = `${r.c[0][0]} ${pctT(r.c[0][2])}`;
  if (r.m != null && r.c.length > 1) irab += `   ·   ${T.folio.puntuGainetik(ptuT(r.m), r.c[1][0])}`;
  foT(doc, x0, y, moztu(doc, irab, w0, "SairaM", 9.5), "SairaM", 9.5, TINTA, w0);
  barra(doc, x0, y + 5.2, w0, 5.2, r.c.map((c) => [c[3], c[2]]));
  const zut = w0 / 3, kop = Math.min(r.c.length, 9);
  for (let i = 0; i < kop; i++) {
    const c = r.c[i];
    txipa(doc, x0 + (i % 3) * zut, y + 12.5 + Math.floor(i / 3) * 4.4, c[3], `${c[0]} ${pctT(c[2])}`, zut);
  }
  let azk = y + 12.5 + (Math.floor((kop - 1) / 3) + 1) * 4.4;
  if (eser && eser.length) {
    const guztira = eser.reduce((s, x) => s + x[1], 0);
    foT(doc, x0, azk, `${T.escanos}: ${guztira}`, "Mono", 7.2, LAUSO, w0);
    barra(doc, x0 + 22, azk + 0.4, w0 - 22, 3.4, eser.map((x) => [x[2], x[1]]));
    azk += 5;
    const kopE = Math.min(eser.length, 6);
    for (let i = 0; i < kopE; i++) {
      txipa(doc, x0 + (i % 3) * zut, azk + Math.floor(i / 3) * 4.2, eser[i][2], `${eser[i][0]} ${eser[i][1]}`, zut, 7);
    }
    azk += (Math.floor((kopE - 1) / 3) + 1) * 4.2;
  }
  if (cera) {
    foT(doc, x0, azk, T.folio.ceraTxt(fmt(cera.censo), fmt(cera.votantes)), "Mono", 7.2, LAUSO, w0);
    azk += 4.2;
  }
  return Math.max(azk, y + 22) + 2.5;
}

// Las autonómicas de las comunidades que hay dentro de la zona: una fila por comunidad, con su última elección, la
// participación, el reparto del voto y quién gana
function autTaula(doc, autok, y) {
  const wEzk = 52;
  foT(doc, ERTZA, y, T.autonomicas, "SairaM", 11, TINTA_HI, wEzk);
  foT(doc, ERTZA, y + 5, moztu(doc, T.folio.autBana(autok.length), wEzk, "Saira", 7.5), "Saira", 7.5, ILUN, wEzk);
  foT(doc, ERTZA, y + 8.6, moztu(doc, T.folio.autAzkena, wEzk, "Saira", 7.5), "Saira", 7.5, ILUN, wEzk);
  const x0 = ERTZA + 58;
  const wIzen = 32, wData = 15, wPart = 14, wBarra = 28;
  const xData = x0 + wIzen, xPart = x0 + wIzen + wData;
  const xBarra = xPart + wPart + 3, xIrab = xPart + wPart + 6 + wBarra;
  const wIrab = W - ERTZA - xIrab;
  foT(doc, xPart, y, T.folio.partLabur, "Saira", 6.5, ILUN, wPart, "R");
  foT(doc, xIrab, y, T.folio.irabazi, "Saira", 6.5, ILUN, wIrab);
  let yy = y + 4;
  for (const r of autok) {
    foT(doc, x0, yy, moztu(doc, r.autIzena, wIzen, "Saira", 8), "Saira", 8, TINTA, wIzen);
    foT(doc, xData, yy, `${r.hk.slice(4, 6)}/${r.hk.slice(0, 4)}`, "Mono", 7, ILUN, wData);
    foT(doc, xPart, yy, pctT(r.part), "Mono", 7.5, LAUSO, wPart, "R");
    barra(doc, xBarra, yy + 0.4, wBarra, 3.2, r.c.map((c) => [c[3], c[2]]));
    txipa(doc, xIrab, yy, r.c[0][3], `${r.c[0][0]} (${ptuT(r.m)})`, wIrab, 7.5);
    yy += 4.8;
  }
  return Math.max(yy, y + 14) + 2;
}

// En qué se aparta de su provincia, su comunidad, su nación y el Estado
function aldeakTaula(doc, D, y) {
  const a = D.aldeak; if (!a) return y;
  const wIzen = 50, wPct = 18, wZut = (ZAB - wIzen - wPct) / Math.max(a.ref.length, 1);
  foT(doc, ERTZA, y, moztu(doc, hautIzena(D.k), wIzen, "Saira", 7.5), "Saira", 7.5, ILUN, wIzen);
  foT(doc, ERTZA + wIzen, y, T.folio.hemen, "Saira", 7, ILUN, wPct, "R");
  a.ref.forEach((ref, i) => foT(doc, ERTZA + wIzen + wPct + i * wZut, y, moztu(doc, ref.etiketa, wZut - 6, "Saira", 7), "Saira", 7, ILUN, wZut - 4, "C"));
  y += 5.5;
  for (const f of a.alderdiak.slice(0, 8)) {
    txipa(doc, ERTZA, y, a.kolorez[f], a.izenez[f], wIzen, 8);
    foT(doc, ERTZA + wIzen, y, pctT(a.nirea[f]), "MonoM", 8, TINTA, wPct, "R");
    a.ref.forEach((ref, i) => {
      if (ref.p[f] == null) return;
      const v = Math.round((a.nirea[f] - ref.p[f]) * 100) / 100, x0 = ERTZA + wIzen + wPct + i * wZut;
      foT(doc, x0, y, ptuT(v), "Mono", 7.5, v > 0 ? GORA : BEHERA, 13, "R");
      const erdia = x0 + 17 + (wZut - 21) / 2;  // eje del cero, en medio del hueco de la columna
      marra(doc, erdia, y - 0.3, erdia, y + 3.6, MARRA_2, 0.15);
      const zab = Math.min(Math.abs(v), 15) / 15 * (wZut - 21) / 2;
      bete(doc, v > 0 ? erdia : erdia - zab, y + 0.8, zab, 2.2, v > 0 ? GORA : BEHERA);
    });
    y += 4.7;
  }
  return y + 2;
}

// Cómo ha votado desde 2011: el % de cada candidatura, elección a elección
function grafikoa(doc, D, x, y, w, h) {
  const bil = D.bil;
  if (!bil) { foT(doc, x, y, T.folio.bilakaeraEz, "Saira", 8, ILUN, w); return; }
  const azk = bil.filak.at(-1);
  const alderdiak = [...new Set(bil.filak.flatMap((f) => Object.keys(f.pct)))]
    .sort((a, b) => Math.max(...bil.filak.map((f) => f.pct[b] ?? -1)) - Math.max(...bil.filak.map((f) => f.pct[a] ?? -1))).slice(0, 6);
  const gx = x + 8, gy = y + 2, gw = w - 8, gh = h - 16;
  const gehienez = Math.max(...bil.filak.flatMap((f) => alderdiak.map((a) => f.pct[a] || 0)));
  const goia = Math.max(10, Math.min(70, 10 * (Math.floor(gehienez / 10) + 1)));
  for (let v = 0; v <= goia; v += 10) {
    const yy = gy + gh * (1 - v / goia);
    marra(doc, gx, yy, gx + gw, yy, MARRA_2, 0.15);
    foT(doc, gx - 8, yy - 1.3, String(v), "Mono", 6, ILUN, 6.5, "R");
  }
  const n = bil.filak.length, xs = bil.filak.map((_f, i) => gx + (n > 1 ? gw * i / (n - 1) : gw / 2));
  doc.setLineWidth(0.6);
  for (const a of alderdiak) {
    const c = kol(bil.kolorez[a]); doc.setDrawColor(c[0], c[1], c[2]);
    let aurrekoa = null;
    bil.filak.forEach((f, i) => {
      const v = f.pct[a];
      if (v == null) { aurrekoa = null; return; }  // no se presentó: la línea se corta
      const pt = [xs[i], gy + gh * (1 - v / goia)];
      if (aurrekoa) doc.line(aurrekoa[0], aurrekoa[1], pt[0], pt[1]);
      aurrekoa = pt;
    });
  }
  let azkenX = -99;
  bil.filak.forEach((f, i) => {
    if (xs[i] - azkenX < 10) return;
    foT(doc, xs[i] - 9, gy + gh + 1.5, (INFO[f.k] || {}).izena || f.k, "Mono", 5.5, ILUN, 18, "C");
    azkenX = xs[i];
  });
  foT(doc, x, y + h - 8, `${handiz(T.part)}: ${pctT(bil.filak[0].part)} (${(INFO[bil.filak[0].k] || {}).izena || ""}) ${T.folio.eta} ${pctT(azk.part)} (${(INFO[azk.k] || {}).izena || ""})`,
    "Mono", 6.5, LAUSO, w);
  alderdiak.slice(0, 4).forEach((a, i) => txipa(doc, x + i * (w / 4), y + h - 4, bil.kolorez[a], bil.izenez[a], w / 4, 6.5));
}

// La última elección frente a la anterior: quién sube y quién baja
function aldaketa(doc, D, x, y, w) {
  const bil = D.bil;
  if (!bil || bil.filak.length < 2) return;
  const azk = bil.filak.at(-1), aur = bil.filak.at(-2);
  foT(doc, x, y, T.folio.azkenaAurrekoa, "SairaM", 9, TINTA_HI, w);
  foT(doc, x, y + 5.5, moztu(doc, `${hautIzena(aur.k)} ${T.folio.eta} ${hautIzena(azk.k)}`, w, "Saira", 7), "Saira", 7, ILUN, w);
  const dp = Math.round((azk.part - aur.part) * 100) / 100;
  foT(doc, x, y + 10, `${handiz(T.part)} ${ptuT(dp)} ${T.puntos}`, "Mono", 7, dp > 0 ? GORA : BEHERA, w);
  let yy = y + 15;
  const alderdiak = Object.keys(azk.pct).sort((a, b) => azk.pct[b] - azk.pct[a]);
  for (const a of alderdiak.slice(0, 7)) {
    const v = azk.pct[a], aurv = aur.pct[a];
    txipa(doc, x, yy, bil.kolorez[a], bil.izenez[a], w - 26, 7.5);
    foT(doc, x + w - 26, yy, pctT(v), "Mono", 7.5, LAUSO, 14, "R");
    foT(doc, x + w - 11, yy, aurv == null ? T.folio.berria : ptuT(Math.round((v - aurv) * 100) / 100),
      aurv == null ? "Mono" : "MonoM", 7.5, aurv == null ? ILUN : v - aurv > 0 ? GORA : BEHERA, 11, "R");
    yy += 4.4;
  }
}

// El mapa de lo que compone la zona y, al lado, sus piezas una a una (o quién gana en cuántas secciones)
function barnekoakBlokea(doc, D, y) {
  const sekziotan = D.barne.maila === "sekzioa";
  const mapaW = sekziotan ? 110 : 104;
  foT(doc, ERTZA, y, T.folio.datuak(hautIzena(D.k)), "Mono", 7.2, LAUSO, ZAB);
  y += 5;
  const h = Math.max(40, Math.min(H - ERTZA - 14 - y, 95));
  if (D.geoak.length) {
    mapa(doc, D.geoak, ERTZA, y, mapaW, h, D.ingurua);
    foT(doc, ERTZA, y + h + 0.5, T.folio.mapaOina(T.folio.mapaIzenak[D.barne.maila] || D.barne.maila), "Saira", 6.5, ILUN, mapaW);
  }
  const x0 = ERTZA + mapaW + 8, w0 = ZAB - mapaW - 8;
  if (sekziotan) {
    const parts = D.barneak.map((x) => x.rec.part).filter((p) => p != null).sort((a, b) => a - b);
    const irab = new Map();
    for (const x of D.barneak) { const s = x.rec.c[0][0]; irab.set(s, (irab.get(s) || 0) + 1); }
    const kolorez = {};
    for (const x of D.barneak) kolorez[x.rec.c[0][0]] = x.rec.c[0][3];
    foT(doc, x0, y, `${T.folio.sekzioN(D.barneak.length)} · ${T.part.toLowerCase()} ${pctT(parts[0])} – ${pctT(parts.at(-1))}`, "Mono", 7.2, LAUSO, w0);
    const zerrenda = [...irab.entries()].sort((a, b) => b[1] - a[1]);
    barra(doc, x0, y + 5, w0, 5.2, zerrenda.map(([s, n]) => [kolorez[s], n]));
    zerrenda.forEach(([s, n], i) => txipa(doc, x0, y + 12 + i * 4.8, kolorez[s], `${s}: ${T.folio.sekzioN(n)}`, w0, 7.5));
    return y + h + 5;
  }
  const wIzen = 30, gehienez = Math.floor((h - 4) / 4.8);
  let yy = y;
  for (const x of D.barneak.slice(0, gehienez)) {
    foT(doc, x0, yy, moztu(doc, x.izena, wIzen, "Saira", 8), "Saira", 8, TINTA, wIzen);
    foT(doc, x0 + wIzen, yy, pctT(x.rec.part), "Mono", 7.5, LAUSO, 14, "R");
    txipa(doc, x0 + wIzen + 17, yy, x.rec.c[0][3], `${x.rec.c[0][0]} (${ptuT(x.rec.m)})`, W - ERTZA - (x0 + wIzen + 17), 7.5);
    yy += 4.8;
  }
  if (D.barneak.length > gehienez) foT(doc, x0, yy, T.folio.etaBeste(D.barneak.length - gehienez), "Saira", 7.5, ILUN, 60);
  return Math.max(yy, y + h + 5) + 2;
}

function oina(doc, z, D) {  // pie: de dónde salen los datos y dónde está esta misma vista en la web
  const y = H - ERTZA - 8;
  marra(doc, ERTZA, y, W - ERTZA, y);
  foT(doc, ERTZA, y + 1.8, T.folio.iturriak, "Saira", 7, ILUN);
  foT(doc, ERTZA, y + 5.4, moztu(doc, lotura(z, D), ZAB, "Mono", 6.5), "Mono", 6.5, LAUSO);
}
const lotura = (z, D) => `${location.origin}${location.pathname}#k=${D.k}`
  + (z.maila === "estatua" ? "" : `&s=${z.maila}:${z.id}`) + (HIZK === "es" ? "" : `&l=${HIZK}`);

const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // sin acentos
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- el folio ----
export async function folioa(ctx) {
  testuingurua(ctx);
  const h = state.hautatua;
  if (h && (h.maila === "udalerria" || h.maila === "sekzioa")) await udalIzenakLortu().catch(() => {});  // su nombre
  const z = folioZona(); if (!z) return null;
  const [{ jsPDF, letrak }, D] = await Promise.all([tresnak(), datuak(z)]);
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });  // comprimido: el folio baja de 200 kB a unas decenas
  for (const [izen, b64] of Object.entries(letrak)) { doc.addFileToVFS(`${izen}.ttf`, b64); doc.addFont(`${izen}.ttf`, izen, "normal"); }
  doc.setProperties({ title: `${z.izena} · ${T.folio.izenburua}`, creator: T.folio.izenburua });

  // 1. quién es, la última elección y en qué se aparta de lo que la rodea
  let y = kpiak(doc, z, D, goiburua(doc, z, D, 1, 2));
  y = atala(doc, y, T.folio.azkenHauteskundeak);
  y = hauteskundea(doc, T.congreso, hautIzena(D.k), D.erreg, y, D.eser, D.cera);
  if (D.autok.length === 1) y = hauteskundea(doc, T.autonomicas, D.autok[0].izena, D.autok[0], y, D.autok[0].eser, null);
  else if (D.autok.length) y = autTaula(doc, D.autok, y);  // el Estado y las naciones: una fila por comunidad
  if (D.aldeak) {
    y = atala(doc, y + 1, T.folio.nonDagoAldea);
    y = aldeakTaula(doc, D, y);
  }
  const zutW = (ZAB - 10) / 2;
  const bilakaeraHemen = H - ERTZA - 10 - y > 72;  // en el Estado sobra sitio: la evolución cabe aquí
  if (bilakaeraHemen) {
    y = atala(doc, y + 1, T.folio.bilakaera2011);
    grafikoa(doc, D, ERTZA, y, zutW + 14, 60);
    aldaketa(doc, D, ERTZA + zutW + 28, y, zutW - 18);
  }
  oina(doc, z, D);

  // 2. cómo ha cambiado y de qué está hecha
  doc.addPage();
  y = goiburua(doc, z, D, 2, 2);
  if (!bilakaeraHemen) {
    y = atala(doc, y, T.folio.bilakaera2011);
    grafikoa(doc, D, ERTZA, y, zutW + 14, 60);
    aldaketa(doc, D, ERTZA + zutW + 28, y, zutW - 18);
    y += 64;
  }
  if (D.barneak.length) {
    y = atala(doc, y, D.barne.maila === "sekzioa" ? T.folio.sekziozSekzio : T.folio.zatika);
    barnekoakBlokea(doc, D, y);
  }
  oina(doc, z, D);

  doc.save(`${T.folio.fitxategia}_${slug(z.izena)}.pdf`);
  return z;
}
