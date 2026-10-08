# ALPHA_2 Research Status

_Last update: 2026-10-08 (Phase A done)_

## Objective

Build a second XAUUSD analysis engine with higher opportunity frequency than FINAL_V1 while preserving positive expectancy, robustness across market regimes, and strict separation between research and the production signal engine.

FINAL_V1 remains frozen and unchanged during this research. Nothing documented here is authorized for real-money execution.

---

## Research principles

The laboratory follows these rules:

1. No strategy is promoted from a single attractive backtest.
2. Closed-bar data only; no look-ahead.
3. Entry is evaluated after the signal bar, not with future information.
4. Stop-first is assumed when stop and target are touched inside the same candle.
5. Trading costs are stressed.
6. Parameter stability matters more than the single best result.
7. Walk-forward / chronological holdout is preferred over random train/test splits.
8. Failed hypotheses are recorded instead of silently discarded.
9. FINAL_V1 is not modified by ALPHA_2 research.
10. Before live use, any surviving candidate must pass a separate shadow-forward stage.

---

## External research reviewed

### Gold_Research
Repository reviewed:
- `burugupallyprem-coder/Gold_Research`

Important findings:
- FVG / NY Opening / SMC ideas can appear strong in favorable gold regimes but become fragile after costs.
- Their honest router used:
  - M15 entries
  - FVG + NY Opening
  - daily direction filter using EMA 20/100 + 12-month momentum
  - prior-close / causal direction handling
- The one overlay that improved both selection and holdout in their study was:
  - `ATR56 >= rolling median of ATR`
- Their own report explicitly warns that much of the strong 2024-2026 performance is a gold bull-market artifact.
- The ATR-gated variant was therefore replicated independently in Aurum Pulse rather than trusted from published statistics.

### GoldEA
Repository reviewed:
- `eamonnkennedy93-blip/GoldEA`

Public methodology:
- Sweep-and-Reclaim
- prior-day high / low
- Asian range
- London opening range
- confirmed higher-timeframe swing structure
- anchored VWAP
- walk-forward validation
- reported OOS PF around 1.30 across 183 trades

The repository is being used as an external hypothesis source only. Its reported results are not considered proof until reproduced with our own data.

### Other quant / AI research

Research direction also considered:
- time-series momentum / trend following
- regime-dependent mean reversion
- meta-labeling
- ML as a trade filter rather than a BUY/SELL oracle
- walk-forward selection
- Deflated Sharpe / Probability of Backtest Overfitting concepts

Conclusion so far:
AI should not be added merely for appearance. A deterministic edge must exist first. ML/AI is more defensible as a later filter for candidate setups.

---

# Experiments completed

## 1. VOLATILITY_EXPANSION_TREND

Hypothesis:
> volatility compression -> expansion candle -> local breakout -> continuation in momentum direction.

Test:
- approximately 120 days
- 23,610 M5 candles
- 96 parameter combinations
- 4 chronological blocks
- 0.50 XAUUSD point cost stress per trade

Result:
- **0 robust candidates**

Verdict:
- **REJECTED**

Reason:
The family did not survive the minimum robustness filter.

---

## 2. ALPHA_2 multi-family laboratory

Families tested:
- SESSION_SWEEP
- FVG_RETEST
- EXPANSION_RETEST

Initial test design:
- 120 days
- first ~75% used for selection
- final ~25% reserved
- cost stress applied

### Important methodology bug found

The first SESSION_SWEEP implementation allowed the completed Asian range to be available before 06:00 UTC.

That created look-ahead bias.

Action:
- results from that version were formally discarded
- code was corrected before further conclusions

This is an important research control: attractive results produced by invalid information timing are not retained.

---

## 3. Multi-window ALPHA_2 validation

Research was expanded to ~180-day windows:
- first ~90 days for selection
- second ~90 days split into 3 forward blocks

Families:
- SESSION_SWEEP
- FVG_RETEST
- EXPANSION_RETEST

Observation:
No static parameter set dominated all periods.

Some examples were strong in one regime and weak in another.

Conclusion:
A fixed universal intraday parameter set was not demonstrated.

---

## 4. Regime-adaptive laboratory

Families:
- REGIME_REVERSION
- TREND_PULLBACK

Purpose:
Test whether different market states require different setup families.

Promising but unstable observations included:
- TREND_PULLBACK during some NY periods
- REGIME_REVERSION during some London periods

Cross-period frozen-parameter tests showed:
- candidates that worked in one semester often failed in another
- no static winner survived all historical windows tested

Verdict:
- static regime candidates **not promoted**

Useful conclusion:
The edge appears regime-dependent.

---

