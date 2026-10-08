import fs from "node:fs";
const rows: any[] = JSON.parse(fs.readFileSync("deep_feat.json", "utf8"));
const yr = (t: number) => new Date(t * 1000).getUTCFullYear();
const TR = rows.filter((r) => yr(r.t) <= 2022), VA = rows.filter((r) => yr(r.t) >= 2023 && yr(r.t) <= 2024), TE = rows.filter((r) => yr(r.t) >= 2025);
const av = (z: any[]) => (z.length ? z.reduce((s, x) => s + x.R, 0) / z.length : NaN);
const keys = [...new Set(rows.flatMap((r) => Object.keys(r.f)))];
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : "  — ");
console.log(`base: treino ${sg(av(TR))} (${TR.length}) · valid ${sg(av(VA))} (${VA.length}) · teste ${sg(av(TE))} (${TE.length})`);
const res: any[] = [];
for (const k of keys) {
  const v = TR.map((r) => r.f[k]).filter(Number.isFinite).sort((a, b) => a - b); if (v.length < 300) continue;
  const q1 = v[Math.floor(v.length / 3)], q2 = v[Math.floor((2 * v.length) / 3)];
  const g: [string, (x: number) => boolean][] = [[`≤${q1.toFixed(2)}`, (x) => x <= q1], [`${q1.toFixed(2)}…${q2.toFixed(2)}`, (x) => x > q1 && x <= q2], [`>${q2.toFixed(2)}`, (x) => x > q2]];
  for (const [n, f] of g) { const fz = (z: any[]) => z.filter((r) => Number.isFinite(r.f[k]) && f(r.f[k])); const a = fz(TR), b = fz(VA), c = fz(TE); if (a.length < 120) continue; res.push({ k, n, tr: av(a), va: av(b), te: av(c), nTr: a.length, nVa: b.length, nTe: c.length }); }
}
const base = av(TR), baseVa = av(VA), baseTe = av(TE);
// faixas RUINS: muito abaixo da base no treino E abaixo da base na validação
const bad = res.filter((r) => r.tr < base - 0.2 && r.va < baseVa).sort((a, b) => a.tr - b.tr);
console.log("\nFAIXAS RUINS (treino bem abaixo da base E validação abaixo da base) → candidatas a BLOQUEIO:");
for (const r of bad) console.log(`  ${r.k.padEnd(18)} ${r.n.padEnd(16)} treino ${sg(r.tr)} (${r.nTr}) · valid ${sg(r.va)} (${r.nVa}) · teste ${sg(r.te)} (${r.nTe})`);
const good = res.filter((r) => r.tr > base + 0.2 && r.va > baseVa).sort((a, b) => b.tr - a.tr);
console.log("\nFAIXAS BOAS (treino bem acima E validação acima):");
for (const r of good) console.log(`  ${r.k.padEnd(18)} ${r.n.padEnd(16)} treino ${sg(r.tr)} (${r.nTr}) · valid ${sg(r.va)} (${r.nVa}) · teste ${sg(r.te)} (${r.nTe})`);
fs.writeFileSync("deep5_res.json", JSON.stringify(res));
