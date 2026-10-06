"use client";

import { useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh(){
  const router=useRouter();
  const [last,setLast]=useState(()=>new Date());
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);

  useEffect(()=>{
    let alive=true;

    const refresh=()=>{
      if(!alive||document.visibilityState!=="visible"||lock.current)return;
      lock.current=true;
      setBusy(true);
      router.refresh();
      window.setTimeout(()=>{
        if(!alive)return;
        setLast(new Date());
        setBusy(false);
        lock.current=false;
      },1200);
    };

    const id=window.setInterval(refresh,60000);
    const onVisibility=()=>{if(document.visibilityState==="visible")refresh();};
    const onFocus=()=>refresh();

    document.addEventListener("visibilitychange",onVisibility);
    window.addEventListener("focus",onFocus);

    return()=>{
      alive=false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange",onVisibility);
      window.removeEventListener("focus",onFocus);
    };
  },[router]);

  return <div className="auto-refresh" title="Painel principal em atualização automática: estado geral a cada minuto.">
    <i className={busy?"refresh-dot refreshing":"refresh-dot"} />
    <span>{busy?"Atualizando painel…":"Auto atualização 1 min"}</span>
    <small>{last.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small>
  </div>;
}
