import { simulate, line, stats } from "./lib.mts";
import { F1, F2, F2b, F1b } from "./families.mts";
const fam = process.argv[2]; const rows: { name: string; tr: any[] }[] = [];
const add = (name: string, sigs: any[]) => rows.push({ name, tr: simulate(sigs) });
if (fam === "F2b") for (const n of [24, 48, 72]) for (const stopAtr of [1.5, 2.5]) for (const trail of [3, 4, 6]) for (const flt of ["d1", "h4", "both"] as const) add(`F2b n${n} stop${stopAtr} trail${trail} ${flt}`, F2b({ n, stopAtr, trail, flt }));
if (fam === "F1b") for (const rsiTh of [40, 45, 50]) for (const look of [4, 8]) for (const trail of [2, 3, 4]) for (const d1 of [false, true]) add(`F1b rsi${rsiTh} look${look} trail${trail} d1${+d1}`, F1b({ rsiTh, look, trail, d1 }));
if (fam === "LS") { // compra × venda dos candidatos
  for (const [nm, s] of [["F2 n60 s2.5 t4 d1", F2({ n: 60, stopAtr: 2.5, trail: 4, d1: true })], ["F2 n40 s2.5 t4 d1", F2({ n: 40, stopAtr: 2.5, trail: 4, d1: true })], ["F1 rsi50 look8 trail4 d1", F1({ rsiTh: 50, look: 8, tp: null, trail: 4, d1: true })]] as const) {
    const t = simulate(s as any); console.log(line(nm + " COMPRA", t.filter((x) => x.dir === 1))); console.log(line(nm + " VENDA", t.filter((x) => x.dir === -1))); }
}
rows.sort((a, b) => stats(b.tr).train - stats(a.tr).train);
if (rows.length) { console.log(`${fam}: ${rows.length} variações (ordenadas pelo treino)`); for (const r of rows.slice(0, 12)) console.log(line(r.name, r.tr)); console.log("mediana do treino entre variações:", stats(rows[Math.floor(rows.length / 2)].tr).train.toFixed(2), "· % variações com treino>0:", (100 * rows.filter((r) => stats(r.tr).train > 0).length / rows.length).toFixed(0) + "%", "· % com teste>0:", (100 * rows.filter((r) => stats(r.tr).test > 0).length / rows.length).toFixed(0) + "%"); }
