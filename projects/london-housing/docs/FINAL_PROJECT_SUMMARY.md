# Final Project Summary — London Housing Price Intelligence

## Objective
Build a realistic London residential property-price prediction system while preventing target leakage and respecting time order.

## Core engineering decisions
- London-only linked transaction + EPC data.
- Time-based validation rather than random splitting.
- Target-derived and ID/audit fields excluded from model inputs.
- Past-only historical postcode-sector, district, and borough statistics.
- Separate reliability/evidence reporting.
- Phase 2 luxury specialist introduced only after development on pre-final periods.
- Router frozen at LogisticRegression class weight `{0:1,1:5}` and probability threshold `0.90`.

## Phase 2 frozen system
- Unified Enhanced HGB
- Luxury-only Enhanced HGB specialist for historical £2m+ training records
- Learned router chooses Specialist only when luxury probability ≥ 0.90

## 2022–2023 locked evaluation
Phase 2 two-stage system:
- Overall MAE: £131,621
- RMSE: £372,987
- R²: 0.8380
- Main £250k–£2m MAE: £100,644
- Luxury £2m+ MAE: £933,070
- Ultra-luxury £5m+ MAE: £2.422m

## Final 2024 out-of-time evaluation
Retraining used all available pre-2024 data while preserving the selected architecture.

- Training: 2011–2023
- Test: 2024 only
- N: 40,548
- MAE: £126,696.97
- RMSE: £297,600.17
- R²: 0.8260
- Median percentage error: 12.56%
- Within ±10%: 41.32%
- Within ±20%: 69.92%
- Within ±30%: 84.45%
- Mean signed error: +£32,637.38
- Underprediction rate: 41.23%

Router on 2024:
- Precision: 75.46%
- Recall: 80.61%
- Routed share: 3.09%

## Interpretation
The final system provides useful mainstream London estimates while high-end property remains substantially more uncertain. The 2024 test supports reporting error bands such as “69.9% of predictions were within ±20% historically” rather than a misleading single “accuracy percentage.”

## Governance
2024 is now an opened evaluation set. Do not tune the current architecture or threshold using these results.

## Project status
Modeling and evaluation are complete. Remaining work is engineering synchronization: packaging the 2011–2023-trained final model into the API deployment and keeping the portfolio/demo documentation aligned.
