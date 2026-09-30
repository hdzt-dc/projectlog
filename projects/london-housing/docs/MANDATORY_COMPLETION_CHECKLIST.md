# Mandatory Completion Checklist — London Housing

## Modeling integrity
- [x] Target leakage audited
- [x] ID/audit fields excluded from model features
- [x] Time-based validation used
- [x] Historical location encodings are past-only
- [x] Phase 2 router/specialist architecture frozen before locked evaluation
- [x] 2022–2023 evaluation completed without post-result retuning
- [x] New 2024 source data prepared independently
- [x] Final train 2011–2023 / test 2024 out-of-time evaluation completed
- [x] 2024 results marked locked against future tuning

## Final 2024 evaluation
- [x] N = 40,548
- [x] MAE = £126,696.97
- [x] RMSE = £297,600.17
- [x] R² = 0.8260
- [x] MdAPE = 12.56%
- [x] Within ±20% = 69.92%
- [x] Within ±30% = 84.45%

## Repository / reproducibility
- [x] Project-specific folder created
- [x] Root repository ownership documented
- [x] Research scripts moved under `projects/london-housing/research/`
- [x] Final summary moved under `projects/london-housing/docs/`
- [x] Raw datasets kept out of GitHub
- [ ] Build/save the final 2011–2023 deployment model package
- [ ] Switch API runtime to that final package
- [ ] Run final end-to-end smoke test after deployment package switch

## Completion rule
The research/modeling portion is complete. The remaining unchecked items are deployment synchronization only.