## 5. Conditional Expectancy Meta-Filter V1

Concept:
Generate a broad deterministic setup universe, then allow trades only when the setup's recent historical context has positive expectancy.

Features included:
- strategy family
- trading session
- trend strength / ATR
- short ATR / long ATR volatility regime

Walk-forward design:
- rolling ~90-day historical learning window
- following month used as unseen test
- repeated forward folds

Result:
- failed recent period
- failed additional historical blocks
- did not demonstrate stable positive expectancy

Verdict:
- **REJECTED**

Important conclusion:
Adding a meta-filter cannot rescue a weak underlying trigger.

---

# External strategy replication

## 6. Gold_Research ATR-gated intraday stack

Independent Aurum implementation:
- M15
- FVG + NY Opening
- displacement disabled
- H4 trend
- daily EMA20/100 + 252-session momentum
- daily signal lagged to prior available daily close
- ATR56 >= rolling median of 2000 M15 bars
- swing / ATR stop
- FVG target 2.5R
- NY target 3R
- break-even at 1.5R
- max 3 trades/day
- stressed costs at 1x / 3x / 5x

Additional protection:
- H4 values use completed higher-timeframe bars only

### Capital.com replication results

#### Most recent ~180 days
Baseline:
- 17 trades
- Win rate: 11.8%
- Net: -6.95R
- Avg: -0.409R
- PF: 0.43

ATR gate:
- 7 trades
- Win rate: 14.3%
- Net: -3.65R
- Avg: -0.522R
- PF: 0.40

Result:
- failed

#### Previous ~180-day block
Baseline:
- 50 trades
- +20.49R
- +0.410R/trade
- PF 1.87

ATR gate:
- 17 trades
- +11.24R
- +0.661R/trade
- PF 2.58

5x cost:
- +0.415R/trade
- PF 1.90

Observation:
Excellent period, but all accepted trades were long.

#### Earlier block
Baseline:
- 79 trades
- -16.03R
- -0.203R/trade
- PF 0.69

ATR gate:
- 38 trades
- -8.23R
- -0.217R/trade
- PF 0.69

Result:
- failed badly

#### Earlier block
Baseline:
- 62 trades
- +13.57R
- +0.219R/trade
- PF 1.39

ATR gate:
- 36 trades
- +14.07R
- +0.391R/trade
- PF 1.79

5x cost:
- +0.078R/trade
- PF 1.12

### ATR stack verdict

The published effect could be reproduced in some periods, but disappeared in others.

Problems:
- strong regime dependence
- heavy / total long bias in tested profitable blocks
- not sufficiently frequent
- latest period poor

Verdict:
- **NOT suitable as ALPHA_2**
- keep only as research evidence that volatility gating can matter

---

# Sweep-and-Reclaim replication

A closer replication of the GoldEA methodology has been prepared.

Planned / coded rules:
- execution: M15
- prior UK trading-day high / low
- Asian range: 00:00-08:00 London time
- London opening range: 08:00-09:00 London time
- persistent sweep state
- reclaim requires >= 50% of candle range
- H1 structure:
  - pivot lookback 5
  - confirmation 3
  - last 2 highs and lows
- H4 structure:
  - pivot lookback 3
  - confirmation 2
  - last 2 highs and lows
- bullish bias only with HH + HL
- bearish bias only with LH + LL
- H1 and H4 must agree with trade direction
- 1 Wilder ATR beyond swept wick for stop
- anchored VWAP from confirmed H1 swing events
- exit:
  - stop
  - VWAP cross
  - UK session rollover
- no VWAP entry gate in first faithful replication
- no optimization before baseline replication

### Phase A result (2026-10-08) — REJECTED

**Capital.com, four ~180-day windows** (`/api/goldea-sweep-lab?offset=0|180|360|540`, faithful VWAP exit, no optimization):

| Window | Trades | Raw avgR | Raw PF | Net 0.5pt avgR | Net PF | Stress 1.5pt avgR | Positive months (net) |
|---|---|---|---|---|---|---|---|
| 2024-10 → 2025-04 | 93 | -0.056 | 0.79 | -0.110 | 0.63 | -0.217 | 14% |
| 2025-04 → 2025-10 | 80 | +0.059 | 1.24 | +0.012 | 1.04 | -0.083 | 29% |
| 2025-10 → 2026-04 | 88 | -0.043 | 0.82 | -0.065 | 0.74 | -0.110 | 43% |
| 2026-04 → 2026-10 | 76 | -0.064 | 0.79 | -0.090 | 0.71 | -0.141 | 43% |

Promotion gate failed in **all four windows** (even before costs in 3 of 4).

