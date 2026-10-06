import { getLiveFinalSnapshot } from "@/lib/live-final-engine";
import type { MarketSnapshot } from "@/lib/market";
import { getShadowDashboard } from "@/lib/shadow-recorder";
import LivePrice from "@/app/live-price";

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
