import fs from "node:fs";
const R: any[] = JSON.parse(fs.readFileSync("combo_out.json", "utf8"));
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : " — ");
const trainOk = (r: any) => r.tr.n >= 50 && r.tr.a >= 0.12 && r.years.slice(0, 5).filter((v: number) => v > 0).length >= 4;
const S = R.filter(trainOk);
console.log(`Total ${R.length} · passam no TREINO (média ≥ +0,12R, ≥4 de 5 anos positivos): ${S.length}`);
console.log(`  destas, validação 2023–24 > 0: ${S.filter((r) => r.va.a > 0).length} · teste 2025–26 > 0: ${S.filter((r) => r.te.a > 0).length} · as duas: ${S.filter((r) => r.va.a > 0 && r.te.a > 0).length}`);
const rnd = R.filter((r) => r.tr.n >= 50); console.log(`  referência (todas as combinações): validação>0 ${(100 * rnd.filter((r) => r.va.a > 0).length / rnd.length).toFixed(0)}% · teste>0 ${(100 * rnd.filter((r) => r.te.a > 0).length / rnd.length).toFixed(0)}%`);
const line = (r: any) => `${r.name.padEnd(62)} ${r.perMonth.toFixed(1).padStart(4)}/mês · tr ${sg(r.tr.a)} va ${sg(r.va.a)} te ${sg(r.te.a)} · anos [${r.years.map(sg).join(" ")}] · 2025-26 US$ ${r.usdRec.toFixed(0)}/mês`;
console.log("\nTOP 30 pelo TREINO que também passaram na VALIDAÇÃO (o teste só confere):");
for (const r of S.filter((r) => r.va.a > 0).sort((a, b) => b.tr.a - a.tr.a).slice(0, 30)) console.log(line(r));
console.log("\nMelhor combinação por GATILHO (critério: treino, com validação > 0):");
const byT = new Map<string, any>(); for (const r of S.filter((r) => r.va.a > 0)) { const t = r.name.split(" | ")[0]; if (!byT.has(t) || byT.get(t).tr.a < r.tr.a) byT.set(t, r); }
for (const r of [...byT.values()].sort((a, b) => b.tr.a - a.tr.a)) console.log(line(r));
console.log("\nGatilhos SEM nenhuma combinação aprovada no treino+validação:", [...new Set(R.map((r) => r.name.split(" | ")[0]))].filter((t) => !byT.has(t)).join(", "));
console.log("\nMais FREQUENTES aprovadas (≥ 4/mês, treino+validação > 0):");
for (const r of S.filter((r) => r.va.a > 0 && r.perMonth >= 4).sort((a, b) => b.tr.a * b.perMonth - a.tr.a * a.perMonth).slice(0, 15)) console.log(line(r));
