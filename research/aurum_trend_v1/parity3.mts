import fs from "node:fs";
import { runTrendEngine } from "./trend-engine.mts";
const m5: number[][] = JSON.parse(fs.readFileSync("m5.json", "utf8"));
const h1: any[] = []; for (const [t, o, h, l, c] of m5) { const k = Math.floor(t / 3600) * 3600, b = h1[h1.length - 1]; if (b && b.time === k) { b.high = Math.max(b.high, h); b.low = Math.min(b.low, l); b.close = c; } else h1.push({ time: k, open: o, high: h, low: l, close: c }); }
const { trades } = runTrendEngine(h1);
const z = trades.filter((t) => t.status === "ENCERRADA").map((t) => ({ y: new Date(t.entryTime * 1000).getUTCFullYear(), R: t.resultR! - 0.5 / t.risk, usd: (t.resultR! - 0.5 / t.risk) * t.risk * 4100 / t.entry, m: t.module }));
console.log(`${(z.length / 105).toFixed(1)} op/mês · ${(z.reduce((s, x) => s + x.R, 0) / 8.75).toFixed(0)}R/ano · por ano [${[2018,2019,2020,2021,2022,2023,2024,2025,2026].map((y) => z.filter((x) => x.y === y).reduce((s, x) => s + x.R, 0).toFixed(0)).join(" ")}] · US$/mês (preço de hoje) ${(z.reduce((s, x) => s + x.usd, 0) / 105).toFixed(0)}`);
const by: any = {}; for (const x of z) by[x.m] = (by[x.m] ?? 0) + 1; console.log(by);
