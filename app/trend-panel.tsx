"use client";

import { useEffect, useState } from "react";

type Trade = { module: string; side: "LONG" | "SHORT"; entryTime: number; entry: number; stop: number; currentStop: number; partialTaken: boolean; target2R: number; status: string; exitTime?: number; exitReason?: string; resultR?: number; bestR: number; risk: number };
type Stats = { trades: number; totalR: number; avgR: number; winRate: number; profitFactor: number; maxDrawdownR: number };
type Data = {
  engine: string; candlesH1: number; from: string | null;
  state: { trendH4: number; trendD1: number; extH4: number; lastClosedH1: number; levels: { atrH1: number; atrH4: number }; ready: { A: string; B: string } };
  active: Trade[]; recent: Trade[]; stats: Stats; byModule: Record<string, Stats>;
};

const modName = (m: string) => (m === "ROMPIMENTO_H1" ? "A · Rompimento H1" : "B · Rompimento H4");
const side = (s: string) => (s === "LONG" ? "COMPRA" : "VENDA");
const dir = (v: number) => (v === 1 ? "ALTA" : v === -1 ? "BAIXA" : "SEM TENDÊNCIA");
const dirTone = (v: number) => (v === 1 ? "pill-good" : v === -1 ? "pill-bad" : "pill-warn");
const r = (v?: number) => (Number.isFinite(v) ? `${(v as number) >= 0 ? "+" : ""}${(v as number).toFixed(2)}R` : "—");
const px = (v: number) => (Number.isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const dt = (s?: number) => (s ? new Date(s * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const why = (w?: string) => (w === "trailing" ? "stop móvel" : w === "stop" ? "stop" : w === "tempo" ? "tempo" : "—");

export default function TrendPanel() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible" && d) return;
      try {
        const res = await fetch("/api/trend-engine", { cache: "no-store" });
        const j = await res.json();
        if (alive) { if (res.ok && j?.state) { setD(j); setErr(false); } else setErr(true); }
      } catch { if (alive) setErr(true); }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <section className="section-headline">
        <div><span className="section-kicker">NOVO MOTOR · AURUM_TREND_V1 · SOMBRA</span><h2>Motor de tendência (rompimentos alinhados)</h2></div>
        <span className="muted">Independente do FINAL_V1 · sem Telegram · execução manual</span>
      </section>
      {!d ? (
        <article className="card"><p className="muted">{err ? "Dados indisponíveis no momento. Nova tentativa em 1 min." : "Carregando o motor de tendência…"}</p></article>
      ) : (
        <section className="trend-grid">
          <article className="card">
            <div className="card-head"><span>Leitura agora</span><span className="muted">último H1 fechado {dt(d.state.lastClosedH1 + 3600)}</span></div>
            <div className="trend-row"><small>Tendência H4</small><span className={`pill ${dirTone(d.state.trendH4)}`}>{dir(d.state.trendH4)}</span></div>
            <div className="trend-row"><small>Tendência D1</small><span className={`pill ${dirTone(d.state.trendD1)}`}>{dir(d.state.trendD1)}</span></div>
            <div className="trend-row"><small>Distância da EMA50 H4</small><strong>{d.state.extH4.toFixed(1)} ATR</strong></div>
            <div className="trend-ready"><b>A · Rompimento H1</b><p>{d.state.ready.A}</p></div>
            <div className="trend-ready"><b>B · Rompimento H4</b><p>{d.state.ready.B}</p></div>
          </article>

          <article className="card">
            <div className="card-head"><span>Operações abertas</span><span className="muted">gestão: parcial 33% em 2R (A) + stop móvel</span></div>
            {d.active.length ? d.active.map((t) => (
              <div className="trend-trade" key={t.module + t.entryTime}>
                <div className="trend-row"><b>{modName(t.module)}</b><span className={`pill ${t.side === "LONG" ? "pill-good" : "pill-bad"}`}>{side(t.side)}</span></div>
                <div className="trend-row"><small>Entrada</small><strong>{px(t.entry)} · {dt(t.entryTime)}</strong></div>
                <div className="trend-row"><small>Stop atual</small><strong>{px(t.currentStop)}</strong></div>
                <div className="trend-row"><small>Melhor até agora</small><strong>{r(t.bestR)}{t.partialTaken ? " · parcial feita" : ""}</strong></div>
              </div>
            )) : <p className="muted">Nenhuma operação aberta. O motor só entra quando o H1/H4 fecha rompendo a favor do H4 e do D1.</p>}
          </article>

          <article className="card">
            <div className="card-head"><span>Resultado recalculado (Capital, ~1 ano)</span><span className="muted">{d.candlesH1} candles H1</span></div>
            <div className="trend-stats">
              <div><small>Operações</small><strong>{d.stats.trades}</strong></div>
              <div><small>Acerto</small><strong>{(d.stats.winRate * 100).toFixed(0)}%</strong></div>
              <div><small>Média</small><strong className={d.stats.avgR >= 0 ? "positive-text" : "negative-text"}>{r(d.stats.avgR)}</strong></div>
              <div><small>Total</small><strong className={d.stats.totalR >= 0 ? "positive-text" : "negative-text"}>{r(d.stats.totalR)}</strong></div>
              <div><small>PF</small><strong>{d.stats.profitFactor.toFixed(2)}</strong></div>
              <div><small>Queda máx.</small><strong>{d.stats.maxDrawdownR.toFixed(1)}R</strong></div>
            </div>
            <p className="muted trend-note">R sem descontar spread. Histórico 2018–2026 (HistData) com custo de 0,5 pt: +0,45R por operação, PF 1,8, positivo em 8 de 9 anos. Média de ~1 operação por semana: a vantagem vem de deixar o lucro correr por dias.</p>
          </article>

          <article className="card trend-wide">
            <div className="card-head"><span>Últimas operações encerradas</span><span className="muted">A {r(d.byModule.ROMPIMENTO_H1?.avgR)} · B {r(d.byModule.ROMPIMENTO_H4?.avgR)} por operação</span></div>
            <div className="trend-table">
              {d.recent.map((t) => (
                <div className="trend-tr" key={t.module + t.entryTime}>
                  <span>{dt(t.entryTime)}</span><span>{modName(t.module)}</span><span>{side(t.side)}</span><span>{px(t.entry)}</span><span>{why(t.exitReason)}</span>
                  <strong className={(t.resultR ?? 0) >= 0 ? "positive-text" : "negative-text"}>{r(t.resultR)}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}
    </>
  );
}
