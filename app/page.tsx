import { getLiveFinalSnapshot } from "@/lib/live-final-engine";
import type { MarketSnapshot } from "@/lib/market";
import { getShadowDashboard } from "@/lib/shadow-recorder";
import LivePrice from "@/app/live-price";
import PreparationPanel from "@/app/preparation-panel";
import DecisionIntelligence from "@/app/decision-intelligence";

export const dynamic="force-dynamic";

function Pill({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"good"|"warn"|"bad"}){
  return <span className={"pill pill-"+tone}>{children}</span>;
}
function Meter({value}:{value:number}){
  const v=Math.max(0,Math.min(100,Number(value)||0));
  return <div className="meter" aria-label={String(v)+"%"}><div className="meter-fill" style={{width:String(v)+"%"}} /></div>;
}
function biasLabel(bias:MarketSnapshot["bias"]){return bias==="LONG"?"COMPRA":bias==="SHORT"?"VENDA":"AGUARDAR";}
function biasTone(bias:MarketSnapshot["bias"]):"good"|"warn"{return bias==="WAIT"?"warn":"good";}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0;}
function px(v:any){const x=Number(v);return Number.isFinite(x)?x.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";}
function rfmt(v:any){const x=Number(v);return Number.isFinite(x)?(x>=0?"+":"")+x.toFixed(2)+"R":"—";}
function money(v:any){const x=Number(v);return Number.isFinite(x)?"US$ "+x.toFixed(2):"—";}
function time(v:any){const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
function engineName(e:string){
  if(e==="LIQUIDITY_REVERSAL")return"Reversão de Liquidez";
  if(e==="INSTITUTIONAL_PULLBACK")return"Retração Institucional";
  if(e==="LIQUIDITY_CONTINUATION")return"Continuação de Liquidez";
  return e;
}
function currentR(t:any,price:number){
  const entry=n(t?.entry),stop=n(t?.original_stop),risk=Math.abs(entry-stop);
  if(!risk)return 0;
  return t?.side==="SHORT"?(entry-price)/risk:(price-entry)/risk;
}
function drawdown(rs:number[]){
  let equity=0,peak=0,max=0;
  for(const r of rs){equity+=r;peak=Math.max(peak,equity);max=Math.max(max,peak-equity);}
  return max;
}
function distPoints(level:number,price:number){return level-price;}
function distR(level:number,price:number,risk:number){return risk>0?(level-price)/risk:null;}
function tagsForLevel(level:any,zones:any[],signal:any,active:any){
  const tags:string[]=[];
  if(level.strength==="FORTE")tags.push("nível forte");
  if(Number(level.touches)>=5)tags.push(String(level.touches)+" testes");
  const ageH=(Date.now()-Date.parse(level.lastTouch))/3600000;
  if(Number.isFinite(ageH)&&ageH<=6)tags.push("toque recente");
  const z=zones.find((x:any)=>level.price>=x.low&&level.price<=x.high);
  if(z)tags.push("dentro de "+z.type.toLowerCase());
  const ref=active||signal;
  if(ref){
    const risk=Math.abs(n(ref.entry)-n(ref.original_stop??ref.originalStop));
    if(risk>0){
      const near=(a:any)=>Math.abs(level.price-n(a))<=risk*.18;
      if(near(ref.entry))tags.push("próximo da entrada");
      if(near(ref.original_stop??ref.originalStop))tags.push("próximo do stop");
      if(near(ref.target_2r??ref.target2R))tags.push("próximo de 2R");
      if(near(ref.target_3r??ref.target3R))tags.push("próximo de 3R");
    }
  }
  return tags;
}

export default async function Home(){
  let market:Awaited<ReturnType<typeof getLiveFinalSnapshot>>|null=null;
  let dashboard:any={trades:[]};
  let connectionError=false;
  try{market=await getLiveFinalSnapshot();}catch{connectionError=true;}
  try{dashboard=await getShadowDashboard();}catch{}

  if(!market||connectionError){
    return <main className="shell">
      <header className="topbar">
        <div><div className="eyebrow">XAUUSD · MARKET INTELLIGENCE</div><h1>Aurum <span>Pulse</span></h1></div>
        <div className="top-actions"><Pill tone="warn">CONEXÃO PENDENTE</Pill><div className="live">Capital.com</div></div>
      </header>
      <article className="card outage-card"><span className="section-kicker">ESTADO DO SISTEMA</span><h2>Dados de mercado indisponíveis.</h2><p>O Aurum Pulse não gera decisão com dado fictício. O motor volta a operar quando a fonte real estiver disponível.</p></article>
    </main>;
  }

  const trades=Array.isArray(dashboard?.trades)?dashboard.trades:[];
  const active=trades.find((t:any)=>t.status==="OPEN"||t.status==="TP2")??null;
  const closed=[...trades].filter((t:any)=>t.realized_r!=null).sort((a:any,b:any)=>new Date(a.first_seen_at).getTime()-new Date(b.first_seen_at).getTime());
  const totalR=closed.reduce((s:number,t:any)=>s+n(t.realized_r),0);
  const totalUsd=closed.reduce((s:number,t:any)=>s+n(t.realized_usd),0);
  const wins=closed.filter((t:any)=>n(t.realized_r)>0).length;
  const winRate=closed.length?wins/closed.length*100:0;
  const maxDd=drawdown(closed.map((t:any)=>n(t.realized_r)));
  const activeR=active?currentR(active,market.price):0;
  const signal=market.dna;
  const aiReady=Boolean(process.env.GROQ_API_KEY);
  const riskRef=active?Math.abs(n(active.entry)-n(active.original_stop)):signal?Math.abs(n(signal.entry)-n(signal.originalStop)):0;
  const ladder=[
    ...market.marketMap.resistance.map((x:any)=>({kind:"RESISTÊNCIA",price:x.price,strength:x.strength,score:x.score,touches:x.touches,lastTouch:x.lastTouch})),
    ...market.marketMap.interestZones.map((z:any)=>({kind:z.type==="OFERTA"?"OFERTA":"DEMANDA",price:z.center,strength:z.strength,score:z.score,touches:null,lastTouch:null,low:z.low,high:z.high})),
    ...(signal?[{kind:"3R",price:signal.target3R,strength:"ALVO",score:100},{kind:"2R",price:signal.target2R,strength:"ALVO",score:100},{kind:"ENTRADA",price:signal.entry,strength:"ATUAL",score:100},{kind:"STOP",price:signal.originalStop,strength:"RISCO",score:100}]:[]),
    ...(active?[{kind:"TRADE",price:n(active.entry),strength:"ATIVO",score:100},{kind:"STOP ATUAL",price:n(active.current_stop??active.original_stop),strength:"RISCO",score:100},{kind:"2R",price:n(active.target_2r),strength:"ALVO",score:100},{kind:"3R",price:n(active.target_3r),strength:"ALVO",score:100}]:[]),
    {kind:"PREÇO",price:market.price,strength:"AGORA",score:100},
    ...market.marketMap.support.map((x:any)=>({kind:"SUPORTE",price:x.price,strength:x.strength,score:x.score,touches:x.touches,lastTouch:x.lastTouch}))
  ].sort((a:any,b:any)=>b.price-a.price);
  const recentTrades=trades.slice(0,10);
  const engineIds=["LIQUIDITY_REVERSAL","INSTITUTIONAL_PULLBACK","LIQUIDITY_CONTINUATION"];
  const engineBoard=engineIds.map(id=>{
    const assoc=trades.filter((t:any)=>Array.isArray(t.engines)&&t.engines.includes(id));
    const done=assoc.filter((t:any)=>t.realized_r!=null);
    const wins=done.filter((t:any)=>n(t.realized_r)>0).length;
    const sumR=done.reduce((s:number,t:any)=>s+n(t.realized_r),0);
    const last5=[...done].sort((a:any,b:any)=>new Date(b.closed_at??b.last_seen_at).getTime()-new Date(a.closed_at??a.last_seen_at).getTime()).slice(0,5).reduce((s:number,t:any)=>s+n(t.realized_r),0);
    return{id,n:assoc.length,closed:done.length,winRate:done.length?wins/done.length*100:0,sumR,last5};
  });

  return <main className="shell">
    <header className="topbar">
      <div>
        <div className="eyebrow">XAUUSD · MARKET INTELLIGENCE</div>
        <h1>Aurum <span>Pulse</span></h1>
        <div className="status-line"><span>FINAL_V1</span><span>LIVE_V2</span><span>CICLO 1 MIN</span><span>PREÇO ~2S</span></div>
      </div>
      <div className="top-actions">
        <Pill tone="good">LIVE · CAPITAL.COM</Pill>
        <div className="live"><i /> {market.marketStatus||"mercado monitorado"}</div>
      </div>
    </header>

    <section className="decision-strip">
      <div><small>Decisão agora</small><strong className={market.bias==="WAIT"?"decision-wait":"decision-go"}>{biasLabel(market.bias)}</strong></div>
      <div><small>Motor</small><strong>{market.engineVersion}</strong></div>
      <div><small>Gestão IA</small><strong>{aiReady?"ATIVA":"INDISPONÍVEL"}</strong></div>
      <div><small>Execução</small><strong>MANUAL</strong></div>
      <div><small>Janela operacional</small><strong>21:00–15:30 BRT</strong></div>
    </section>

    <section className="hero-grid">
      <article className="card price-card">
        <div className="card-head"><span>XAUUSD</span><span className="muted">Gold / US Dollar · {market.epic}</span></div>
        <LivePrice initial={{price:market.price,changePercent:market.changePercent,bid:null,ask:null,updatedAt:market.updatedAt}} />
        <div className="mini-grid">
          <div><small>Regime</small><strong>{market.regime}</strong></div>
          <div><small>Leitura</small><strong>{biasLabel(market.bias)}</strong></div>
          <div><small>Timeframes</small><strong>M1 · M5 · M15 · H1</strong></div>
        </div>
      </article>

      <article className={"card decision-card "+(market.bias==="WAIT"?"waiting":"actionable")}>
        <div className="card-head"><span>Decisão operacional</span><Pill tone={biasTone(market.bias)}>{biasLabel(market.bias)}</Pill></div>
        <div className="decision-main">{market.bias==="WAIT"?"Não entrar agora.":biasLabel(market.bias)+" aprovada pelo FINAL_V1."}</div>
        <p>{market.structure}</p>
        <div className="confidence">
          <div><span>Confiança do contexto</span><strong>{market.confidence}%</strong></div>
          <Meter value={market.confidence}/>
        </div>
        <div className="guardrails">
          <span>Risco ≤ 0,35%</span><span>Timing ≤ 0,25R</span><span>Alvo base 3R</span>
        </div>
      </article>
    </section>

    <section className="section-headline"><div><span className="section-kicker">PREPARAÇÃO M5</span><h2>Como o mercado está se aproximando de um setup</h2></div><span className="muted">Informativo · não altera o FINAL_V1</span></section>
    <PreparationPanel initial={market.preparation} />

<DecisionIntelligence market={{price:market.price,bias:market.bias,structure:market.structure,dna:market.dna,preparation:market.preparation}} />

    <section className="section-headline"><div><span className="section-kicker">MOTORES</span><h2>O que está sustentando — ou bloqueando — uma entrada</h2></div><span className="muted">Atualização estrutural no ciclo do motor</span></section>
    <section className="engine-grid">
      {market.activeEngines.map((e)=>(
        <article className={"engine-card "+(e.accepted?"engine-on":"engine-off")} key={e.engine}>
          <div className="engine-top"><span>{engineName(e.engine)}</span><Pill tone={e.accepted?"good":"neutral"}>{e.accepted?"APROVADO":"EM ESPERA"}</Pill></div>
          <div className="engine-score"><strong>{e.score}</strong><small>/100</small></div>
          <Meter value={e.score}/>
          <p>{e.reason}</p>
        </article>
      ))}
    </section>

    <section className="section-headline"><div><span className="section-kicker">MAPA DE MERCADO</span><h2>Níveis próximos e zonas de interesse</h2></div><span className="muted">Pivôs M5 · força por toques + recência</span></section>
    <section className="market-map-grid">
      <article className="card map-card">
        <div className="card-head"><span>Suportes próximos</span><span className="muted">abaixo do preço</span></div>
        <div className="level-stack">
          {market.marketMap.support.length?market.marketMap.support.map((x)=>(
            <details className="level-detail" key={"s"+x.price}>
              <summary><div><strong>{px(x.price)}</strong><span>-{x.distancePct.toFixed(3)}%</span></div><Pill tone={x.strength==="FORTE"?"good":"neutral"}>{x.strength}</Pill></summary>
              <div className="detail-body"><span>{x.touches} testes</span><span>score {x.score}/100</span><span>último toque {time(x.lastTouch)}</span></div>
            </details>
          )):<div className="empty-compact">Nenhum suporte médio/forte próximo identificado.</div>}
        </div>
      </article>

      <article className="card zone-card">
        <div className="card-head"><span>Zonas de interesse</span><span className="muted">demanda / oferta</span></div>
        <div className="zone-stack">
          {market.marketMap.interestZones.length?market.marketMap.interestZones.map((z)=>(
            <details className={"zone-detail "+(z.type==="DEMANDA"?"demand":"supply")} key={z.type+z.center}>
              <summary>
                <div><small>{z.type}</small><strong>{px(z.low)} — {px(z.high)}</strong><span>{z.distancePct.toFixed(3)}% do preço</span></div>
                <Pill tone={z.strength==="FORTE"?"good":"warn"}>{z.strength}</Pill>
              </summary>
              <div className="detail-body"><span>centro {px(z.center)}</span><span>score {z.score}/100</span><span>{z.reason}</span></div>
            </details>
          )):<div className="empty-compact">Nenhuma zona média/forte próxima identificada.</div>}
        </div>
        <details className="method-detail">
          <summary>Como essas zonas são calculadas?</summary>
          <p>O Aurum Pulse detecta swings recentes no M5, agrupa preços próximos, conta testes, pondera recência e cria uma faixa ao redor do nível com largura adaptada à volatilidade recente.</p>
          <div className="detail-body"><span>Range médio M5 {px(market.marketMap.volatility.avgM5Range)}</span><span>Largura da zona {px(market.marketMap.volatility.zoneWidth)}</span></div>
        </details>
      </article>

      <article className="card map-card">
        <div className="card-head"><span>Resistências próximas</span><span className="muted">acima do preço</span></div>
        <div className="level-stack">
          {market.marketMap.resistance.length?market.marketMap.resistance.map((x)=>(
            <details className="level-detail" key={"r"+x.price}>
              <summary><div><strong>{px(x.price)}</strong><span>+{x.distancePct.toFixed(3)}%</span></div><Pill tone={x.strength==="FORTE"?"good":"neutral"}>{x.strength}</Pill></summary>
              <div className="detail-body"><span>{x.touches} testes</span><span>score {x.score}/100</span><span>último toque {time(x.lastTouch)}</span></div>
            </details>
          )):<div className="empty-compact">Nenhuma resistência média/forte próxima identificada.</div>}
        </div>
      </article>
    </section>

    <section className="accordion-grid">
      <details className="card info-accordion">
        <summary><div><span className="section-kicker">DETALHES</span><strong>Como o FINAL_V1 está decidindo agora</strong></div><span>abrir</span></summary>
        <div className="accordion-body">
          {market.activeEngines.map((e)=><div key={"d"+e.engine}><strong>{engineName(e.engine)}</strong><span>{e.score}/100 · {e.accepted?"aprovado":"em espera"}</span><p>{e.reason}</p></div>)}
        </div>
      </details>
      <details className="card info-accordion">
        <summary><div><span className="section-kicker">FORWARD</span><strong>O que entra nas estatísticas LIVE_V2</strong></div><span>abrir</span></summary>
        <div className="accordion-body single"><p>Somente sinais gerados depois da correção de entrada ao vivo e observação real entram no LIVE_V2. Os dois registros PRE_FIX continuam preservados para diagnóstico, mas ficam fora das métricas oficiais.</p></div>
      </details>
    </section>

    <section className="section-headline"><div><span className="section-kicker">PRICE LADDER</span><h2>Mapa vertical de preço</h2></div><span className="muted">Obstáculos, zonas e níveis em uma única escala</span></section>
    <section className="ladder-layout">
      <article className="card ladder-card">
        <div className="ladder">
          {ladder.map((item:any,i:number)=>{
            const dp=distPoints(item.price,market.price);
            const dr=distR(item.price,market.price,riskRef);
            const isNow=item.kind==="PREÇO";
            const isRisk=item.kind.includes("STOP");
            const isTarget=item.kind==="2R"||item.kind==="3R";
            return <div className={"ladder-row "+(isNow?"ladder-now":isRisk?"ladder-risk":isTarget?"ladder-target":"")} key={item.kind+item.price+String(i)}>
              <div className="ladder-side"><span>{item.kind}</span>{item.strength&&<small>{item.strength}</small>}</div>
              <div className="ladder-line"><i /></div>
              <div className="ladder-price"><strong>{px(item.price)}</strong><span>{dp===0?"preço atual":(dp>0?"+":"")+dp.toFixed(2)+" pts"}{dr!=null?" · "+(dr>=0?"+":"")+dr.toFixed(2)+"R":""}</span></div>
            </div>;
          })}
        </div>
      </article>
      <article className="card obstacle-card">
        <div className="card-head"><span>Leitura de obstáculos</span><span className="muted">{riskRef>0?"distância em R ativa":"sem R de referência"}</span></div>
        <div className="obstacle-list">
          {[...market.marketMap.resistance,...market.marketMap.support].sort((a:any,b:any)=>a.distancePct-b.distancePct).slice(0,6).map((x:any)=>(
            <details className="obstacle-detail" key={"o"+x.price}>
              <summary><div><strong>{px(x.price)}</strong><span>{x.price>market.price?"acima":"abaixo"} · {x.distancePct.toFixed(3)}%</span></div><Pill tone={x.strength==="FORTE"?"good":"neutral"}>{x.strength}</Pill></summary>
              <div className="confluence-tags">
                {tagsForLevel(x,market.marketMap.interestZones,signal,active).map((tag)=><span key={tag}>{tag}</span>)}
              </div>
              <div className="detail-body">
                <span>{(x.price-market.price)>=0?"+":""}{(x.price-market.price).toFixed(2)} pts</span>
                {riskRef>0&&<span>{rfmt((x.price-market.price)/riskRef)}</span>}
                <span>score {x.score}/100</span>
              </div>
            </details>
          ))}
        </div>
      </article>
    </section>

    <section className="content-grid">
      <article className="card setup-card">
        <div className="card-head"><span>Setup / risco</span><span className="muted">{signal?signal.signalClass:"SEM GATILHO"}</span></div>
        {signal?<>
          <div className="setup-focus">
            <div><small>Entrada ao vivo</small><strong>{px(signal.entry)}</strong><span>referência estrutural {px(signal.modelEntry)}</span></div>
            <div className="risk-badge"><small>Risco estrutural</small><strong>{signal.riskPercent.toFixed(3)}%</strong></div>
          </div>
          <div className="levels four">
            <div><small>Stop</small><strong>{px(signal.originalStop)}</strong></div>
            <div><small>2R · parcial 30%</small><strong>{px(signal.target2R)}</strong></div>
            <div><small>3R · alvo principal</small><strong>{px(signal.target3R)}</strong></div>
            <div><small>Risco 0,01 lote</small><strong>{money(signal.estimatedRiskUsd001)}</strong></div>
          </div>
          <div className="thesis-tags">{signal.thesis.map((x)=><span key={x}>{x}</span>)}</div>
        </>:<>
          <div className="empty-state"><strong>Sem setup executável neste instante.</strong><p>O sistema está evitando entrada sem confluência suficiente ou com timing/risco fora do portão final. Isso é informação de decisão, não ausência de funcionamento.</p></div>
          <div className="levels three">
            <div><small>Portão 1</small><strong>BOS ou 2+ motores</strong></div>
            <div><small>Portão 2</small><strong>Risco ≤ 0,35%</strong></div>
            <div><small>Portão 3</small><strong>Timing ≤ 0,25R</strong></div>
          </div>
        </>}
      </article>

      <article className="card active-card">
        <div className="card-head"><span>Operação shadow ativa</span><Pill tone={active?"good":"neutral"}>{active?active.status:"NENHUMA"}</Pill></div>
        {active?<>
          <div className="active-title"><span>{(active.side==="LONG"?"COMPRA":"VENDA")+" · "+active.signal_class}</span><strong className={activeR>=0?"positive-text":"negative-text"}>{rfmt(activeR)}</strong></div>
          <div className="levels two">
            <div><small>Entrada</small><strong>{px(active.entry)}</strong></div>
            <div><small>Stop atual</small><strong>{px(active.current_stop??active.original_stop)}</strong></div>
            <div><small>MFE</small><strong>{rfmt(active.mfe_r)}</strong></div>
            <div><small>MAE</small><strong>{rfmt(active.mae_r)}</strong></div>
          </div>
          <div className="ai-box">
            <div><span>IA gestora</span><Pill tone={active.last_ai_action&&active.last_ai_action!=="MANTER"?"warn":"good"}>{active.last_ai_action||"AGUARDANDO"}</Pill></div>
            <p>{active.last_ai_message||"A operação será reavaliada no próximo ciclo de 1 minuto."}</p>
            <small>Última análise: {time(active.last_ai_at)}</small>
          </div>
        </>:<div className="empty-state"><strong>Nenhum trade LIVE_V2 aberto.</strong><p>Quando surgir um sinal novo, este card passa a mostrar R atual, MFE, MAE, stop vigente e a decisão da IA.</p></div>}
      </article>
    </section>

    <section className="stats-grid">
      <article className="stat-card"><small>Trades LIVE_V2</small><strong>{trades.length}</strong><span>{closed.length} encerrados</span></article>
      <article className="stat-card"><small>Resultado acumulado</small><strong className={totalR>=0?"positive-text":"negative-text"}>{rfmt(totalR)}</strong><span>{money(totalUsd)} bruto simplificado</span></article>
      <article className="stat-card"><small>Taxa de acerto</small><strong>{closed.length?winRate.toFixed(1)+"%":"—"}</strong><span>{closed.length?String(wins)+" positivos de "+String(closed.length):"amostra ainda vazia"}</span></article>
      <article className="stat-card"><small>Drawdown forward</small><strong>{closed.length?maxDd.toFixed(2)+"R":"—"}</strong><span>somente LIVE_V2</span></article>
    </section>

    <section className="section-headline"><div><span className="section-kicker">PLACAR LIVE_V2</span><h2>Desempenho observado por motor</h2></div><span className="muted">Não pausa nem altera o FINAL_V1</span></section>
    <section className="card engine-board-card">
      <div className="engine-board-head"><span>Motor</span><span>Sinais</span><span>Encerrados</span><span>Acerto</span><span>Resultado</span><span>Últimos 5</span></div>
      {engineBoard.map((r)=>(
        <div className="engine-board-row" key={r.id}>
          <strong>{engineName(r.id)}</strong>
          <span>{r.n}</span>
          <span>{r.closed}</span>
          <span>{r.closed?r.winRate.toFixed(1)+"%":"—"}</span>
          <span className={r.sumR>0?"positive-text":r.sumR<0?"negative-text":""}>{r.closed?rfmt(r.sumR):"—"}</span>
          <span className={r.last5>0?"positive-text":r.last5<0?"negative-text":""}>{r.closed?rfmt(r.last5):"—"}</span>
        </div>
      ))}
      <p className="board-note">Trades com concordância de mais de um motor aparecem associados a cada motor participante. O placar é diagnóstico e não interfere no envio de sinais.</p>
    </section>

    <section className="section-headline"><div><span className="section-kicker">HISTÓRICO</span><h2>Últimos sinais LIVE_V2</h2></div><span className="muted">Clique para abrir cada operação</span></section>
    <section className="card history-card">
      {recentTrades.length?<div className="history-list">
        {recentTrades.map((t:any)=>(
          <details className="history-row" key={t.id}>
            <summary>
              <span>{time(t.first_seen_at)}</span>
              <strong>{t.side==="LONG"?"COMPRA":"VENDA"}</strong>
              <span>{t.signal_class}</span>
              <span>{Array.isArray(t.engines)?t.engines.map(engineName).join(" + "):"FINAL_V1"}</span>
              <span className={n(t.realized_r)>0?"positive-text":n(t.realized_r)<0?"negative-text":""}>{t.realized_r==null?t.status:rfmt(t.realized_r)}</span>
            </summary>
            <div className="history-detail">
              <div><small>Entrada</small><strong>{px(t.entry)}</strong></div>
              <div><small>Stop</small><strong>{px(t.original_stop)}</strong></div>
              <div><small>2R</small><strong>{px(t.target_2r)}</strong></div>
              <div><small>3R</small><strong>{px(t.target_3r)}</strong></div>
              <div><small>MFE</small><strong>{rfmt(t.mfe_r)}</strong></div>
              <div><small>MAE</small><strong>{rfmt(t.mae_r)}</strong></div>
              <div><small>IA</small><strong>{t.last_ai_action||"—"}</strong></div>
              <div><small>Status</small><strong>{t.status}</strong></div>
            </div>
          </details>
        ))}
      </div>:<div className="empty-state"><strong>Ainda não existem operações LIVE_V2.</strong><p>O histórico começa no próximo sinal oficial após as correções de entrada ao vivo.</p></div>}
    </section>

    <section className="lower-grid">
      <article className="card process-card">
        <div className="card-head"><span>Checklist de decisão</span><span className="muted">antes de executar manualmente</span></div>
        <div className="checklist">
          <div><b>01</b><span>Motor aprovado</span><p>Não executar quando o painel estiver em AGUARDAR.</p></div>
          <div><b>02</b><span>Preço ainda acionável</span><p>O LIVE_V2 bloqueia sinais que já se afastaram mais de 0,25R da entrada estrutural.</p></div>
          <div><b>03</b><span>Risco conhecido</span><p>Stop estrutural e risco percentual aparecem antes dos alvos.</p></div>
          <div><b>04</b><span>Gestão após entrada</span><p>A IA acompanha; a decisão de executar qualquer ajuste continua sendo sua.</p></div>
        </div>
      </article>
      <article className="card policy-card">
        <span className="section-kicker">POLÍTICA ATUAL</span>
        <h3>30% em 2R · 70% até 3R</h3>
        <p>Sem limite diário artificial. Sem média móvel. Sem perseguição de preço. Execução sempre manual.</p>
        <div className="policy-foot">Forward oficial: <strong>LIVE_V2</strong> · PRE_FIX excluído</div>
      </article>
    </section>
  </main>;
}