**HistData M1 → M15, 2024-01 → 2026-09 (same production lab code, labeled separately)**
- HistData has no volume: anchored VWAP used the number of M1 bars per M15 bar as a volume proxy.
- Parity check against Capital on overlapping windows was close (e.g. 2025-04→10: HistData +0.052R raw vs Capital +0.059R; 2025-10→2026-04: -0.052R vs -0.043R).
- Whole period, VWAP exit: 508 trades, raw +0.014R (PF 1.05), **net 0.5pt -0.032R (PF 0.89)**.
- Semesters (net 0.5pt): 2024H1 +0.096 · 2024H2 -0.117 · 2025H1 -0.115 · 2025H2 +0.048 · 2026 -0.054.

**Sensitivity: optional fixed R target** (supported by the original `backtester.py`, `target_r`), net 0.5pt, whole period:
- 1R: -0.094R · 1.5R: -0.060R · 2R: -0.036R · 3R: -0.030R.
- Every target fails 2025H1 and 2026 by -0.15R to -0.28R per trade; the good semesters (2024H1, 2025H2) are the same for every variant → regime artifact, not an exit problem.

Note: the original GoldEA backtester applies **no spread/commission**. Its published OOS PF 1.30 is gross. Our gross results (PF 0.79–1.24 per window, 1.05 overall) do not reproduce it.

Verdict: **GoldEA Sweep-and-Reclaim REJECTED as ALPHA_2.** No parameter search was run on it (that would only overfit a trigger that has no raw edge).

---

# Data sources

## Capital.com
Primary source for:
- parity with live engine
- forward behavior
- recent historical validation
- production-compatible price structure

## HistData
Approved complementary source for:
- longer XAUUSD intraday history
- older regimes
- expanding sample size beyond Capital API convenience limits

HistData must not be mixed silently with Capital data.

Whenever HistData is used:
1. results will be labeled by source
2. price/time normalization will be documented
3. spread assumptions will be applied explicitly
4. duplicate or missing-session behavior will be checked
5. Capital.com will still be used for final live-parity validation

---

# Phase C / G result (2026-10-08) — strategy-family bakeoff on HistData

Data: HistData XAUUSD M1 2024-01 → 2026-09 (UTC), measured from 2024-05-01 (~640 trading days). Same data, same period, same metrics for all families. Train = 2024-05 → 2025-09, test = 2025-10 → 2026-09.

Families:
- **FINAL_V1 (Aurum)**: production code `buildIndependentCandidates` + `mergeCandidates` + final gate (BOS or 2+ engines, risk ≤ 0.35%), exit `RUNNER_3R` (`simulate`). Not modelled: live timing gate (≤ 0.25R deviation). FINAL_V1 research code applies **no cost**; costs below are added per trade.
- **Market Motor 3 "zona com força"** (`market-ai-analyzer`): ZONA / ROMPE_RETESTE signals on a real zone with 0–2 touches and M15 RSI in favour (> +6.38 after sign). Exit at target 1 or stop, 12h limit. Already includes 0.26pt spread.
- **Market Motor 4 "bloco em mercado indefinido"**: OB_CAPTURA H1/M15 signals with M15+H1+H4+D1 alignment 0 or +1 and M15 RSI not against (> −7.52).

## Results with 0.5pt total cost per trade

| Family | Trades | /day | avgR | PF | t | DD | Train | Test | Semesters 24H1* · 24H2 · 25H1 · 25H2 · 26 |
|---|---|---|---|---|---|---|---|---|---|
| FINAL_V1 | 1160 | 1.81 | **−0.05** | 0.92 | −1.2 | 107.7R | −0.13 | +0.13 | −0.37 · −0.09 · −0.11 · +0.01 · +0.11 |
| Motor 3 | 154 | 0.24 | **+0.29** | 1.53 | 2.1 | 11.8R | +0.20 | +0.41 | +0.41 · +0.15 · −0.07 · +0.61 · +0.37 |
| Motor 4 | 123 | 0.19 | **+0.34** | 1.64 | 2.3 | 13.4R | +0.39 | +0.27 | +0.94 · +0.17 · +0.08 · +0.48 · +0.35 |
| Motors 3+4 | 277 | 0.43 | **+0.31** | 1.58 | 3.1 | 15.2R | +0.29 | +0.35 | +0.60 · +0.16 · +0.01 · +0.55 · +0.36 |

*24H1 = May–Jun 2024 only.

