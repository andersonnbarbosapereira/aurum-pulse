"use client";

import { useEffect,useMemo,useState } from "react";

type Market={
  price:number;
  bias:"LONG"|"SHORT"|"WAIT";
  structure:string;
  dna:any;
  preparation:{
    overall:number;
    direction:"LONG"|"SHORT"|"NEUTRAL";
    engines:Array<{engine:string;preparation:number;m1Confirmed:boolean;missing:string[]}>;
  };
};

function px(v:any){const n=Number(v);return Number.isFinite(n)?n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";}
function side(v:string){return v==="BULLISH"||v==="LONG"?"ALTA":v==="BEARISH"||v==="SHORT"?"BAIXA":"NEUTRO";}
function when(v:any){const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}
function statusTone(ok:boolean|null|undefined){return ok?"health-ok":"health-bad";}

export default function DecisionIntelligence({market}:{market:Market}){
  const [ctx,setCtx]=useState<any>(null);
  const [health,setHealth]=useState<any>(null);

  useEffect(()=>{
    let alive=true;
    const loadContext=async()=>{
      try{
        const r=await fetch("/api/context",{cache:"no-store"});
        const j=await r.json();
        if(alive&&j?.ok)setCtx(j.data);
      }catch{}
    };
    const loadHealth=async()=>{
      try{
        const r=await fetch("/api/system-health",{cache:"no-store"});
        const j=await r.json();
        if(alive)setHealth(j);
      }catch{}
    };
    loadContext();loadHealth();
    const c=window.setInterval(()=>document.visibilityState==="visible"&&loadContext(),300000);
    const h=window.setInterval(()=>document.visibilityState==="visible"&&loadHealth(),60000);
    return()=>{alive=false;clearInterval(c);clearInterval(h);};
  },[]);

  const nearest=useMemo(()=>{
    if(!ctx)return{above:null,below:null,macro:null};
    const all=[...(ctx.levels?.resistance??[]),...(ctx.levels?.support??[])];
    const above=all.filter((x:any)=>x.price>market.price).sort((a:any,b:any)=>a.distance-b.distance)[0]??null;
    const below=all.filter((x:any)=>x.price<market.price).sort((a:any,b:any)=>a.distance-b.distance)[0]??null;
    const macro=(ctx.macroZones??[])[0]??null;
    return{above,below,macro};
  },[ctx,market.price]);

  const bestPrep=[...(market.preparation?.engines??[])].sort((a,b)=>b.preparation-a.preparation)[0]??null;
  const guided=[
    {
      n:"01",title:"Contexto maior",
      text:ctx
        ?("H4 "+side(ctx.frames?.H4?.bias)+" · H1 "+side(ctx.frames?.H1?.bias)+" · M15 "+side(ctx.frames?.M15?.bias)+".")
        :"Carregando leitura multi-timeframe…"
    },
    {
      n:"02",title:"Onde o preço está",
      text:ctx
        ?(nearest.above||nearest.below
          ?"Acima: "+(nearest.above?px(nearest.above.price)+" ("+nearest.above.strength+")":"sem nível próximo")+" · Abaixo: "+(nearest.below?px(nearest.below.price)+" ("+nearest.below.strength+")":"sem nível próximo")+"."
          :"Sem suporte/resistência multi-timeframe próximo.")
        :"Carregando mapa estrutural…"
    },
    {
      n:"03",title:"O que está sendo construído",
      text:"Preparação M5 "+market.preparation.overall+"% para "+(market.preparation.direction==="LONG"?"COMPRA":market.preparation.direction==="SHORT"?"VENDA":"NEUTRO")+(bestPrep?.missing?.length?" · falta: "+bestPrep.missing.join(", "):".")
    },
    {
      n:"04",title:"Conduta agora",
      text:market.dna
        ?((market.dna.side==="LONG"?"COMPRA":"VENDA")+" FINAL_V1 aprovada · entrada "+px(market.dna.entry)+" · stop "+px(market.dna.originalStop)+" · 2R "+px(market.dna.target2R)+" · 3R "+px(market.dna.target3R)+".")
        :"AGUARDAR. Nenhuma entrada FINAL_V1 aprovada neste instante."
    }
  ];

  const hb=health?.health;
  const age=hb?.cron_at?(Date.now()-Date.parse(hb.cron_at))/60000:null;
  const cronOk=age!=null&&age<3;

  return <section className="intel-stack">
    <section className="section-headline"><div><span className="section-kicker">LEITURA GUIADA</span><h2>Do contexto à decisão em quatro passos</h2></div><span className="muted">Contexto informativo · não altera FINAL_V1</span></section>
    <article className="card guided-card">
      {guided.map(g=><div className="guided-step" key={g.n}><b>{g.n}</b><div><strong>{g.title}</strong><p>{g.text}</p></div></div>)}
    </article>

    <section className="section-headline"><div><span className="section-kicker">MULTI-TIMEFRAME</span><h2>Estrutura por tempo gráfico</h2></div><span className="muted">Leitura paralela ao motor</span></section>
    <article className="card mtf-card">
      <div className="mtf-head"><span>TF</span><span>Direção</span><span>BOS</span><span>Sweep</span><span>Deslocamento</span><span>ATR</span></div>
      {ctx?["H4","H1","M30","M15","M5"].map(tf=>{
        const x=ctx.frames?.[tf]??{};
        return <details className="mtf-row" key={tf}>
          <summary>
            <strong>{tf}</strong>
            <span className={x.bias==="BULLISH"?"positive-text":x.bias==="BEARISH"?"negative-text":""}>{side(x.bias)}</span>
            <span>{x.bos?"✓":"—"}</span><span>{x.sweep?"✓":"—"}</span><span>{x.displacement?"✓":"—"}</span><span>{px(x.atr)}</span>
          </summary>
          <div className="mtf-detail">Fechamento analisado: {px(x.lastClose)} · BOS, sweep e deslocamento são apenas leitura de contexto deste painel.</div>
        </details>;
      }):<div className="intel-loading">Carregando estrutura multi-timeframe…</div>}
      <div className="mtf-m1">
        <strong>M1</strong>
        <span>Gatilho</span>
        <span>{bestPrep?.m1Confirmed?"✓ confirmado":"pendente"}</span>
        <span className="muted">vem do diagnóstico do FINAL_V1</span>
      </div>
    </article>

    <section className="context-grid">
      <article className="card">
        <div className="card-head"><span>S/R multi-timeframe</span><span className="muted">2+ TFs</span></div>
        {ctx?<div className="context-levels">
          {[...(ctx.levels?.resistance??[]),...(ctx.levels?.support??[])].sort((a:any,b:any)=>a.distance-b.distance).slice(0,8).map((x:any)=>
            <details key={x.type+x.price}>
              <summary><div><strong>{px(x.price)}</strong><span>{x.type==="RESISTANCE"?"resistência":"suporte"} · {x.strength}</span></div><small>{x.distance.toFixed(2)} pts</small></summary>
              <p>{x.timeframes.join(" + ")} · {x.touches} ocorrências agrupadas · último toque {when(x.lastTouch)}</p>
            </details>
          )}
        </div>:<div className="intel-loading">Carregando níveis…</div>}
      </article>

      <article className="card">
        <div className="card-head"><span>Zonas macro</span><span className="muted">H4 · semana · mês</span></div>
        {ctx?<div className="context-levels">
          {(ctx.macroZones??[]).map((z:any)=><details key={z.center+z.side}>
            <summary><div><strong>{px(z.low)} — {px(z.high)}</strong><span>{z.side} · {z.strength}</span></div><small>{z.distance.toFixed(2)} pts</small></summary>
            <p>{(z.labels??[]).join(" · ")} · score contextual {z.score}</p>
          </details>)}
        </div>:<div className="intel-loading">Carregando zonas macro…</div>}
      </article>
    </section>

    <section className="section-headline"><div><span className="section-kicker">SAÚDE DO SISTEMA</span><h2>O painel está realmente operando?</h2></div><span className="muted">heartbeat do ciclo de 1 minuto</span></section>
    <article className="card health-grid">
      <div><i className={statusTone(hb?.capital_ok===true)}/><span>Capital</span><strong>{hb?.capital_ok?"OK":"PENDENTE"}</strong></div>
      <div><i className={statusTone(cronOk)}/><span>Cron</span><strong>{cronOk?"OK":"ATRASADO"}</strong></div>
      <div><i className={statusTone(hb?.telegram_bound===true)}/><span>Telegram</span><strong>{hb?.telegram_bound?"OK":"PENDENTE"}</strong></div>
      <div><i className={statusTone(hb?.shadow_ok===true)}/><span>Supabase</span><strong>{hb?.shadow_ok?"OK":"PENDENTE"}</strong></div>
      <div><i className={statusTone(health?.aiConfigured===true)}/><span>IA</span><strong>{health?.aiConfigured?"CONFIGURADA":"PENDENTE"}</strong></div>
      <div className="health-wide"><span>Último ciclo</span><strong>{hb?.cron_at?when(hb.cron_at):"—"}</strong><small>{hb?.last_decision??"sem heartbeat ainda"}</small></div>
    </article>
  </section>;
}
