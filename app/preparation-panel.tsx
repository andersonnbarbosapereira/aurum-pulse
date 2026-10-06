"use client";

import { useEffect,useState } from "react";

type Factor={key:string;label:string;active:boolean;weight:number};
type EngineRow={engine:string;side:"LONG"|"SHORT";preparation:number;rawScore:number;threshold:number;m1Confirmed:boolean;mandatoryOk:boolean;riskPct:number;factors:Factor[];missing:string[]};
type Prep={overall:number;direction:"LONG"|"SHORT"|"NEUTRAL";updatedAt:string;engines:EngineRow[];history:Array<{time:string;overall:number;direction:"LONG"|"SHORT"|"NEUTRAL"}>};

function name(e:string){
  if(e==="LIQUIDITY_REVERSAL")return"Reversão de Liquidez";
  if(e==="INSTITUTIONAL_PULLBACK")return"Retração Institucional";
  if(e==="LIQUIDITY_CONTINUATION")return"Continuação de Liquidez";
  return e;
}
function side(s:string){return s==="LONG"?"COMPRA":s==="SHORT"?"VENDA":"NEUTRO";}
function hh(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});}
function tone(v:number){return v>=80?"prep-hot":v>=60?"prep-warm":v>=35?"prep-building":"prep-cold";}

export default function PreparationPanel({initial}:{initial:Prep}){
  const [p,setP]=useState(initial);
  const [refreshing,setRefreshing]=useState(false);

  useEffect(()=>{
    let alive=true;
    const tick=async()=>{
      if(document.visibilityState!=="visible")return;
      setRefreshing(true);
      try{
        const r=await fetch("/api/snapshot",{cache:"no-store"});
        if(r.ok){
          const j=await r.json();
          if(alive&&j?.data?.preparation)setP(j.data.preparation);
        }
      }catch{}finally{if(alive)setRefreshing(false);}
    };
    const id=window.setInterval(tick,300000);
    return()=>{alive=false;window.clearInterval(id);};
  },[]);

  return <section className="prep-wrap">
    <article className="card prep-main">
      <div className="card-head">
        <span>Preparação do mercado</span>
        <span className="muted">M5 · atualização automática a cada 5 min</span>
      </div>
      <div className="prep-hero">
        <div className={"prep-score "+tone(p.overall)}><strong>{p.overall}</strong><span>%</span></div>
        <div>
          <small>Direção mais preparada</small>
          <h3>{side(p.direction)}</h3>
          <p>Este índice é informativo. O FINAL_V1 continua liberando ou bloqueando o sinal pelas regras validadas.</p>
        </div>
      </div>
      <div className="prep-meter"><i style={{width:String(Math.max(0,Math.min(100,p.overall)))+"%"}} /></div>
      <div className="prep-history">
        {p.history.map((h)=><div key={h.time}><span>{hh(h.time)}</span><strong className={tone(h.overall)}>{h.overall}%</strong><small>{side(h.direction)}</small></div>)}
      </div>
      <div className="prep-footer"><span>Última leitura: {hh(p.updatedAt)}</span><span>{refreshing?"atualizando…":"próxima atualização automática"}</span></div>
    </article>

    <div className="prep-engines">
      {p.engines.map((e)=><details className="card prep-engine" key={e.engine}>
        <summary>
          <div><small>{side(e.side)}</small><strong>{name(e.engine)}</strong><span>score bruto {e.rawScore}/{e.threshold}</span></div>
          <div className={tone(e.preparation)}><strong>{e.preparation}%</strong><span>abrir</span></div>
        </summary>
        <div className="prep-engine-body">
          <div className="prep-factor-list">
            {e.factors.sort((a,b)=>b.weight-a.weight).map((f)=><div className={f.active?"factor-on":"factor-off"} key={f.key}>
              <span>{f.active?"✓":"·"} {f.label}</span><strong>{f.active?"+":""}{f.active?f.weight:0}<small> / {f.weight}</small></strong>
            </div>)}
          </div>
          <div className="prep-gates">
            <div><span>M1</span><strong>{e.m1Confirmed?"CONFIRMADO":"PENDENTE"}</strong></div>
            <div><span>Obrigatórios</span><strong>{e.mandatoryOk?"OK":"PENDENTE"}</strong></div>
            <div><span>Risco estrutural</span><strong>{e.riskPct.toFixed(3)}%</strong></div>
          </div>
          <div className="prep-missing">
            <small>O que falta</small>
            <p>{e.missing.length?e.missing.join(" · "):"Nenhum requisito intermediário pendente nesta leitura."}</p>
          </div>
        </div>
      </details>)}
    </div>
  </section>;
}
