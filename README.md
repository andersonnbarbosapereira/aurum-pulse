# Aurum Pulse

Painel de inteligência de mercado focado inicialmente em XAUUSD.

## Princípio do produto

O sistema não tenta parecer certo o tempo todo. Ele tenta identificar quando **vale a pena agir** e, principalmente, quando **não vale**. O núcleo do produto será construído em torno de contexto, qualidade do setup, invalidação e risco.

## MVP atual

- Dashboard responsivo em Next.js + TypeScript
- Leitura de regime de mercado
- Bias: LONG / SHORT / WAIT
- Confiança do contexto
- Plano condicional com zona, invalidação e alvos
- Confluências com scores explicáveis
- API `/api/snapshot`
- Modo demo isolado, pronto para substituir por dados ao vivo

## Próximas camadas

1. Provider de candles/ticks de XAUUSD
2. Motor técnico multi-timeframe
3. Journal e histórico de sinais
4. Backtest com custos e slippage
5. Forward test / paper trading
6. Alertas e observabilidade
7. Camada de IA apenas para explicação e síntese, nunca como fonte única do sinal

## Segurança de produto

Aurum Pulse é ferramenta de apoio à decisão. Não promete rentabilidade e não deve executar operações reais antes de validação histórica e forward testing.
