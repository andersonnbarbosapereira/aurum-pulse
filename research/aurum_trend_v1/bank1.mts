import fs from "node:fs";
const T: any[] = JSON.parse(fs.readFileSync("bank_trades.json", "utf8"));
const rec = T.filter((x) => x.t >= Date.UTC(2025, 0, 1) / 1000);
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
console.log("Risco por operação com 0,01 lote em 2025–26 (US$): p10", q(rec.map((x) => x.risk), 0.1).toFixed(0), "· mediana", q(rec.map((x) => x.risk), 0.5).toFixed(0), "· p90", q(rec.map((x) => x.risk), 0.9).toFixed(0), "· máx", Math.max(...rec.map((x) => x.risk)).toFixed(0));
for (const m of [...new Set(T.map((x) => x.m))]) { const z = rec.filter((x) => x.m === m); console.log("  ", m.padEnd(11), "mediana US$", q(z.map((x) => x.risk), 0.5).toFixed(0), "p90", q(z.map((x) => x.risk), 0.9).toFixed(0)); }
// a vantagem depende do tamanho do stop? (stop relativo = risco / preço, em %, comparável entre anos)
console.log("\nResultado por faixa de stop RELATIVO (risco/preço) — 2018–2026, todos os setups:");
const rel = T.map((x) => ({ ...x, rp: (x.risk / x.px) * 100 })), cuts = [0, 0.25, 0.35, 0.5, 0.7, 1, 9];
for (let i = 0; i < cuts.length - 1; i++) { const z = rel.filter((x) => x.rp >= cuts[i] && x.rp < cuts[i + 1]); if (!z.length) continue; const tr = z.filter((x) => new Date(x.t * 1000).getUTCFullYear() <= 2022), te = z.filter((x) => new Date(x.t * 1000).getUTCFullYear() >= 2023); const av = (a: any[]) => (a.length ? a.reduce((s, x) => s + x.R, 0) / a.length : NaN); console.log(`  stop ${cuts[i]}–${cuts[i + 1]}% do preço: ${z.length} op · média ${av(z).toFixed(2)}R · 2018–22 ${av(tr).toFixed(2)} (${tr.length}) · 2023–26 ${av(te).toFixed(2)} (${te.length}) · em US$ hoje (preço 4100): ${(cuts[i] * 41).toFixed(0)}–${(cuts[i + 1] * 41).toFixed(0)}`); }
