# Projects

This file is the repository-level index. Each new project should get its own folder under `projects/`.

## 1. London Housing Price Intelligence

Path: [projects/london-housing/](./projects/london-housing/)

Status: **Modeling and final evaluation complete**

Purpose: time-aware London residential price prediction using linked transaction, EPC, and leakage-safe historical location features.

Final independent out-of-time evaluation:
- Train: 2011–2023
- Test: 2024
- N = 40,548
- MAE = £126,696.97
- RMSE = £297,600.17
- R² = 0.8260
- Median percentage error = 12.56%
- Within ±20% = 69.92%
- Within ±30% = 84.45%

Runtime files for this project currently remain at repository root because Render deploys the API from there:
- `api.py`
- `predict_house.py`
- `final_deployment_package/`
- `end_to_end_smoke_test.py`
- `render.yaml`
- `requirements.txt`

## Adding the next project

Create:

```text
projects/<project-slug>/
├─ README.md
├─ docs/
├─ research/
└─ outputs/   # only lightweight outputs; do not commit large raw datasets
```

Keep raw datasets, local caches, secrets, and large generated files out of GitHub.
