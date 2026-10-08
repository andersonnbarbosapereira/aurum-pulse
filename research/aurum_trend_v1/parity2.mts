import fs from "node:fs";
import { runTrendEngine } from "./trend-engine.mts";
const m5: number[][] = JSON.parse(fs.readFileSync("m5.json", "utf8"));
const h1: any[] = []; for (const [t, o, h, l, c] of m5) { const k = Math.floor(t / 3600) * 3600, b = h1[h1.length - 1]; if (b && b.time === k) { b.high = Math.max(b.high, h); b.low = Math.min(b.low, l); b.close = c; } else h1.push({ time: k, open: o, high: h, low: l, close: c }); }
const t0 = Date.now(); const { trades } = runTrendEngine(h1, { includeInactive: true }); console.log("tempo", Date.now() - t0, "ms");
const sg = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
for (const mod of [...new Set(trades.map((t) => t.module))]) {
  const z = trades.filter((t) => t.status === "ENCERRADA" && t.module === mod).map((t) => ({ y: new Date(t.entryTime * 1000).getUTCFullYear(), R: t.resultR! - 0.5 / t.risk }));
  const av = (q: any[]) => q.reduce((s, x) => s + x.R, 0) / q.length;
  console.log(`${mod.padEnd(14)} ${(z.length / 105).toFixed(1)}/mês · ${sg(av(z))}R · tr ${sg(av(z.filter((x) => x.y <= 2022)))} va ${sg(av(z.filter((x) => x.y >= 2023 && x.y <= 2024)))} te ${sg(av(z.filter((x) => x.y >= 2025)))}`);
}
