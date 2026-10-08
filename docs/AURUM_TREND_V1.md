# AURUM_TREND_V1 — novo motor de tendência

_Data: 2026-10-08 · estado: **SOMBRA** (aparece no painel, não grava no LIVE_V2, não envia Telegram, nunca envia ordens)_

## Por que um motor de tendência

O estudo de 2018–2026 testou 5 famílias de setup, definidas antes de ver os resultados, com custo de 0,5 ponto por operação.

| Família | Resultado | Veredito |
|---|---|---|
| F1 — Recuo na tendência (H1 até a EMA20, H4/D1 a favor) | positivo, mas fraco em 2019 e 2021 | não entrou |
| **F2 — Rompimento de canal a favor da tendência** | positivo no treino, na validação e no teste; parâmetros vizinhos estáveis | **aprovado** |
| F3 — Captura de liquidez na máx/mín do dia anterior com H4 esticado | instável, positivo em 4 de 9 anos | reprovado |
| F4 — Reversão à média em lateralidade (Bollinger H1 + ADX baixo) | negativo em quase todos os anos | reprovado |
| F5 — Rompimento do range asiático em Londres | negativo | reprovado |
| F1b — Recuo no M15 dentro da tendência H1/H4/D1 | treino +0,07R, sensível a custo | só em observação |

O que se repetiu em todos os períodos foi **seguir a tendência e deixar o lucro correr por dias**. Setups intradiários de reversão e de sessão perderam depois do custo. Isso confirma o que a pesquisa ALPHA_2 já tinha visto no M5.

## Regras (congeladas)

Usa só candles fechados. H4 e D1 são montados a partir do H1. O D1 vira às 17h de NY.

- **Tendência H4:** EMA20 > EMA50 e fechamento > EMA50 = alta; o inverso = baixa.
- **Tendência D1:** fechamento > EMA50 e EMA20 > EMA50 = alta; o inverso = baixa.

**Módulo A · ROMPIMENTO_H1**
- **Entrada:** quando o H1 fecha acima da máxima (ou abaixo da mínima) das 24 horas anteriores.
- **Condições:**
  - H4 e D1 na mesma direção do rompimento.
  - Não perseguir: o fechamento do H4 deve estar a no máximo 2,5 ATR(H4) da EMA50 do H4.
- **Stop:** 2,5 × ATR(H1).
- **Saída:**
  - Parcial de 33% em +2R, e o stop vai para a entrada.
  - O restante sai no stop móvel de 6 × ATR(H1) a partir do melhor preço.
  - Prazo máximo de 10 dias.

**Módulo B · ROMPIMENTO_H4**
- **Entrada:** quando o H4 fecha além do canal das 60 velas H4 anteriores.
- **Condição:** D1 na mesma direção.
- **Stop:** 2,5 × ATR(H4).
- **Saída:** stop móvel de 4 × ATR(H4). Prazo máximo de 20 dias.

Cada módulo tem no máximo 1 posição aberta por vez.

## Validação (HistData XAUUSD, 2018-01 → 2026-09)

Escolha dos parâmetros só em 2018–2022, validação em 2023–2024 e teste nunca visto em 2025–2026. Custo de 0,5 ponto por operação.

| | Ops | Ops/dia | Média | PF | t | Queda máx. | Treino | Validação | Teste |
|---|---|---|---|---|---|---|---|---|---|
| A · Rompimento H1 | 271 | 0,12 | +0,42R | 1,73 | 3,2 | 10R | +0,22 | +0,54 | +0,88 |
| B · Rompimento H4 | 127 | 0,06 | +0,53R | 2,2 | 2,8 | 8R | +0,33 | +0,34 | +1,40 |
| **A + B** | **398** | **0,18** | **+0,45R** | **1,85** | **4,2** | **13–15R** | +0,25 | +0,46 | +1,04 |

Resultado de A+B por ano:

| 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|
| +0,11 | +0,02 | +0,82 | +0,26 | +0,15 | +0,29 | +0,63 | +1,06 | +1,00 |

Robustez:
- **Custo:** com 1 ponto, +0,42R; com 2 pontos, +0,34R (PF 1,55).
- **Parâmetros vizinhos:** canal de 24/48/72 H1, stop de 1,5/2,5 ATR, stop móvel de 3/4/6 ATR, filtro "não perseguir" de 1,5 a 3,5 ATR. 78% das variações são positivas no treino e todas são positivas no teste.
- **Paridade:** `lib/trend-engine.ts` reproduz o laboratório (A: 271 contra 273 operações, +0,42R; B: 127 contra 128 operações, +0,53R contra +0,54R).

