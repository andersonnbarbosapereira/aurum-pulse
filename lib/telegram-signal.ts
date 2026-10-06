import type { LiveFinalSnapshot } from "@/lib/live-final-engine";

function money(n:number){return `US$${n.toFixed(2)}`;}
function price(n:number){return n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}

export function formatTelegramSignal(s:LiveFinalSnapshot){
  if(!s.dna){
    return [
      "🟡 AURUM PULSE · AGUARDAR",
      "",
      "XAUUSD",
      `Preço: ${price(s.price)}`,
      `Motor: ${s.engineVersion}`,
      "",
      s.structure,
      "",
      "Nenhuma execução sugerida agora."
    ].join("\n");
  }
  const d=s.dna;
  const side=d.side==="LONG"?"COMPRA":"VENDA";
  return [
    `🟢 AURUM PULSE · ${side} · ${d.signalClass}`,
    "",
    "XAUUSD",
    `Entrada de referência: ${price(d.entry)}`,
    `Stop estrutural: ${price(d.originalStop)}`,
    `Risco estrutural: ${d.riskPercent.toFixed(3)}%`,
    `Risco estimado 0,01 lote: ${money(d.estimatedRiskUsd001)}`,
    "",
    `Parcial planejada (2R): ${price(d.target2R)} · 30%`,
    `Alvo principal (3R): ${price(d.target3R)} · 70%`,
    "",
    `Motor(es): ${d.engines.join(" + ")}`,
    `Score: ${d.score}`,
    `Confirmações: ${d.thesis.join(" · ")}`,
    "",
    `Invalidação: ${d.invalidation}`,
    "",
    "⚠️ Execução manual. O Aurum Pulse não envia ordens à corretora."
  ].join("\n");
}
