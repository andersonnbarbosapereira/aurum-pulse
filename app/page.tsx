import { getLiveFinalSnapshot } from "@/lib/live-final-engine";
import type { MarketSnapshot } from "@/lib/market";

export const dynamic = "force-dynamic";

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function Meter({ value }: { value: number }) {
  return (
    <div className="meter" aria-label={`${value}%`}>
      <div className="meter-fill" style={{ width: `${value}%` }} />
    </div>
  );
}

function biasLabel(bias: MarketSnapshot["bias"]) {
  if (bias === "LONG") return "COMPRA";
  if (bias === "SHORT") return "VENDA";
  return "AGUARDAR";
}

function biasTone(bias: MarketSnapshot["bias"]): "good" | "warn" {
  return bias === "WAIT" ? "warn" : "good";
}

export default async function Home() {
  let market: Awaited<ReturnType<typeof getLiveFinalSnapshot>> | null = null;
  let connectionError = false;
  try {
    market = await getLiveFinalSnapshot();
  } catch {
    connectionError = true;
  }

  if (!market || connectionError) {
    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">MARKET INTELLIGENCE</div>
            <h1>Aurum <span>Pulse</span></h1>
          </div>
          <div className="top-actions">
            <Pill tone="warn">CONEXÃO PENDENTE</Pill>
            <div className="live">Capital.com</div>
          </div>
        </header>
        <section className="hero-grid">
          <article className="card price-card">
            <div className="card-head"><span>XAUUSD</span><span className="muted">Gold / US Dollar</span></div>
            <div className="signal-title">Dados reais ainda não autenticados.</div>
            <p className="muted">O modo demo foi removido. Configure as credenciais da Capital.com na Vercel para ativar cotação e análise multi-timeframe em tempo real.</p>
          </article>
          <article className="card signal-card">
            <div className="card-head"><span>Estado do motor</span><Pill tone="warn">SEM SINAL</Pill></div>
            <div className="signal-title">Nenhuma decisão com dado fictício.</div>
            <p>O Aurum Pulse só libera análise quando a fonte de mercado real estiver disponível.</p>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">MARKET INTELLIGENCE</div>
          <h1>Aurum <span>Pulse</span></h1>
        </div>
        <div className="top-actions">
          <Pill tone="good">LIVE · CAPITAL.COM</Pill>
          <div className="live"><i /> {market.marketStatus || "mercado monitorado"}</div>
        </div>
      </header>

      <section className="hero-grid">
        <article className="card price-card">
          <div className="card-head"><span>XAUUSD</span><span className="muted">Gold / US Dollar · {market.epic}</span></div>
          <div className="price-row">
            <div className="price">{market.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="change">{market.changePercent >= 0 ? "+" : ""}{market.changePercent.toFixed(2)}%</div>
          </div>
          <div className="mini-grid">
            <div><small>Fonte</small><strong>{market.source}</strong></div>
            <div><small>Regime</small><strong>{market.regime}</strong></div>
            <div><small>Timeframes</small><strong>M15 · H1 · H4</strong></div>
          </div>
        </article>

        <article className="card signal-card">
          <div className="card-head"><span>Leitura atual</span><Pill tone={biasTone(market.bias)}>{biasLabel(market.bias)}</Pill></div>
          <div className="signal-title">{market.bias === "WAIT" ? "Sem entrada de alta convicção." : `Viés ${biasLabel(market.bias).toLowerCase()} detectado.`}</div>
          <p>{market.structure}</p>
          <div className="confidence">
            <div><span>Confiança do contexto</span><strong>{market.confidence}%</strong></div>
            <Meter value={market.confidence} />
          </div>
        </article>
      </section>

      <section className="content-grid">
        <article className="card setup-card">
          <div className="card-head"><span>Plano condicional</span><span className="muted">Não é ordem de execução</span></div>
          <div className="setup-row primary"><div><small>Zona de interesse</small><strong>{market.setup.entryZone[0]} — {market.setup.entryZone[1]}</strong></div><Pill tone={market.bias === "WAIT" ? "warn" : "good"}>{market.bias === "WAIT" ? "SEM GATILHO" : "PULLBACK"}</Pill></div>
          <div className="levels">
            <div><small>Invalidação</small><strong>{market.setup.stop}</strong></div>
            <div><small>Alvo 1</small><strong>{market.setup.target1}</strong></div>
            <div><small>Alvo 2</small><strong>{market.setup.target2}</strong></div>
            <div><small>R:R teórico</small><strong>{market.setup.rr.toFixed(2)}</strong></div>
          </div>
          <div className="human-note"><span>Leitura humana</span><p>{market.bias === "WAIT" ? "Os timeframes ainda não concordam o suficiente. Ficar fora também é uma decisão operacional." : "Existe alinhamento, mas o sistema não persegue preço. A entrada só faz sentido dentro da zona com invalidação clara."}</p></div>
        </article>

        <article className="card factors-card">
          <div className="card-head"><span>Confluências</span><span className="muted">0–100</span></div>
          <div className="factor-list">
            {market.factors.map((factor) => (
              <div className="factor" key={factor.label}>
                <div className="factor-line"><strong>{factor.label}</strong><span>{factor.score}</span></div>
                <Meter value={factor.score} />
                <small>{factor.note}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="lower-grid">
        <article className="card thesis">
          <div className="card-head"><span>Tese operacional</span><span className="muted">processo &gt; palpite</span></div>
          <div className="thesis-grid">
            <div><b>01</b><span>Dado real primeiro</span><p>Preço e candles vêm diretamente da Capital.com; sem fonte real, não existe sinal.</p></div>
            <div><b>02</b><span>Confluência multi-timeframe</span><p>M15, H1 e H4 precisam produzir contexto coerente antes de elevar a convicção.</p></div>
            <div><b>03</b><span>Risco explícito</span><p>Todo cenário nasce com invalidação e risco definidos antes de qualquer execução.</p></div>
          </div>
        </article>
        <article className="card disclaimer">
          <strong>Dados reais não significam lucro garantido.</strong>
          <p>O motor ainda está em fase de validação. Antes de operar capital real, vamos medir expectativa, drawdown, custos, slippage e desempenho forward.</p>
        </article>
      </section>
    </main>
  );
}
