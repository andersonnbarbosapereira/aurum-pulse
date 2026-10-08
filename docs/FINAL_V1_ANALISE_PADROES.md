# FINAL_V1 — análise do live e padrões de trades positivos × negativos

_Data: 2026-10-08 · somente pesquisa · FINAL_V1 não foi alterado_

## Base

- **LIVE_V2:** 5 operações encerradas, −2,54R, 1 positiva. Amostra pequena demais para conclusões sozinha.
  - 4 das 5 saíram entre 21h e 01h BRT.
  - As duas de 08/10 (00:41 e 00:50) eram a mesma ideia de compra repetida 9 min depois. As duas foram stopadas.
- **Histórico:**
  - Fonte: o mesmo código de produção do FINAL_V1 (`buildIndependentCandidates` + `mergeCandidates` + portão final + saída `RUNNER_3R`), rodado no HistData XAUUSD M1 de 2024-05 a 2026-09.
  - Volume: 1.160 operações (1,81 por dia).
  - Divisão: treino = 2024-05 → 2025-09; teste = 2025-10 → 2026-09.
- **Custo:** 0,5 ponto por operação, somado ao resultado. O backtest original não desconta custo. O spread da Capital observado em 08/10 foi de 0,75 ponto.
- **Não modelado:** o portão de timing ao vivo (desvio ≤ 0,25R).

## Diagnóstico

| | Média | PF | Treino | Teste | 2024 · 2025 · 2026 |
|---|---|---|---|---|---|
| FINAL_V1 atual, sem custo | +0,06R | 1,10 | +0,00 | +0,18 | — |
| FINAL_V1 atual, custo 0,5 pt | **−0,05R** | 0,92 | −0,13 | +0,13 | −0,16 · −0,05 · +0,10 |

1. **A vantagem bruta é pequena e o custo a consome.**
   - O stop mediano é de só 5,15 pontos, então 0,5 ponto de spread equivale a cerca de 0,1R por operação.
   - A média zera com custo de cerca de 0,3 ponto.
2. **Vencedoras e perdedoras são quase iguais.** Em todas as 36 características medidas, a diferença padronizada entre os dois grupos ficou abaixo de 0,15. O sinal em si discrimina pouco; a melhoria vem de **quando** e **com que stop** operar.
3. **A saída não é o problema.** Testei alvo fixo de 1R, 1,5R, 2R e 3R, com e sem stop no zero em +1R, e saída por tempo. Nenhuma superou a atual (30% em 2R + 70% em 3R).
   - Das perdedoras, 43% chegaram a +1R antes do stop.
   - Mesmo assim, mover o stop para o zero cortou também as vencedoras.

## Situações desfavoráveis (consistentes nos 3 anos)

| Situação | Média | 2024 · 2025 · 2026 |
|---|---|---|
| Entradas 6h–9h BRT (abertura de Londres) | −0,29R | −0,32 · −0,42 · −0,01 |
| Entradas 0h–6h BRT (meio da Ásia) | −0,13 / −0,14R | negativas nos 3 anos |
| Stop de 3,5 a 5,5 pontos | −0,20R no treino | o spread pesa demais |
| `LIQUIDITY_CONTINUATION` sozinho (12 ops) | −0,93R | negativo nos 3 anos |
| Quarta-feira | −0,22R | −0,18 · −0,25 · −0,16 |

A quarta-feira provavelmente reflete dias de notícia (FOMC, ADP, estoques). Por isso ficou como hipótese, não como regra.

## Situações favoráveis

| Situação | Média |
|---|---|
| Entradas 21h–24h BRT | +0,08R (teste +0,41) |
| Entradas 9h–12h BRT | +0,17R (teste +0,56) |
| Entradas 15h–16h BRT | +0,23R |
| Concordância Retração Institucional + Continuação | +0,10R (teste +0,33) |

Dentro da regra sugerida abaixo, os fatores SMC e de indicador que mais ajudaram foram:
- Order Block presente: +0,26R contra +0,07R sem OB.
- M15 alinhado: +0,32R contra +0,12R.
- Tendência H4 (EMA20 × EMA50) **contra** o trade: +0,31R contra +0,06R. Como a maioria é Reversão de Liquidez, a reversão funciona melhor quando há excesso no H4.
- Volatilidade H1 normal ou baixa (ATR abaixo da mediana de 100 barras): +0,28R contra +0,06R.

## Proposta de melhoria (regra simples, 3 itens)

1. **Não emitir sinal entre 0h e 9h BRT.** As vizinhanças 0–8h, 1–9h, 0–10h e 23–9h também melhoram.
2. **Stop estrutural mínimo de 5 pontos.** Com 4, 6 e 8 pontos o efeito é o mesmo, crescente e monotônico.
3. **Não emitir `LIQUIDITY_CONTINUATION` sozinho.**

| | Ops/dia | Média | PF | t | DD | Treino | Teste | 2024 · 2025 · 2026 |
|---|---|---|---|---|---|---|---|---|
| FINAL_V1 atual | 1,81 | −0,05R | 0,92 | −1,2 | 108R | −0,13 | +0,13 | −0,16 · −0,05 · +0,10 |
| **Com os 3 itens** | **0,56** | **+0,19R** | **1,36** | **2,5** | **22R** | −0,06 | +0,42 | −0,20 · +0,18 · +0,35 |
| Com os 3 itens, custo 0,75 pt | 0,56 | +0,16R | 1,29 | 2,1 | 26R | −0,10 | +0,39 | — |
| Com os 3 itens, custo 1,0 pt | 0,56 | +0,12R | 1,22 | 1,7 | 30R | −0,13 | +0,37 | — |

**Limitação honesta:** de mai a dez/2024 o resultado continua negativo em todas as variações. Pelo critério do projeto (positivo em cada período), a regra **ainda não está aprovada**. Ela melhora muito 2025–2026, mas pode estar dependente desse regime.

Efeito no LIVE_V2: as duas compras de 00:41 e 00:50 seriam bloqueadas, e o resultado iria de −2,54R para −0,54R.

## Gestão de risco (não muda a média, reduz exposição)

- **Uma operação por vez:** 230 sinais saíram com outra operação ainda aberta.
- Tirá-los não muda a média por operação (−0,06R; com a regra, +0,20R), mas evita dobrar o risco na mesma ideia, como aconteceu em 08/10.

## Próximos passos sugeridos

1. Rodar a regra de 3 itens em modo sombra separado (por exemplo `LIVE_V2_FILTRO`), sem tocar no FINAL_V1. Comparar depois de 40 ou mais operações.
2. Adicionar um calendário de notícias (FOMC, CPI, NFP) e testar o bloqueio de ±60 min. Isso é a hipótese da quarta-feira.
3. Reavaliar 2024 separadamente, com tendência de alta forte: verificar se a Reversão de Liquidez contra a tendência D1 é o que perde nesse regime.
4. IA/meta-labeling só depois de 200 ou mais operações com a regra.
