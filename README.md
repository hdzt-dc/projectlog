# London Housing Price Intelligence

A time-aware machine-learning regression project for estimating London residential property prices from property, energy-efficiency, and location features.

## Project status

**Core modeling work: complete.**  
The project has progressed from raw data preparation through leakage auditing, model comparison, reliability calibration, an independently held-out final test, packaging, and a FastAPI prediction service.

The remaining work is deployment/portfolio maintenance rather than further tuning on the final test set.

## Problem

Estimate residential sale prices in London while keeping the evaluation realistic over time and avoiding target leakage.

The deployed system combines:

- a **Control HistGradientBoostingRegressor**
- an **Enhanced location-aware HistGradientBoostingRegressor**
- leakage-safe historical postcode-sector / district / borough statistics
- a **Control fallback** for postcode sectors unseen in historical training data
- a reliability layer that reports:
  - Predictability Grade
  - Evidence Strength
  - Reliability Status

## Data

Source dataset: London house-price-per-square-metre data derived from linked Land Registry Price Paid Data and EPC records.

Key project counts:

| Stage | Rows |
|---|---:|
| Raw merged London data | 2,806,764 |
| Cleaned data | 2,803,298 |
| 2010–2023 modeling window | 1,252,781 |
| Modeling rows after removing four transactions with price ≤ £10,000 | 1,252,777 |
| Final test rows (2022–2023) | 158,493 |

## Leakage controls

The following fields are **not used as model features**:

- `priceper`
- `low_price_flag`
- `suspicious_price_per_sqm`
- `transactionid`
- `lmk_key`

`transactionid` and `lmk_key` are retained only for auditing / grouping purposes.

Historical location features are built using **past data only**. For a record in year `y`, the historical encoding uses data from years `< y`.

## Features

### Numeric
- `year`
- `tfarea`
- `numberrooms_filled`
- `rooms_missing`
- `CURRENT_ENERGY_EFFICIENCY`
- `POTENTIAL_ENERGY_EFFICIENCY`

### Categorical
- `propertytype`
- `duration`
- `borough`
- `postcode_district`
- `construction_age_clean`

### Historical location features
- `sector_hist_median_price`
- `district_hist_median_price`
- `borough_hist_median_price`
- `location_hist_price`
- `sector_hist_count`
- `district_hist_count`
- `borough_hist_count`

## Model development

### Ridge baseline — 2021 validation
- MAE: **£184,902.73**
- RMSE: **£447,562.59**
- R²: **0.6251**

### Control HistGradientBoosting — 2021 validation
- MAE: **£119,351.63**
- RMSE: **£306,776.83**
- R²: **0.8238**

### Enhanced location model — 2021 validation
- MAE: **£114,630.77**
- RMSE: **£300,213.24**
- R²: **0.8313**
- Median absolute percentage error: **11.60%**
- Within 20% of actual price: **73.64%**

Relative to the Control model, validation MAE improved by approximately **3.96%**.

## Locked final test

Model and reliability choices were frozen before opening the final 2022–2023 holdout.

### Final system — 2022–2023
- N: **158,493**
- MAE: **£133,125**
- RMSE: **£411,840**
- R²: **0.8025**
- Median absolute percentage error: **12.28%**
- Within 10%: **41.91%**
- Within 20%: **71.59%**
- Within 30%: **86.48%**

### Main target market: £250k–£2m
- N: **144,645**
- MAE: **£99,450**
- RMSE: **£166,466**
- R²: **0.7357**
- Median absolute percentage error: **11.67%**
- Within 20%: **74.42%**
- Within 30%: **89.37%**

### By year
| Year | MAE | R² | MdAPE | Within 20% |
|---|---:|---:|---:|---:|
| 2022 | £128,589 | 0.8334 | 12.06% | 72.52% |
| 2023 | £139,376 | 0.7652 | 12.59% | 70.31% |

## Reliability layer

The reliability system combines:

1. **Predictability Grade** — A / B / C / D
2. **Evidence Strength** — High / Medium / Low / Very Low
3. Local borough × property type × predicted-price-band evidence when sufficient data exist.

Final-test calibration showed a useful monotonic pattern:

| Grade | N | MAE | MdAPE | Within 20% |
|---|---:|---:|---:|---:|
| A | 25,049 | £67,884 | 10.42% | 81.23% |
| B | 100,683 | £87,992 | 11.82% | 73.22% |
| C | 21,647 | £267,729 | 15.37% | 61.56% |
| D | 11,113 | £426,816 | 17.84% | 54.66% |

This reliability output should be treated as an uncertainty / evidence aid, not as a formal prediction interval.

## Deployment behavior

Primary model:
- **Enhanced Location HGB**

Fallback:
- **Control model**
- used when a postcode sector was unseen in the historical training data

The deployment layer also reports warnings for:

- prediction years outside the independently tested 2022–2023 period
- predictions outside the main £250k–£2m market
- missing room count (training median = 4.0 is used and a missing indicator is activated)

## API

Start the local FastAPI service:

```bash
python -m uvicorn api:app --reload
```

Then open:

- API root: `http://127.0.0.1:8000/`
- Swagger docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`

Example request:

```json
{
  "year": 2023,
  "postcode": "E14 9GU",
  "borough": "Tower_Hamlets",
  "propertytype": "F",
  "duration": "L",
  "tfarea": 70,
  "numberrooms": 3,
  "current_energy_efficiency": 72,
  "potential_energy_efficiency": 82,
  "construction_age_clean": "2007 onwards"
}
```

## Important limitations

- Best suited to the mainstream London market around **£250k–£2m**.
- Very low-price and ultra-luxury properties have materially higher uncertainty.
- The model does not observe important property-specific variables such as:
  - interior condition
  - exact street / micro-location
  - garden
  - parking
  - view
  - floor level
  - detailed lease terms
  - special transaction circumstances
- Market drift after 2023 can reduce accuracy.
- The 2022–2023 final test has already been opened and **must not be reused for further model tuning**.

## Reproducibility

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Run the API smoke test after starting the server:

```bash
python end_to_end_smoke_test.py
```

## Suggested repository structure

```text
London-Housing-Price-Intelligence/
├─ README.md
├─ requirements.txt
├─ .gitignore
├─ api.py
├─ predict_house.py
├─ deployment_validation.py
├─ end_to_end_smoke_test.py
├─ final_deployment_package/
│  ├─ control_model.joblib
│  ├─ enhanced_model.joblib
│  ├─ location_statistics.joblib
│  ├─ base_reliability_lookup.csv
│  ├─ local_reliability_lookup.csv
│  └─ model_metadata.json
├─ data_processing/
├─ modeling/
├─ diagnostics/
└─ frontend/
```

## Current project conclusion

The project has reached a defensible stopping point for model development. The final system improves materially over the linear baseline, location-aware historical features provide a modest but repeatable validation gain, and the independent 2022–2023 test confirms useful performance—especially in the mainstream £250k–£2m market.

Further work should use **new data or a newly designed holdout**, not the already-opened final test.
