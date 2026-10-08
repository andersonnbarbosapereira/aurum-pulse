// Monta M5 contínuo 2018-01 → 2026-09 a partir do HistData M1 (UTC). Fonte única, rotulada.
import fs from "node:fs";
const dir = "../bt/data_hist/";
let m1: number[][] = [];
for (const y of [2018, 2019, 2020, 2021, 2022, 2023]) for (const r of JSON.parse(fs.readFileSync(`${dir}${y}full.json`, "utf8"))) m1.push(r);
const rest = JSON.parse(fs.readFileSync("../bt/data_hist_all.json", "utf8")).M1 as number[][];
for (const r of rest) m1.push(r);
m1.sort((a, b) => a[0] - b[0]);
const m5: number[][] = []; let last = -1;
for (const [t, o, h, l, c] of m1) { if (t === last) continue; last = t; const k = Math.floor(t / 300) * 300; const b = m5[m5.length - 1];
  if (b && b[0] === k) { b[2] = Math.max(b[2], h); b[3] = Math.min(b[3], l); b[4] = c; b[5]++; } else m5.push([k, o, h, l, c, 1]); }
fs.writeFileSync("m5.json", JSON.stringify(m5));
// checagem de buracos: meses com poucos candles
const mo = new Map<string, number>(); for (const b of m5) { const k = new Date(b[0] * 1000).toISOString().slice(0, 7); mo.set(k, (mo.get(k) ?? 0) + 1); }
console.log("M5", m5.length, new Date(m5[0][0] * 1000).toISOString(), "→", new Date(m5.at(-1)![0] * 1000).toISOString());
console.log("meses com < 5000 candles M5:", [...mo].filter(([, n]) => n < 5000).map(([k, n]) => `${k}:${n}`).join(" "));
