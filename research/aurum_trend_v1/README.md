# Pesquisa AURUM_TREND_V1 (2026-10-08)

Scripts que produziram o motor `lib/trend-engine.ts`. Rodam com Node 24 (`node --max-old-space-size=8000 arquivo.mts`).

- `build.mts`: monta `m5.json` (HistData XAUUSD M1 2018-01 → 2026-09, UTC) a partir dos arquivos baixados do HistData. Os dados não vão para o git.
- `lib.mts`: agregação causal (candle maior só conta depois de fechado), indicadores, simulador (entrada na abertura do M5 seguinte, stop primeiro, custo em pontos, 1 posição por família, parcial opcional).
- `families.mts`: hipóteses F1–F5, definidas antes dos resultados, mais F1b/F2b.
- `run1.mts`/`run2.mts`: grade de parâmetros por família, ordenada só pelo treino (2018–22).
- `run3.mts`: variações de saída; `feat.mts`: características dos sinais; `port*.mts`: carteira, custos, Monte Carlo.
- `parity.mts`: confirma que `lib/trend-engine.ts` reproduz o laboratório (copie o arquivo para `trend-engine.mts` ao lado).

Ver o relatório em `docs/AURUM_TREND_V1.md`.
