import fs from "node:fs";
import { runTrendEngine } from "./trend-engine.mts";
const m5: number[][] = JSON.parse(fs.readFileSync("m5.json", "utf8"));
const h1: any[] = []; for (const [t, o, h, l, c] of m5) { const k = Math.floor(t / 3600) * 3600, b = h1[h1.length - 1]; if (b && b.time === k) { b.high = Math.max(b.high, h); b.low = Math.min(b.low, l); b.close = c; } else h1.push({ time: k, open: o, high: h, low: l, close: c }); }
const t0 = Date.now(); const { trades, state } = runTrendEngine(h1); console.log("H1", h1.length, "tempo", Date.now() - t0, "ms");
const sg = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
for (const mod of ["ROMPIMENTO_H1", "ROMPIMENTO_H4", "TODOS"]) {
  const z = trades.filter((t) => t.status === "ENCERRADA" && (mod === "TODOS" || t.module === mod)).map((t) => ({ y: new Date(t.entryTime * 1000).getUTCFullYear(), R: t.resultR! - 0.5 / t.risk }));
  const av = (q: any[]) => q.reduce((s, x) => s + x.R, 0) / q.length;
  console.log(`${mod.padEnd(14)} ${z.length} op · ${sg(av(z))}R · treino ${sg(av(z.filter((x) => x.y <= 2022)))} val ${sg(av(z.filter((x) => x.y >= 2023 && x.y <= 2024)))} teste ${sg(av(z.filter((x) => x.y >= 2025)))} · anos ${[2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => sg(av(z.filter((x) => x.y === y)))).join(" ")}`);
}
console.log(JSON.stringify(state).slice(0, 400));
