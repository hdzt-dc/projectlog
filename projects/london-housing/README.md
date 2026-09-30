# London Housing Price Intelligence

A time-aware machine-learning regression project for estimating London residential property prices from property, EPC, and historical location information.

## Final status

**Research/modeling complete.**

The project progressed through:
1. data cleaning and leakage audit,
2. 2021 time-based validation,
3. leakage-safe location features,
4. reliability analysis,
5. 2022–2023 locked evaluation,
6. Phase 2 residual/luxury-market analysis,
7. a frozen two-stage luxury routing system,
8. final 2024 out-of-time evaluation using newly available data.

No further tuning should be performed using the already-opened 2024 test results.

## Final architecture

The selected Phase 2 system contains:
- **Unified Enhanced HistGradientBoostingRegressor**
- **Luxury Specialist HistGradientBoostingRegressor** trained on historical £2m+ sales
- **LogisticRegression router**
  - class weight: `{0:1, 1:5}`
  - probability threshold: `0.90`
- leakage-safe historical postcode-sector → district → borough → global fallback features

The router does not use actual price or specialist prediction as inference inputs.

## Final 2024 out-of-time evaluation

Training data: **2011–2023**  
Historical location information: **2010–2023**  
Test data: **2024 only**  
Test rows: **40,548**

| Metric | Result |
|---|---:|
| MAE | £126,696.97 |
| RMSE | £297,600.17 |
| R² | 0.8260 |
| Median percentage error | 12.56% |
| Mean percentage error | 19.67% |
| Within ±10% | 41.32% |
| Within ±20% | 69.92% |
| Within ±30% | 84.45% |
| Mean signed error | +£32,637.38 |
| Underprediction rate | 41.23% |

Router on 2024:
- threshold: 0.90
- precision: 75.46%
- recall: 80.61%
- routed to Luxury Specialist: 3.09%

These are out-of-time evaluation results. They should be reported as historical test performance, not as a guarantee for an individual future property.

## Earlier locked 2022–2023 evaluation

The Phase 2 frozen two-stage system was also evaluated on 2022–2023:
- Overall MAE: £131,621
- RMSE: £372,987
- R²: 0.8380
- Main-market MAE: £100,644
- Luxury £2m+ MAE: £933,070
- Ultra-luxury £5m+ MAE: £2.422m

This evaluation was not used to change the frozen Phase 2 threshold or architecture.

## Main limitations

- Luxury and ultra-luxury property prices remain materially harder to predict.
- The model lacks interior condition, exact floor, view, garden/parking quality, detailed lease terms, and special transaction context.
- 2024 coverage in the source update runs to approximately late October, not a full calendar-year transaction census.
- Market drift after the tested period may reduce accuracy.
- Reliability/typical-error information is an uncertainty aid, not a formal confidence interval.

## Repository layout for this project

```text
projects/london-housing/
├─ README.md
├─ docs/
│  ├─ FINAL_PROJECT_SUMMARY.md
│  └─ MANDATORY_COMPLETION_CHECKLIST.md
└─ research/
   ├─ phase2_extreme_residual_audit.py
   └─ phase2_residual_audit.py
```

Deployment runtime currently remains at repository root to avoid breaking the existing Render service.
