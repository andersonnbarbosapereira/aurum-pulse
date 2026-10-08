# AURUM_TREND_V2 — carteira de setups a favor da tendência

_Data: 2026-10-08 · estado: **SOMBRA** (aparece no painel, não grava no LIVE_V2, não envia Telegram, nunca envia ordens) · substitui a V1 no painel_

## Como foi encontrado

Fiz uma busca combinatória com o script `research/aurum_trend_v1/combo.mts`. Cada combinação junta um gatilho, um contexto, uma sessão, um stop e uma saída:

| Peça | Opções |
|---|---|
| Gatilhos (15) | canal H1 de 12/24/48/72h, canal H4 de 20/30/60, recuo à EMA20, vela de força, engolfo na EMA20, rompimento e sweep da máx/mín do dia anterior, inside bar, IFR(2) |
| Contextos (6) | livre, H4, D1, H4+D1, H4+D1 sem esticar, contra o H4 |
| Sessões (4) | todas, Londres+NY, NY, sem Ásia |
| Stop | 1,5 ou 2,5 × ATR(H1) |
| Saídas (7) | trailing de 3/4/6 ATR, alvo de 1,5/2/3R, tempo de 24h |

- **Total:** 4.410 combinações com 60 ou mais operações.
- **Dados:** HistData XAUUSD 2018-01 → 2026-09, simulação no caminho H1 (stop primeiro), custo de 0,5 ponto. Os finalistas foram reconferidos no caminho M5 (`combo_m5.mts`), com o mesmo resultado.
- **Escolha:** só com 2018–2022. Critério: média de +0,12R ou mais e pelo menos 4 de 5 anos positivos. Passaram **288 combinações**.
- **Fora da amostra:** 254 das 288 ficaram positivas na validação (2023–24), 251 no teste (2025–26) e 235 nas duas.
- **Base de comparação:** entre todas as 4.410 combinações, 70% são positivas na validação e 83% no teste. O ouro subiu muito no período, então quase tudo comprado ganha. Essa base explica parte do bom resultado.

## Setups ativos (um por família de gatilho, o melhor no treino e aprovado na validação)

Regras comuns a todos:
- sinal no fechamento do H1 e entrada na abertura do H1 seguinte;
- saída por stop móvel de 6 × ATR(H1) a partir do melhor preço, com prazo de até 10 dias;
- uma posição por setup.

| Setup | Contexto | Sessão | Stop | Ops/mês | Média | Treino | Valid. | Teste |
|---|---|---|---|---|---|---|---|---|
| Vela de força (corpo > 1,8× a mediana de 20, fechando no quarto final) | D1 | Londres+NY | 1,5 ATR | 7,1 | +0,38R | +0,25 | +0,31 | +0,85 |
| Recuo na EMA20 (tocou nas 6 velas anteriores e rompeu as 3 últimas) | H4+D1 | Londres+NY | 1,5 ATR | 5,1 | +0,43R | +0,28 | +0,71 | +0,55 |
| Canal 12h | D1 | todas | 1,5 ATR | 6,5 | +0,38R | +0,23 | +0,53 | +0,64 |
| Rompimento 24h | H4+D1 sem esticar (≤ 2,5 ATR) | todas | 2,5 ATR | 2,6 | +0,54R | +0,32 | +0,70 | +1,04 |
| Rompimento H4 (canal de 60) | D1 | todas | 2,5 ATR | 1,6 | +0,61R | +0,42 | +0,53 | +1,15 |

Extras programados mas **desligados**: engolfo na EMA20, rompimento do dia anterior (NY) e inside bar.

## Carteira (os 5 juntos, simulação M5)

| | Valor |
|---|---|
| Operações | **cerca de 23 por mês** |
| Média | +0,42R por operação (treino +0,27, validação +0,48, teste +0,77) |
| Média mensal com 0,01 lote, convertida para o stop atual | **cerca de US$ 247/mês** |
| Média mensal real em 2025–26 | US$ 437/mês |
| Meses positivos | 55% |
| Pior queda acumulada (stop atual) | cerca de US$ 1.240 |

