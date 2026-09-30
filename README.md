# ProjectLog

A multi-project portfolio and engineering log.

This repository is intentionally organized so future projects do not get mixed together.

## Repository map

```text
projectlog/
├─ index.html                 # ProjectLog web app
├─ cloud.js                   # ProjectLog cloud persistence
├─ shared-cloud.js            # Shared cloud sync layer
├─ supabase/                  # ProjectLog database schema / cloud setup
├─ PROJECTS.md                # Index of projects in this repository
├─ projects/
│  └─ london-housing/         # London Housing project docs + research scripts
├─ api.py                     # London Housing prediction API runtime
├─ predict_house.py           # London Housing prediction runtime
├─ final_deployment_package/  # Current London Housing deployed model package
├─ end_to_end_smoke_test.py   # London Housing API smoke test
├─ render.yaml                # Render deployment config for London Housing API
└─ requirements.txt           # Current backend runtime dependencies
```

## Project ownership

| Path | Belongs to |
|---|---|
| `index.html`, `cloud.js`, `shared-cloud.js`, `supabase/` | ProjectLog platform |
| `projects/london-housing/` | London Housing Price Intelligence |
| `api.py`, `predict_house.py`, `final_deployment_package/`, `end_to_end_smoke_test.py` | London Housing deployed service |
| `render.yaml`, `requirements.txt` | Current London Housing backend deployment |

For project-specific documentation, start with [PROJECTS.md](./PROJECTS.md).

## Current featured project

**London Housing Price Intelligence** — research/modeling complete, with a final 2024 out-of-time evaluation.

2024 independent evaluation:
- Training: 2011–2023
- Test: 2024 only
- Test rows: 40,548
- MAE: £126,696.97
- RMSE: £297,600.17
- R²: 0.8260
- Median absolute percentage error: 12.56%
- Within ±10%: 41.32%
- Within ±20%: 69.92%
- Within ±30%: 84.45%

See [projects/london-housing/README.md](./projects/london-housing/README.md) for the complete project record.
