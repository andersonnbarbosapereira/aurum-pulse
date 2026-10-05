import { getDemoSnapshot } from "@/lib/market";

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

export default function Home() {
  const market = getDemoSnapshot();

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">MARKET INTELLIGENCE</div>
          <h1>Aurum <span>Pulse</span></h1>
        </div>
        <div className="top-actions">
          <Pill>DEMO DATA</Pill>
          <div className="live"><i /> mercado monitorado</div>
        </div>
      </header>

      <section className="hero-grid">
        <article className="card price-card">
          <div className="card-head"><span>XAUUSD</span><span className="muted">Gold / US Dollar</span></div>
          <div className="price-row">
            <div className="price">{market.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            <div className="change">+{market.changePercent.toFixed(2)}%</div>
          </div>
          <div className="mini-grid">
            <div><small>Sessão</small><strong>{market.session}</strong></div>
            <div><small>Regime</small><strong>{market.regime}</strong></div>
            <div><small>Timeframe</small><strong>M15 · H1 · H4</strong></div>
          </div>
        </article>

        <article className="card signal-card">
          <div className="card-head"><span>Leitura atual</span><Pill tone="warn">AGUARDAR</Pill></div>
          <div className="signal-title">Sem entrada de alta convicção.</div>
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
          <div className="setup-row primary"><div><small>Zona de interesse</small><strong>{market.setup.entryZone[0]} — {market.setup.entryZone[1]}</strong></div><Pill tone="good">PULLBACK</Pill></div>
          <div className="levels">
            <div><small>Invalidação</small><strong>{market.setup.stop}</strong></div>
            <div><small>Alvo 1</small><strong>{market.setup.target1}</strong></div>
            <div><small>Alvo 2</small><strong>{market.setup.target2}</strong></div>
            <div><small>R:R teórico</small><strong>{market.setup.rr.toFixed(2)}</strong></div>
          </div>
          <div className="human-note"><span>Leitura humana</span><p>O melhor trade aqui pode ser não fazer nada. Se o ouro voltar para a zona com reação limpa, o cenário fica interessante. Se disparar sem pullback, deixamos passar.</p></div>
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
            <div><b>01</b><span>Contexto primeiro</span><p>Determinar tendência, range ou transição antes de procurar entrada.</p></div>
            <div><b>02</b><span>Entrada com assimetria</span><p>Nunca comprar ou vender apenas porque o preço está andando rápido.</p></div>
            <div><b>03</b><span>Risco explícito</span><p>Todo cenário nasce com invalidação e risco máximo definidos.</p></div>
          </div>
        </article>
        <article className="card disclaimer">
          <strong>Objetivo: consistência, não promessa.</strong>
          <p>Aurum Pulse é um sistema de apoio à decisão. Rentabilidade depende de dados, execução, custos, disciplina e validação histórica/forward. O produto não garante lucro.</p>
        </article>
      </section>
    </main>
  );
}