Média mensal por ano, com o stop atual (US$): 2018 +68 · 2019 +117 · 2020 +410 · 2021 +111 · 2022 +55 · 2023 +250 · 2024 +308 · 2025 +528 · 2026 +376.

Com os 8 setups ligados (os 3 extras incluídos): cerca de 31 operações/mês, cerca de US$ 342/mês, pior queda de cerca de US$ 1.775.

## Limitações

1. **Lucro em US$ com lote fixo acompanha a volatilidade.** O valor de US$ 247/mês supõe stops do tamanho atual (ATR H1 alto). Em anos calmos, foi menor.
2. **Meses negativos são frequentes (cerca de 45%).** Os setups apostam na mesma tendência, então as perdas vêm em grupo.
3. **O período favoreceu compras.** O ouro foi de 1.300 para 4.100. Os setups são simétricos, mas não foram testados numa baixa longa.
4. **Teste de muitas hipóteses.** Foram 4.410 combinações. Mitigado pela escolha só no treino, pela validação e teste separados, e por usar só um setup por gatilho.
5. **Implementação.** `lib/trend-engine.ts` reproduz a busca no histórico com exatidão (mesmas contagens e médias por setup).

## Implementação

- `lib/trend-engine.ts`: motor V2, com `TREND_SETUPS` (ativos e extras).
- `app/api/trend-engine/route.ts`: cerca de 1 ano de H1 da Capital, estatísticas por setup em R e em US$ com 0,01 lote.
- `app/trend-panel.tsx`: seção "NOVO MOTOR · AURUM_TREND_V2 · SOMBRA".

## Gestão de risco e banca (estudo de 2026-10-08, lote 0,01 = US$ 1 por ponto)

**Risco máximo por operação ("número mágico"): stop até 0,7% do preço, cerca de US$ 29 com 0,01 lote a 4.100.**
- Em 2018–2022, operações com stop acima de 0,7% do preço ficaram negativas (−0,02R e −0,37R), enquanto as menores eram positivas.
- Em 2025–26 o stop mediano com 0,01 lote ficou em cerca de US$ 23; o percentil 90 em US$ 43.

**Carteira com gestão de risco (`RISK_RULES` em `lib/trend-engine.ts`)**
- Setups: vela de força, recuo na EMA20, rompimento 24h e rompimento H4. O canal 12h foi desligado porque aumenta a queda sem melhorar a relação ganho/queda.
- Máximo de 3 posições abertas.
- Resultado: cerca de 14 operações/mês e cerca de 73R/ano, positivo em todos os 9 anos (R por ano: 12 · 57 · 105 · 50 · 40 · 81 · 109 · 123 · 63).
- A pior queda cai de cerca de 67R (sem regras) para cerca de 41R.

**Simulação de banca começando com US$ 500**

| Regra de lote | 2025-01 → 2026-09 (real) | Janelas de 12 meses 2018–2026 (a preço de hoje) |
|---|---|---|
| 0,01 fixo | US$ 500 → US$ 2.807 · menor saldo US$ 469 · média US$ 105/mês | mediana US$ 1.787 · 14 de 32 janelas desceram abaixo de US$ 250 · 5 abaixo de US$ 150 · 2 quebraram (2022) |
| 0,02 a partir de US$ 1.000 | → US$ 4.069 · queda máx. US$ 812 · média US$ 162/mês | mediana US$ 1.940 · mesmos riscos nas janelas ruins |
| 0,02 a partir de US$ 1.500 | → US$ 3.913 · média US$ 155/mês | mediana US$ 1.717 |

- A pior queda histórica com 0,01 lote (a preço de hoje) é de cerca de US$ 682. Isso equivale a 136% de uma banca de US$ 500, 68% de US$ 1.000 e 45% de US$ 1.500.
- Conclusão: com US$ 500 o motor pode render bem, como em 2025–26, mas um ano lateral como 2022 pode zerar a banca.
- Regra prudente: **cada 0,01 de lote precisa de cerca de US$ 1.500 de banca**, o que deixa a pior queda em menos de 50%.
- Para dar o primeiro passo com 0,02 no ritmo dos números acima, a banca precisa ter pelo menos cerca de US$ 1.500. Fazer isso a partir de US$ 1.000 aumenta o ganho, mas também dobra o risco de queda.
