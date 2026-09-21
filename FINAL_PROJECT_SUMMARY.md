# Final Project Summary — London Housing Price Regression

## 1. Objective
Build a realistic London residential property price regression system using linked transaction and EPC information, while avoiding target leakage and respecting temporal deployment conditions.

## 2. Main engineering decisions
- London-only data assembled from 33 borough / City files.
- Data-quality auditing performed before modeling.
- Target-leaking fields excluded.
- Time-based validation used instead of random splitting.
- Historical postcode/location features generated with past-only information.
- A Control HGB model retained as a safe fallback.
- Reliability is reported separately from the point prediction.

## 3. Model choice
The raw-target HistGradientBoosting model was retained over a log-target variant because the log model slightly reduced MAE but materially worsened RMSE and high-end absolute errors.

The Enhanced location-aware HGB became the primary model because it improved 2021 validation MAE from £119,351.63 to £114,630.77 and improved R² from 0.8238 to 0.8313.

A more complex routing model was tested and rejected because it performed worse than simply using the Enhanced model with a Control fallback for unseen postcode sectors.

## 4. Final independent result
Final holdout: 2022–2023, N = 158,493.

- MAE: £133,125
- RMSE: £411,840
- R²: 0.8025
- MdAPE: 12.28%
- Within 20%: 71.59%

For the main £250k–£2m market:

- N = 144,645
- MAE: £99,450
- RMSE: £166,466
- R²: 0.7357
- MdAPE: 11.67%
- Within 20%: 74.42%

## 5. Reliability
Final-test results support the usefulness of the A–D predictability grading system.

Grade A had the lowest MAE and highest within-20% rate, while Grade D had the highest MAE and lowest within-20% rate.

Evidence Strength also behaved sensibly: Very Low evidence had substantially larger error than High / Medium evidence.

## 6. Known failure modes
- Very low-price transactions are difficult and tend to be overpredicted.
- Ultra-luxury properties are difficult and tend to be underpredicted.
- Detached properties show higher absolute error than the other property types.
- Post-2023 market drift is not covered by the independent test.
- Important property-level features are unavailable.

## 7. What is locked
The 2022–2023 final test has already been opened.

Do not:
- tune hyperparameters on it
- select new models based on it
- tune reliability thresholds on it
- use it to decide whether a neural network should replace the current model

Any future model-development phase needs new temporal data or a fresh holdout.

## 8. Project status
The regression-modeling research phase is complete.

Remaining engineering work:
- maintain deployment/API
- publish/maintain frontend demo
- keep repository reproducible
- evaluate later only when genuinely new data become available