Limitações:
1. **Frequência baixa.** É cerca de 1 operação por semana, e a vantagem depende de segurar a posição por dias (duração mediana de cerca de 29h). Encurtar para 8h tira a vantagem (+0,04R).
2. **Taxa de acerto de cerca de 40%.** O lucro vem de poucas operações grandes, então sequências de stops são normais. Queda máxima histórica de 13–15R.
3. **Quase todo o ganho vem das compras.** O ouro foi de cerca de 1.300 para 4.100 no período. As vendas ficaram perto de zero, positivas em 2018 e 2021. O motor é simétrico, mas em mercado de baixa longa só a forma (tendência) foi testada, não o resultado.
4. **Fonte dos dados.** HistData tem buracos em fev–jul/2023. A Capital usa preço médio (mid), enquanto a pesquisa usou bid.

## Implementação

- `lib/trend-engine.ts`: motor determinístico. Recalcula sinais e gestão a partir de H1 fechados.
- `app/api/trend-engine/route.ts`: carrega cerca de 1 ano de H1 da Capital (cache de 55 s) e devolve estado, operações abertas, últimas encerradas e estatísticas sem custo.
- `app/trend-panel.tsx`: nova seção no painel, "NOVO MOTOR · AURUM_TREND_V1 · SOMBRA".
- Não altera o FINAL_V1, o LIVE_V2, o MGMT_V1 nem o Telegram.

## Próximos passos

1. Acompanhar o modo sombra no painel por algumas semanas e comparar com o recálculo na Capital.
2. Se o forward confirmar, ativar o aviso no Telegram para sinal novo e para mudança de stop (precisa de registro próprio, separado do LIVE_V2).
3. Opcional: estudar o recuo no M15 (F1b) como terceiro módulo, só se melhorar com custo real.

## Abordagens alternativas testadas (2026-10-08, lote fixo 0,01)

**1. Frequência e lucro com lote mínimo** (`freq.mts`, `port3.mts`)
- Sem a parcial, que não é possível em 0,01, o módulo A melhora: +0,55R por operação.

| Opção | Ops/mês | Média | US$/mês 2025–26 | Pior queda 2025–26 | Anos positivos |
|---|---|---|---|---|---|
| A+B | 3,7 | +0,54R | 193 | −387 | 8/9 |
| A+B, até 2 posições cada | 6,6 | +0,49R | 313 | −647 | 8/9 |
| Várias escalas (canais H1 12/24/72 + H4 30/60) | 10,3 | +0,49R | 471 | −1.306 | 7/9 |
| Várias escalas + recuo no M15 | 18,3 | +0,42R | 518 | −1.500 | 7/9 |

Mais frequência vem sempre com queda maior, porque as posições estão todas na mesma tendência.

**2. Modelo estatístico walk-forward** (`ml_data.mts`, `ml_wf.mts`) — **reprovado**
- Montagem:
  - Uma amostra por fechamento de H1 e por lado, com 31 características (momentum em vários prazos, distâncias às EMAs H1/H4/D1, IFR, ADX, volatilidade, sessão, posição no range, máxima/mínima do dia anterior).
  - Rótulo de barreira tripla.
  - Modelos: logística L2 e GBDT raso.
  - Cada ano de 2020 a 2026 é treinado só com os anos anteriores.
- Resultado: em todas as 16 combinações (barreiras 1,5/1/8h, 2/1/24h e 3/1,5/48h × limites de 2% a 20%), a média foi negativa ou zero (−0,22R a 0,00R).
- Conclusão: as características padrão não preveem a direção de 8 a 48h do ouro fora da amostra.

**3. Outras entradas e saídas no mesmo contexto aprovado** (`entryexit.mts`)
- Entradas testadas: a mercado, limitada no reteste do nível rompido e limitada num recuo de 0,5 ATR.
- Saídas testadas: trailing ATR, fechamento do H1 contra a EMA50, virada da tendência H4, stop no último fundo/topo do H1, e trailing + virada do H4.
- Resultado: todas ficaram entre +0,27R e +0,57R. Nenhuma superou a combinação atual (mercado + trailing ATR) de forma consistente.
- A entrada no reteste perde justamente os rompimentos fortes: 2025–26 rendeu US$ 26/mês, contra US$ 93/mês da entrada a mercado.
