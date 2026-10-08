// Walk-forward: treina só no passado (com expurgo do horizonte), testa no ano seguinte. Modelos: logística L2 e GBDT raso.
import fs from "node:fs";
const FILE = process.argv[2] ?? "ml_rows_tp2_sl1_h24.json", MODEL = process.argv[3] ?? "logit", HZ = Number(process.argv[4] ?? 24);
const rows: number[][] = JSON.parse(fs.readFileSync(FILE, "utf8"));
const NF = rows[0].length - 6, X = (r: number[]) => r.slice(5, 5 + NF), EXIT = (r: number[]) => r[5 + NF];
const yr = (t: number) => new Date(t * 1000).getUTCFullYear();

// ---------- logística L2 (Newton) ----------
function fitLogit(xs: number[][], ys: number[], lambda = 1) {
  const n = xs.length, d = xs[0].length + 1; let w = new Array(d).fill(0);
  for (let it = 0; it < 12; it++) {
    const g = new Array(d).fill(0), H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < n; i++) {
      const x = [1, ...xs[i]]; let z = 0; for (let j = 0; j < d; j++) z += w[j] * x[j];
      const p = 1 / (1 + Math.exp(-z)), e = p - ys[i], s = p * (1 - p);
      for (let j = 0; j < d; j++) { g[j] += e * x[j]; const sx = s * x[j]; for (let k = j; k < d; k++) H[j][k] += sx * x[k]; }
    }
    for (let j = 0; j < d; j++) { for (let k = 0; k < j; k++) H[j][k] = H[k][j]; if (j) { g[j] += lambda * w[j]; H[j][j] += lambda; } }
    // resolve H·Δ = g (Gauss)
    const A = H.map((r, i) => [...r, g[i]]);
    for (let c = 0; c < d; c++) { let p = c; for (let r = c + 1; r < d; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < d; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= d; k++) A[r][k] -= f * A[c][k]; } }
    const step = A.map((r, i) => r[d] / r[i]); w = w.map((v, i) => v - step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return (x: number[]) => { let z = w[0]; for (let j = 0; j < x.length; j++) z += w[j + 1] * x[j]; return 1 / (1 + Math.exp(-z)); };
}
// ---------- GBDT raso (árvores de profundidade 2, histograma de 32 faixas, logloss) ----------
function fitGbdt(xs: number[][], ys: number[], rounds = 150, lr = 0.05, depth = 2, minLeaf = 400) {
  const n = xs.length, d = xs[0].length, B = 32;
  const cuts = Array.from({ length: d }, (_, j) => { const v = xs.map((x) => x[j]).sort((a, b) => a - b); return Array.from({ length: B - 1 }, (_, q) => v[Math.floor(((q + 1) * n) / B)]); });
  const bin = xs.map((x) => x.map((v, j) => { const c = cuts[j]; let lo = 0, hi = c.length; while (lo < hi) { const m = (lo + hi) >> 1; if (v > c[m]) lo = m + 1; else hi = m; } return lo; }));
  const base = Math.log(ys.reduce((s, v) => s + v, 0) / (n - ys.reduce((s, v) => s + v, 0)));
  const F = new Float64Array(n).fill(base); const trees: any[] = [];
  const grow = (idx: number[], g: Float64Array, h: Float64Array, lvl: number): any => {
    const G = idx.reduce((s, i) => s + g[i], 0), Hs = idx.reduce((s, i) => s + h[i], 0);
    const leaf = { v: -G / (Hs + 1) };
    if (lvl >= depth || idx.length < 2 * minLeaf) return leaf;
    let best = { gain: 0, j: -1, b: -1 };
    for (let j = 0; j < d; j++) {
      const gh = new Float64Array(B), hh = new Float64Array(B), cn = new Int32Array(B);
      for (const i of idx) { const q = bin[i][j]; gh[q] += g[i]; hh[q] += h[i]; cn[q]++; }
      let gl = 0, hl = 0, nl = 0;
      for (let q = 0; q < B - 1; q++) { gl += gh[q]; hl += hh[q]; nl += cn[q]; if (nl < minLeaf || idx.length - nl < minLeaf) continue; const gr = G - gl, hr = Hs - hl, gain = (gl * gl) / (hl + 1) + (gr * gr) / (hr + 1) - (G * G) / (Hs + 1); if (gain > best.gain) best = { gain, j, b: q }; }
    }
    if (best.j < 0) return leaf;
    const L = idx.filter((i) => bin[i][best.j] <= best.b), R = idx.filter((i) => bin[i][best.j] > best.b);
    return { j: best.j, t: cuts[best.j][best.b], l: grow(L, g, h, lvl + 1), r: grow(R, g, h, lvl + 1) };
  };
  const pred = (tr: any, x: number[]): number => (tr.v !== undefined ? tr.v : pred(x[tr.j] <= tr.t ? tr.l : tr.r, x));
  const all = Array.from({ length: n }, (_, i) => i);
  for (let r = 0; r < rounds; r++) {
    const g = new Float64Array(n), h = new Float64Array(n);
    for (let i = 0; i < n; i++) { const p = 1 / (1 + Math.exp(-F[i])); g[i] = p - ys[i]; h[i] = p * (1 - p); }
    const tr = grow(all, g, h, 0); trees.push(tr);
    for (let i = 0; i < n; i++) F[i] += lr * pred(tr, xs[i]);
  }
  return (x: number[]) => { let z = base; for (const t of trees) z += lr * pred(t, x); return 1 / (1 + Math.exp(-z)); };
}

