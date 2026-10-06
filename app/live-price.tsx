"use client";

import { useEffect,useRef,useState } from "react";

type Quote={price:number;changePercent:number;bid:number|null;ask:number|null;updatedAt:string};

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

  return (
    <div className="price-row">
      <div className="price">{q.price.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
      <div className="change">{q.changePercent>=0?"+":""}{q.changePercent.toFixed(2)}%</div>
    </div>
  );
}