Cost sensitivity:
- FINAL_V1 average R by total cost: 0pt +0.059 · 0.2pt +0.016 · 0.3pt −0.006 · 0.5pt −0.050 · 1.5pt −0.27. Median FINAL_V1 risk is only 5.15pt (vs 9.59pt for Motors 3/4), so spread eats most of its edge. 2026 alone is better (+0.125R at 0.3pt).
- Motors 3+4 at 1.5pt stress: +0.18R (PF 1.28), still positive in train and test.
- Capital.com live GOLD spread observed today: 0.75pt.

Independence (0.5pt):
- Daily R correlation FINAL_V1 × Motors 3+4: **0.01**.
- Only 18 of 277 Motor 3/4 signals were within 1h of a FINAL_V1 signal in the same direction; 26 were within 1h of an opposite one.

## Phase G robustness — Motors 3+4

- Neighbour parameters: Motor 3 positive across touches 0–1 / 0–2 / 0–3 / 1–2 / 0–4 and RSI cut 3…12 (best area around touches ≤ 2, RSI > 5–8). Motor 4 positive for alignment 0..1, 0..0, 1..1, −1..1 and RSI cut −15…−5. It turns negative when RSI must already be in favour (> 0): this family works as a pullback into the block.
- Long and short both positive (C +0.27R / V +0.36R).
- Sessions (UTC entry hour): Asia +0.45 · London +0.21 · NY +0.20 · late NY +0.62. All positive.
- Source engines: ZONA +0.21 · ROMPE_RETESTE +0.64 · OB_CAPTURA_H1 +0.23 · OB_CAPTURA_M15 +0.36.
- Monte Carlo (5000 reorderings): median max DD 12.0R · 95% 18.8R · worst 30.5R.
- Bootstrap of mean R: 5th percentile +0.13R, P(mean ≤ 0) ≈ 0%.
- Weak spot: 2025H1 is roughly flat (+0.01R).

Production-parity finding: the Market production filter accepted "no zone" signals (touches = −1, avg −0.12R) and alignment −1 for Motor 4, which the tested rule did not. Fixed in `market-ai-analyzer` commit `4960a5c` so production equals the tested rule.

## Phase F (AI / meta-labeling) — not run

Only ~155 Motor 3/4 trades fall in the train period. Any ML filter on top of rules that were themselves chosen on that train set would overfit. Revisit after the forward sample grows.

## Verdict

- **Motors 3+4 are the only family that passed every gate so far**: positive train and test, positive with 1.5pt stress, stable neighbour parameters, both sides, all sessions, and almost zero correlation with FINAL_V1.
- **ALPHA_2 candidate = Motors 3+4**, frequency ~0.43/day.
- They are already running live on market-ai-analyzer with a forward scoreboard (no orders), which serves as the shadow-forward stage. A LIVE_V3 mirror inside Aurum needs a design decision (port the engines vs read Market signals), plus a new Supabase table/function. Not done yet.
- **Warning on FINAL_V1**: on HistData 2024-05 → 2026-09 its edge is gross only (+0.06R) and vanishes at ~0.3pt cost. FINAL_V1 stays frozen; this is recorded for the owner's decision, not changed.

---

# What has NOT been changed

During this research:

- FINAL_V1 signal logic remains frozen
- LIVE_V2 official forward logic remains separate
- MGMT_V1 remains separate
- no automatic broker execution was added
- failed research engines have not been allowed to generate official Telegram signals
- research endpoints do not modify production signal eligibility

---

# Execution plan

## Phase A — Complete Sweep-and-Reclaim replication

1. Finish and compile the GoldEA faithful replication.
2. Run four independent ~180-day Capital windows.
3. Record:
   - trades
   - win rate
   - expectancy R
   - PF
   - max drawdown
   - long/short split
   - trades/day
   - positive months
   - behavior under 0.5pt and 1.5pt cost stress
4. Reject immediately if the edge exists only in one window.

Promotion gate for deeper testing:
- >= 25 trades in a window
- avg R >= +0.05
- PF >= 1.15
- positive months >= 60%
- cost-stressed expectancy remains positive
- evidence from multiple distinct periods

---

## Phase B — Extend historical depth with HistData

If Capital history is insufficient:

1. obtain XAUUSD M1/M5/M15 from HistData
2. normalize timestamps
3. reconstruct M15/H1/H4 causally
4. validate session handling through DST
5. test:
   - 2020
   - 2021
   - 2022
   - 2023
   - 2024
   - 2025
   - 2026
6. inspect:
   - bull regimes
   - bearish regimes
   - sideways / low-volatility regimes
   - extreme-volatility periods

Goal:
avoid building an engine that is merely a 2025-2026 gold bull-market artifact.

---

## Phase C — Strategy-family bakeoff

Only after the Sweep replication is measured fairly, compare:

