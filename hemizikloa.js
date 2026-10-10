// Hemiciclo en SVG: un punto por escaño, por filas desde dentro hacia fuera y de izquierda a derecha en el orden de
// la lista (el de más escaños, a la izquierda). c = [[siglas, escaños, color, …]]; hitza = «escaños» en el idioma de la web.
// Los parlamentos pequeños (una circunscripción) van en una sola fila; los grandes, con el radio máximo y puntos más pequeños.
export function hemizikloa(c, hitza) {
  const N = c.reduce((s, x) => s + x[1], 0); if (!N) return "";
  const RMAX = 96, RP = 5.5, TARTEA = RP * 2.5, BARNE = 27 + RP;  // radio máximo, radio del punto, paso, fila interior (hueco de la cifra)
  // Filas desde BARNE hacia fuera, cada una con los puntos que le caben a paso TARTEA; solo las necesarias
  const lekua = (r) => Math.floor(Math.PI * r / TARTEA) + 1;
  let ilarak = 1; while (Array.from({ length: ilarak }, (_, i) => lekua(BARNE + i * TARTEA)).reduce((a, b) => a + b, 0) < N) ilarak++;
  let R = BARNE + (ilarak - 1) * TARTEA, radioak, mugak;
  if (N <= lekua(BARNE + TARTEA)) { R = Math.max(BARNE, (N - 1) * TARTEA / Math.PI); radioak = [1]; mugak = [N]; ilarak = 1; }  // hasta ~11: una sola fila
  else if (R <= RMAX) { radioak = Array.from({ length: ilarak }, (_, i) => (BARNE + i * TARTEA) / R); mugak = radioak.map(r => lekua(r * R)); }
  else {  // parlamento grande: radio máximo y puntos más pequeños
    R = RMAX; ilarak = Math.ceil(Math.sqrt(N / 4.5));
    radioak = Array.from({ length: ilarak }, (_, i) => .42 + .58 * i / (ilarak - 1)); mugak = radioak.map(() => Infinity);
  }
  const batura = radioak.reduce((a, b) => a + b, 0);
  const zenbat = radioak.map((r, i) => Math.min(mugak[i], Math.max(1, Math.round(N * r / batura))));
  for (let i = ilarak - 1, falta = N - zenbat.reduce((a, b) => a + b, 0); falta; ) {  // cuadrar el total, de fuera adentro
    if (falta > 0 && zenbat[i] < mugak[i]) { zenbat[i]++; falta--; } else if (falta < 0 && zenbat[i] > 1) { zenbat[i]--; falta++; } else i = (i - 1 + ilarak) % ilarak;
  }
  const puntuak = [];
  radioak.forEach((r, i) => { const n = zenbat[i]; for (let j = 0; j < n; j++) { const a = Math.PI * (n === 1 ? .5 : 1 - j / (n - 1)); puntuak.push([a, R * r * Math.cos(a), -R * r * Math.sin(a)]); } });
  puntuak.sort((p, q) => q[0] - p[0]);
  // en los parlamentos más grandes (R = RMAX) los puntos se achican para no solaparse
  const rp = Math.min(RP, ...radioak.map((r, i) => zenbat[i] > 1 ? Math.PI * R * r / (zenbat[i] - 1) * .42 : RP),
    ilarak > 1 ? R * (radioak[1] - radioak[0]) * .42 : RP);
  const W = 2 * (R + rp + 2), H = R + 2 * rp + 4, cx = W / 2, cy = H - rp - 2;
  let i = 0, s = "";
  for (const [, n, kol, izen] of c) for (let k = 0; k < n; k++, i++) { const p = puntuak[i]; if (p) s += `<circle cx="${(cx + p[1]).toFixed(1)}" cy="${(cy + p[2]).toFixed(1)}" r="${rp.toFixed(2)}" fill="${kol}"><title>${izen}</title></circle>`; }
  // mismo tamaño de punto en pantalla en todos los hemiciclos: el ancho máximo sigue al del dibujo
  return `<svg class="hemi" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" style="max-width:${Math.round(340 * W / 207)}px" role="img" aria-label="${N} ${hitza}">${s}<text x="${cx.toFixed(1)}" y="${(cy - 4).toFixed(1)}" class="hemi-n">${N}</text></svg>`;
}