const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : " —");
const results: Record<string, { y: number; R: number; t: number; d: number }[]> = {};
const QS = [0.02, 0.05, 0.1, 0.2];
for (const Y of [2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
  const cutT = Date.UTC(Y, 0, 1) / 1000 - HZ * 3600;
  const tr = rows.filter((r) => r[0] < cutT && EXIT(r) < Date.UTC(Y, 0, 1) / 1000), te = rows.filter((r) => yr(r[0]) === Y);
  // padroniza com média/desvio do treino
  const mu = new Array(NF).fill(0), sd = new Array(NF).fill(0);
  for (const r of tr) X(r).forEach((v, j) => (mu[j] += v / tr.length)); for (const r of tr) X(r).forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / tr.length));
  const z = (r: number[]) => X(r).map((v, j) => Math.max(-5, Math.min(5, (v - mu[j]) / (Math.sqrt(sd[j]) || 1))));
  const xs = tr.map(z), ys = tr.map((r) => r[4]);
  const f = MODEL === "gbdt" ? fitGbdt(xs, ys) : fitLogit(xs, ys, 10);
  const ptr = xs.map(f).sort((a, b) => b - a);
  const pte = te.map((r) => f(z(r)));
  for (const q of QS) {
    const thr = ptr[Math.floor(q * ptr.length)];
    // simula: 1 posição por vez (qualquer lado), entra quando p ≥ limite
    let busy = 0; const out: { y: number; R: number; t: number; d: number }[] = [];
    te.forEach((r, i) => { if (r[0] < busy || pte[i] < thr) return; out.push({ y: Y, R: r[3], t: r[0], d: r[1] }); busy = EXIT(r); });
    (results[`q${q}`] ??= []).push(...out);
  }
  process.stderr.write(`${Y} ok (treino ${tr.length})\n`);
}
console.log(`${FILE} · modelo ${MODEL} · walk-forward 2020–2026 (cada ano treinado só com os anteriores)`);
for (const [k, v] of Object.entries(results)) {
  const a = v.reduce((s, x) => s + x.R, 0) / v.length, sd = Math.sqrt(v.reduce((s, x) => s + (x.R - a) ** 2, 0) / v.length);
  const ys = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => { const q = v.filter((x) => x.y === y); return q.length ? q.reduce((s, x) => s + x.R, 0) / q.length : NaN; });
  let e = 0, p = 0, dd = 0; for (const x of v) { e += x.R; p = Math.max(p, e); dd = Math.max(dd, p - e); }
  console.log(`  top ${(Number(k.slice(1)) * 100).toFixed(0)}%: ${v.length} op (${(v.length / 81).toFixed(1)}/mês) · ${sg(a)}R t=${(a / (sd / Math.sqrt(v.length))).toFixed(1)} · DD ${dd.toFixed(0)}R · anos [${ys.map(sg).join(" ")}] · compras ${v.filter((x) => x.d === 1).length} vendas ${v.filter((x) => x.d === -1).length}`);
}
