"use client";

import { useEffect,useRef,useState } from "react";

type Quote={price:number;changePercent:number;bid:number|null;ask:number|null;updatedAt:string};

function px(n:number|null){
  return n==null?"—":n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function time(value:string){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

export default function LivePrice({initial}:{initial:Quote}){
  const [q,setQ]=useState(initial);
  const busy=useRef(false);

  useEffect(()=>{
    let alive=true;
    const tick=async()=>{
      if(document.visibilityState!=="visible"||busy.current)return;
      busy.current=true;
      try{
        const res=await fetch("/api/quote",{cache:"no-store"});
        if(res.ok){
          const data=await res.json();
          if(alive&&Number.isFinite(data?.price))setQ(data);
        }
      }catch{}finally{busy.current=false;}
    };
    const id=window.setInterval(tick,2000);
    tick();
    return()=>{alive=false;window.clearInterval(id);};
  },[]);

  const spread=q.bid!=null&&q.ask!=null?q.ask-q.bid:null;
  return (
    <div className="quote-live">
      <div className="price-row">
        <div className="price">{px(q.price)}</div>
        <div className={q.changePercent>=0?"change positive":"change negative"}>{q.changePercent>=0?"+":""}{q.changePercent.toFixed(2)}%</div>
      </div>
      <div className="quote-grid">
        <div><small>Bid</small><strong>{px(q.bid)}</strong></div>
        <div><small>Ask</small><strong>{px(q.ask)}</strong></div>
        <div><small>Spread</small><strong>{spread==null?"—":spread.toFixed(2)}</strong></div>
        <div><small>Último tick</small><strong>{time(q.updatedAt)}</strong></div>
      </div>
    </div>
  );
}
