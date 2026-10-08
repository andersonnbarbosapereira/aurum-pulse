// Dataset para o modelo: uma amostra por (fechamento de H1, lado). Características simétricas (multiplicadas pela direção).
// Rótulo = barreira tripla a partir da abertura do M5 seguinte: alvo +tp·ATR antes de stop −sl·ATR, em até H horas.
import fs from "node:fs";
import { M5, H1, H4, D1, nyHour } from "./lib.mts";
import { I, CI } from "./families.mts";

const TP = Number(process.env.TP ?? 2), SL = Number(process.env.SL ?? 1), HOURS = Number(process.env.HZ ?? 24), COST = 0.5;
const c1 = H1.b.map((x) => x.c);
const e200h1 = (() => { const k = 2 / 201, o: number[] = []; c1.forEach((x, i) => o.push(i ? x * k + o[i - 1] * (1 - k) : x)); return o; })();
const volMean = (() => { const o: number[] = []; let s = 0; I.h1.atr.forEach((a, i) => { s += a; if (i >= 100) s -= I.h1.atr[i - 100]; o.push(s / Math.min(i + 1, 100)); }); return o; })();

export const FEATS = ["r1", "r3", "r6", "r12", "r24", "r72", "r120", "dE20h1", "dE50h1", "dE200h1", "dE20h4", "dE50h4", "dE20d1", "dE50d1", "rsiH1", "rsiH4", "rsiD1", "adxH1", "adxH4", "vol", "atrPct", "don24", "don120", "dPDH", "dPDL", "hs", "hc", "trH4", "trD1", "body", "wick"];
const rows: number[][] = []; // [t, dir, i, R, label, ...feats]
for (let i = 1; i < M5.length - 1; i++) {
  if (CI.c1[i] === CI.c1[i - 1]) continue;
  const k = CI.c1[i], k4 = CI.c4[i], kd = CI.cD[i];
  if (k < 220 || k4 < 60 || kd < 60) continue;
  const b = H1.b, p = b[k].c, a = I.h1.atr[k]; if (!(a > 0)) continue;
  const hi24 = Math.max(...b.slice(k - 23, k + 1).map((x) => x.h)), lo24 = Math.min(...b.slice(k - 23, k + 1).map((x) => x.l));
  const hi120 = Math.max(...b.slice(k - 119, k + 1).map((x) => x.h)), lo120 = Math.min(...b.slice(k - 119, k + 1).map((x) => x.l));
  const y = D1.b[kd], ny = nyHour(b[k].t + 3600);
  const tr4 = I.h4.e20[k4] > I.h4.e50[k4] && H4.b[k4].c > I.h4.e50[k4] ? 1 : I.h4.e20[k4] < I.h4.e50[k4] && H4.b[k4].c < I.h4.e50[k4] ? -1 : 0;
  const trD = D1.b[kd].c > I.d1.e50[kd] && I.d1.e20[kd] > I.d1.e50[kd] ? 1 : D1.b[kd].c < I.d1.e50[kd] && I.d1.e20[kd] < I.d1.e50[kd] ? -1 : 0;
  const rng = b[k].h - b[k].l || 1;
  for (const d of [1, -1]) {
    const ret = (n: number) => ((p - b[k - n].c) / a) * d;
    const pos = (h: number, l: number) => (d === 1 ? (p - l) / (h - l || 1) : (h - p) / (h - l || 1));
    const f = [ret(1), ret(3), ret(6), ret(12), ret(24), ret(72), ret(120),
      ((p - I.h1.e20[k]) / a) * d, ((p - I.h1.e50[k]) / a) * d, ((p - e200h1[k]) / a) * d,
      ((p - I.h4.e20[k4]) / I.h4.atr[k4]) * d, ((p - I.h4.e50[k4]) / I.h4.atr[k4]) * d, ((p - I.d1.e20[kd]) / I.d1.atr[kd]) * d, ((p - I.d1.e50[kd]) / I.d1.atr[kd]) * d,
      (I.h1.rsi[k] - 50) * d, (I.h4.rsi[k4] - 50) * d, (I.d1.rsi[kd] - 50) * d, I.h1.adx[k], I.h4.adx[k4], a / volMean[k], (I.d1.atr[kd] / p) * 100,
      pos(hi24, lo24), pos(hi120, lo120), ((d === 1 ? y.h - p : p - y.l) / a), ((d === 1 ? p - y.l : y.h - p) / a),
      Math.sin((2 * Math.PI * ny) / 24), Math.cos((2 * Math.PI * ny) / 24), tr4 * d, trD * d,
      ((b[k].c - b[k].o) / rng) * d, (d === 1 ? (Math.min(b[k].o, b[k].c) - b[k].l) : (b[k].h - Math.max(b[k].o, b[k].c))) / rng];
    // barreira tripla no caminho M5 (stop primeiro no mesmo candle)
    const e = M5[i + 1].o, up = e + d * TP * a, dn = e - d * SL * a, end = M5[i].t + HOURS * 3600;
    let R = NaN, lab = 0, j = i + 1;
    for (; j < M5.length && M5[j].t < end; j++) {
      const m = M5[j];
      if (j > i + 1 && m.t - M5[j - 1].t > 4 * 86400) break;
      if (d === 1 ? m.l <= dn : m.h >= dn) { R = -1; break; }
      if (d === 1 ? m.h >= up : m.l <= up) { R = TP / SL; lab = 1; break; }
    }
    if (!Number.isFinite(R)) { const c = M5[Math.min(j, M5.length - 1) - 1].c; R = ((c - e) * d) / (SL * a); }
    R -= COST / (SL * a);
    rows.push([b[k].t + 3600, d, i, R, lab, ...f, M5[Math.min(j, M5.length - 1)].t]);
  }
}
fs.writeFileSync(`ml_rows_tp${TP}_sl${SL}_h${HOURS}.json`, JSON.stringify(rows));
console.log("amostras", rows.length, "· taxa de alvo", (rows.reduce((s, r) => s + r[4], 0) / rows.length).toFixed(3), "· R médio (entrada aleatória)", (rows.reduce((s, r) => s + r[3], 0) / rows.length).toFixed(3));