- FINAL_V1
- Sweep-and-Reclaim
- selected Trend Pullback family
- selected Regime Reversion family
- ATR-gated FVG/NY as reference benchmark

Same:
- cost assumptions
- data
- periods
- metrics
- no overlapping trade accounting tricks

The goal is not to pick the prettiest equity curve.

The goal is to identify **uncorrelated sources of positive expectancy**.

---

## Phase D — Build ALPHA_2 only if a family survives

ALPHA_2 should be independent of FINAL_V1.

Candidate design:

### ALPHA_2 SESSION_FLOW
Potential components:
- session liquidity levels
- sweep / reclaim
- confirmed HTF structure
- volatility condition
- live-entry deviation control
- structural stop
- causal M1/M5 confirmation only if it improves OOS performance

No component is added unless it improves forward robustness.

---

## Phase E — Frequency optimization

Frequency is optimized only after positive expectancy is established.

Target:
- combined FINAL_V1 + ALPHA_2 roughly 1-3 valid opportunities on active days

Never optimize first for:
- arbitrary daily signal count
- win rate alone
- beautiful backtest equity curve

Frequency improvements will be attempted through:
- independent setup families
- session diversity
- regime diversity
- reduced correlation between motors

Not by weakening the existing FINAL_V1 gate.

---

## Phase F — AI / meta-labeling

Only if ALPHA_2 produces a sufficiently large trade sample.

Minimum desired sample:
- ideally 200+ closed historical trades

Possible model:
- deterministic motor generates candidate
- ML predicts PASS / BLOCK
- ML does not directly invent BUY / SELL

Candidate features:
- setup family
- session
- HTF structure
- ATR percentile
- expansion ratio
- distance to liquidity level
- stop distance
- M1 behavior
- M5 displacement
- nearby S/R
- directional regime
- spread
- day-of-week
- macro-event proximity, if a reliable calendar feed is later added

Validation:
- purged chronological folds
- no randomized leakage
- comparison against the unfiltered motor
- minimum improvement must persist after costs

---

## Phase G — Statistical robustness layer

For any finalist:

- walk-forward
- multiple chronological holdouts
- cost stress
- neighbor-parameter stability
- Monte Carlo / sequence reshuffle
- Deflated Sharpe Ratio where meaningful
- Probability of Backtest Overfitting / CSCV where sample size permits
- long/short decomposition
- regime decomposition
- session decomposition
- sensitivity to stop / target assumptions

Any candidate dependent on one exact parameter value is rejected.

---

## Phase H — LIVE_V3 shadow

Only after historical approval.

LIVE_V3:
- manual-only
- no real order execution
- independent tracking version
- separate metrics from LIVE_V2
- Telegram can report ALPHA_2 signals only after explicit activation
- no mixing PRE_FIX / LIVE_V2 / LIVE_V3 statistics

Minimum forward judgment:
- enough closed trades to evaluate expectancy meaningfully
- no promotion based on first few wins

---

# Current working conclusion

The research so far has produced an important negative result:

> There is no evidence yet of a static intraday XAUUSD setup that can simply be copied, tuned once, and expected to remain dominant across regimes.

The strongest clue is instead:

> successful intraday behavior appears to be **regime- and session-dependent**, and the most credible path is to discover multiple independent, causal edges and combine them only after each survives separate validation.

Therefore the next priority is:

**complete the faithful Sweep-and-Reclaim replication, expand historical testing with HistData if needed, and only then decide whether ALPHA_2 deserves a live-shadow implementation.**

---

## Research status summary

| Track | Status |
|---|---|
| FINAL_V1 | Frozen / production research baseline |
| Volatility Expansion Trend | Rejected |
| Generic Session Sweep | Rejected / superseded by faithful replication |
| Generic FVG Retest | Rejected |
| Expansion Retest | Rejected |
| Static Trend Pullback | Regime-dependent |
| Static Regime Reversion | Regime-dependent |
| Conditional Expectancy Meta-Filter | Rejected |
| Gold_Research ATR Stack | Reproduced in some regimes, rejected as universal ALPHA_2 |
| GoldEA Sweep-and-Reclaim | Rejected (Phase A: 4 Capital windows + HistData 2024-2026) |
| HistData long-history extension | In use (M1 2024-01 → 2026-09) |
| Market Motors 3+4 (zona com força + bloco lateral) | **Passed Phase C/G — ALPHA_2 candidate** |
| FINAL_V1 cost check (HistData) | Gross +0.06R, ≈0 at 0.3pt, −0.05R at 0.5pt — owner decision |
| ALPHA_2 production motor | Candidate chosen; LIVE_V3 design pending |
| LIVE_V3 shadow | Not yet started |
