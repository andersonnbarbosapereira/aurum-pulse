"use client";

import { useEffect, useState } from "react";

type Trade = { module: string; side: "LONG" | "SHORT"; entryTime: number; entry: number; stop: number; currentStop: number; status: string; exitTime?: number; exitReason?: string; resultR?: number; bestR: number; risk: number };
type Stats = { trades: number; totalR: number; avgR: number; winRate: number; profitFactor: number; maxDrawdownR: number; usd001: number };
type Setup = Stats & { module: string; label: string; desc: string };
type Data = {
  engine: string; candlesH1: number; from: string | null;
  state: { trendH4: number; trendD1: number; extH4: number; lastClosedH1: number; atrH1: number; watch: { module: string; label: string; text: string }[] };
  active: Trade[]; recent: Trade[]; stats: Stats; setups: Setup[];
};

const side = (s: string) => (s === "LONG" ? "COMPRA" : "VENDA");
const dir = (v: number) => (v === 1 ? "ALTA" : v === -1 ? "BAIXA" : "SEM TENDÊNCIA");
const dirTone = (v: number) => (v === 1 ? "pill-good" : v === -1 ? "pill-bad" : "pill-warn");
const r = (v?: number) => (Number.isFinite(v) ? `${(v as number) >= 0 ? "+" : ""}${(v as number).toFixed(2)}R` : "—");
const usd = (v?: number) => (Number.isFinite(v) ? `${(v as number) >= 0 ? "+" : "−"}US$ ${Math.abs(v as number).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "—");
const px = (v: number) => (Number.isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const dt = (s?: number) => (s ? new Date(s * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const why = (w?: string) => (w === "trailing" ? "stop móvel" : w === "stop" ? "stop" : w === "tempo" ? "tempo" : "—");

export default function TrendPanel() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/trend-engine", { cache: "no-store" });
        const j = await res.json();
        if (alive) { if (res.ok && j?.state) { setD(j); setErr(false); } else setErr(true); }
      } catch { if (alive) setErr(true); }
    };
    tick();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") tick(); }, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);
  const label = (m: string) => d?.setups.find((s) => s.module === m)?.label ?? m;
  const months = d?.from ? Math.max(1, (Date.now() - Date.parse(d.from)) / (30.44 * 86_400_000)) : 12;

  return (
    <>
      <section className="section-headline">
        <div><span className="section-kicker">NOVO MOTOR · AURUM_TREND_V2 · SOMBRA</span><h2>Carteira de setups a favor da tendência</h2></div>
        <span className="muted">5 setups independentes · sem Telegram · execução manual</span>
      </section>
      {!d ? (
        <article className="card"><p className="muted">{err ? "Dados indisponíveis no momento. Nova tentativa em 1 min." : "Carregando o motor de tendência…"}</p></article>
      ) : (
        <section className="trend-grid">
          <article className="card">
            <div className="card-head"><span>Leitura agora</span><span className="muted">último H1 fechado {dt(d.state.lastClosedH1 + 3600)}</span></div>
            <div className="trend-row"><small>Tendência D1</small><span className={`pill ${dirTone(d.state.trendD1)}`}>{dir(d.state.trendD1)}</span></div>
            <div className="trend-row"><small>Tendência H4</small><span className={`pill ${dirTone(d.state.trendH4)}`}>{dir(d.state.trendH4)}</span></div>
            <div className="trend-row"><small>ATR H1</small><strong>{d.state.atrH1.toFixed(1)} pts</strong></div>
            {d.state.watch.map((w) => <div className="trend-ready" key={w.module + w.text}><b>{w.label}</b><p>{w.text}</p></div>)}
          </article>

          <article className="card">
            <div className="card-head"><span>Operações abertas</span><span className="muted">stop móvel 6×ATR(H1)</span></div>
            {d.active.length ? d.active.map((t) => (
              <div className="trend-trade" key={t.module + t.entryTime}>
                <div className="trend-row"><b>{label(t.module)}</b><span className={`pill ${t.side === "LONG" ? "pill-good" : "pill-bad"}`}>{side(t.side)}</span></div>
                <div className="trend-row"><small>Entrada</small><strong>{px(t.entry)} · {dt(t.entryTime)}</strong></div>
                <div className="trend-row"><small>Stop atual</small><strong>{px(t.currentStop)}</strong></div>
                <div className="trend-row"><small>Risco com 0,01 lote</small><strong>US$ {t.risk.toFixed(0)}</strong></div>
                <div className="trend-row"><small>Melhor até agora</small><strong>{r(t.bestR)}</strong></div>
              </div>
            )) : <p className="muted">Nenhuma operação aberta agora.</p>}
          </article>

          <article className="card">
            <div className="card-head"><span>Resultado recalculado (Capital, ~1 ano)</span><span className="muted">{d.candlesH1} candles H1</span></div>
            <div className="trend-stats">
              <div><small>Operações</small><strong>{d.stats.trades}</strong></div>
              <div><small>Por mês</small><strong>{(d.stats.trades / months).toFixed(1)}</strong></div>
              <div><small>Acerto</small><strong>{(d.stats.winRate * 100).toFixed(0)}%</strong></div>
              <div><small>Média</small><strong className={d.stats.avgR >= 0 ? "positive-text" : "negative-text"}>{r(d.stats.avgR)}</strong></div>
              <div><small>Total 0,01 lote</small><strong className={d.stats.usd001 >= 0 ? "positive-text" : "negative-text"}>{usd(d.stats.usd001)}</strong></div>
              <div><small>Por mês 0,01</small><strong className={d.stats.usd001 >= 0 ? "positive-text" : "negative-text"}>{usd(d.stats.usd001 / months)}</strong></div>
            </div>
            <p className="muted trend-note">Sem descontar spread. Histórico 2018–2026 (HistData, custo 0,5 pt): ~23 operações/mês, +0,42R por operação, positivo em todos os 9 anos; com o tamanho de stop atual ≈ US$ 250/mês em média com 0,01 lote. Pior queda histórica ≈ US$ 1.240 — meses negativos são normais (~45%).</p>
          </article>

          <article className="card trend-wide">
            <div className="card-head"><span>Setups ativos</span><span className="muted">resultado recalculado no último ano (0,01 lote)</span></div>
            <div className="trend-table">
              {d.setups.map((s) => (
                <div className="trend-tr trend-tr-setup" key={s.module}>
                  <span><b>{s.label}</b><br /><small className="muted">{s.desc}</small></span>
                  <span>{s.trades} op</span><span>{(s.winRate * 100).toFixed(0)}% acerto</span>
                  <strong className={s.avgR >= 0 ? "positive-text" : "negative-text"}>{r(s.avgR)}</strong>
                  <strong className={s.usd001 >= 0 ? "positive-text" : "negative-text"}>{usd(s.usd001)}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="card trend-wide">
            <div className="card-head"><span>Últimas operações encerradas</span><span className="muted">resultado em R e em US$ (0,01 lote)</span></div>
            <div className="trend-table">
              {d.recent.map((t) => (
                <div className="trend-tr" key={t.module + t.entryTime}>
                  <span>{dt(t.entryTime)}</span><span>{label(t.module)}</span><span>{side(t.side)}</span><span>{px(t.entry)}</span><span>{why(t.exitReason)}</span>
                  <strong className={(t.resultR ?? 0) >= 0 ? "positive-text" : "negative-text"}>{r(t.resultR)} · {usd((t.resultR ?? 0) * t.risk)}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}
    </>
  );
}
