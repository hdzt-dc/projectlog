"""
Phase 2 - Step 1: Extreme Residual Audit
London Housing Price Intelligence Project

Purpose
-------
Read the frozen 2022-2023 final-test prediction output and inspect the largest
absolute residuals WITHOUT changing or tuning the final model.

Input
-----
final_test_outputs/10_final_test_predictions.csv

Outputs
-------
phase2_residual_audit/
  01_top20_absolute_residuals.csv
  02_top50_absolute_residuals.csv
  03_top100_absolute_residuals.csv
  04_extreme_residual_summary.csv
  05_flag_summary.csv

Important
---------
This is an audit/diagnostic step only. Do not use the 2022-2023 final test to
retune model hyperparameters, feature rules, or reliability thresholds.
"""

from pathlib import Path
import numpy as np
import pandas as pd


PROJECT_FOLDER = Path(
    r"C:\Users\33996\Desktop\project\London Housing Price Intelligence Project"
)

INPUT_FILE = (
    PROJECT_FOLDER
    / "final_test_outputs"
    / "10_final_test_predictions.csv"
)

OUTPUT_FOLDER = (
    PROJECT_FOLDER
    / "phase2_residual_audit"
)

OUTPUT_FOLDER.mkdir(exist_ok=True)


def first_existing(df, candidates):
    for column in candidates:
        if column in df.columns:
            return column
    return None


print("=" * 90)
print("PHASE 2 - STEP 1: EXTREME RESIDUAL AUDIT")
print("=" * 90)

if not INPUT_FILE.exists():
    raise FileNotFoundError(
        "Cannot find final-test predictions:\n"
        f"{INPUT_FILE}\n\n"
        "Run final_test_2022_2023.py first, or confirm that "
        "10_final_test_predictions.csv exists."
    )

df = pd.read_csv(INPUT_FILE)

required = [
    "price",
    "final_prediction",
    "final_absolute_error",
]

missing = [c for c in required if c not in df.columns]
if missing:
    raise ValueError(
        "Missing required columns: "
        + ", ".join(missing)
    )

# Recalculate diagnostic fields so this audit remains self-checking.
df["audit_signed_error"] = (
    df["final_prediction"] - df["price"]
)

df["audit_absolute_error"] = np.abs(
    df["audit_signed_error"]
)

df["audit_percentage_error"] = (
    df["audit_absolute_error"]
    / df["price"]
    * 100
)

# Check that saved final_absolute_error agrees with the recalculation.
difference = np.abs(
    df["final_absolute_error"]
    - df["audit_absolute_error"]
)

print(f"Rows loaded: {len(df):,}")
print(
    "Max difference between saved and recalculated absolute error:",
    round(float(difference.max()), 6),
)

# ------------------------------------------------------------------
# Conservative data-quality flags.
# These are audit flags, NOT automatic deletion rules.
# ------------------------------------------------------------------

area_col = first_existing(
    df,
    ["tfarea", "floor_area"]
)

rooms_col = first_existing(
    df,
    ["numberrooms", "numberrooms_filled"]
)

current_epc_col = first_existing(
    df,
    [
        "CURRENT_ENERGY_EFFICIENCY",
        "current_energy_efficiency",
    ],
)

potential_epc_col = first_existing(
    df,
    [
        "POTENTIAL_ENERGY_EFFICIENCY",
        "potential_energy_efficiency",
    ],
)

df["flag_price_nonpositive"] = (
    df["price"] <= 0
)

if area_col:
    df["flag_area_invalid"] = (
        df[area_col].isna()
        | (df[area_col] < 10)
    )
else:
    df["flag_area_invalid"] = False

if rooms_col:
    df["flag_rooms_invalid"] = (
        df[rooms_col].notna()
        & (
            (df[rooms_col] <= 0)
            | (df[rooms_col] > 20)
        )
    )
else:
    df["flag_rooms_invalid"] = False

if area_col and rooms_col:
    valid_rooms = df[rooms_col].replace(0, np.nan)
    df["audit_area_per_room"] = (
        df[area_col] / valid_rooms
    )
    df["flag_area_room_inconsistent"] = (
        df["audit_area_per_room"].notna()
        & (
            (df["audit_area_per_room"] < 3)
            | (df["audit_area_per_room"] > 100)
        )
    )
else:
    df["audit_area_per_room"] = np.nan
    df["flag_area_room_inconsistent"] = False

if current_epc_col:
    df["flag_current_epc_invalid"] = (
        df[current_epc_col].notna()
        & (
            (df[current_epc_col] < 0)
            | (df[current_epc_col] > 100)
        )
    )
else:
    df["flag_current_epc_invalid"] = False

if potential_epc_col:
    df["flag_potential_epc_invalid"] = (
        df[potential_epc_col].notna()
        & (
            (df[potential_epc_col] < 0)
            | (df[potential_epc_col] > 100)
        )
    )
else:
    df["flag_potential_epc_invalid"] = False

flag_cols = [
    "flag_price_nonpositive",
    "flag_area_invalid",
    "flag_rooms_invalid",
    "flag_area_room_inconsistent",
    "flag_current_epc_invalid",
    "flag_potential_epc_invalid",
]

df["audit_any_quality_flag"] = (
    df[flag_cols].any(axis=1)
)

# Helpful market labels for interpretation, not model tuning.
df["audit_market_segment"] = pd.cut(
    df["price"],
    bins=[
        -np.inf,
        250_000,
        2_000_000,
        5_000_000,
        np.inf,
    ],
    labels=[
        "Below £250k",
        "£250k-£2m",
        "£2m-£5m",
        "£5m+",
    ],
    right=False,
)

df["audit_error_direction"] = np.where(
    df["audit_signed_error"] < 0,
    "Underprediction",
    np.where(
        df["audit_signed_error"] > 0,
        "Overprediction",
        "Exact",
    ),
)


# ------------------------------------------------------------------
# Sort by absolute residual and export Top 20 / 50 / 100.
# ------------------------------------------------------------------

ranked = df.sort_values(
    "audit_absolute_error",
    ascending=False,
).copy()

preferred_columns = [
    "year",
    "price",
    "final_prediction",
    "audit_signed_error",
    "audit_absolute_error",
    "audit_percentage_error",
    "audit_error_direction",
    "audit_market_segment",
    "property_name",
    "propertytype",
    "duration",
    "borough",
    "postcode",
    "postcode_district",
    "postcode_sector",
    "tfarea",
    "numberrooms",
    "numberrooms_filled",
    "CURRENT_ENERGY_EFFICIENCY",
    "POTENTIAL_ENERGY_EFFICIENCY",
    "construction_age_clean",
    "sector_seen_before",
    "test_reliability_grade",
    "test_reliability_evidence",
    "test_reliability_status",
    "audit_area_per_room",
    *flag_cols,
    "audit_any_quality_flag",
]

export_columns = [
    c for c in preferred_columns
    if c in ranked.columns
]

for n, filename in [
    (20, "01_top20_absolute_residuals.csv"),
    (50, "02_top50_absolute_residuals.csv"),
    (100, "03_top100_absolute_residuals.csv"),
]:
    ranked.head(n)[export_columns].to_csv(
        OUTPUT_FOLDER / filename,
        index=False,
    )


# ------------------------------------------------------------------
# Summary: what kind of extreme errors are we seeing?
# ------------------------------------------------------------------

top100 = ranked.head(100).copy()

summary_rows = [
    {
        "metric": "Top 100 count",
        "value": len(top100),
    },
    {
        "metric": "Top 100 underpredictions",
        "value": int(
            (top100["audit_signed_error"] < 0).sum()
        ),
    },
    {
        "metric": "Top 100 overpredictions",
        "value": int(
            (top100["audit_signed_error"] > 0).sum()
        ),
    },
    {
        "metric": "Top 100 with any quality flag",
        "value": int(
            top100["audit_any_quality_flag"].sum()
        ),
    },
    {
        "metric": "Top 100 £2m+ actual price",
        "value": int(
            (top100["price"] >= 2_000_000).sum()
        ),
    },
    {
        "metric": "Top 100 £5m+ actual price",
        "value": int(
            (top100["price"] >= 5_000_000).sum()
        ),
    },
    {
        "metric": "Median absolute residual - Top 100",
        "value": float(
            top100["audit_absolute_error"].median()
        ),
    },
    {
        "metric": "Median percentage error - Top 100",
        "value": float(
            top100["audit_percentage_error"].median()
        ),
    },
]

pd.DataFrame(summary_rows).to_csv(
    OUTPUT_FOLDER / "04_extreme_residual_summary.csv",
    index=False,
)

flag_summary = pd.DataFrame(
    {
        "flag": flag_cols,
        "all_final_test_count": [
            int(df[c].sum())
            for c in flag_cols
        ],
        "top100_count": [
            int(top100[c].sum())
            for c in flag_cols
        ],
    }
)

flag_summary.to_csv(
    OUTPUT_FOLDER / "05_flag_summary.csv",
    index=False,
)


print("\nTop 20 extreme residuals:")
display_cols = [
    c for c in [
        "year",
        "price",
        "final_prediction",
        "audit_signed_error",
        "audit_absolute_error",
        "audit_percentage_error",
        "borough",
        "postcode",
        "tfarea",
        "numberrooms_filled",
        "audit_market_segment",
        "audit_any_quality_flag",
    ]
    if c in ranked.columns
]

print(
    ranked.head(20)[display_cols]
    .round(2)
    .to_string(index=False)
)

print("\nTop-100 audit summary:")
print(
    pd.DataFrame(summary_rows)
    .to_string(index=False)
)

print("\nQuality-flag summary:")
print(
    flag_summary.to_string(index=False)
)

print("\nIMPORTANT:")
print(
    "Flags are review signals only. "
    "Do NOT automatically delete flagged or expensive properties."
)
print(
    "The frozen 2022-2023 final test is being used only to understand "
    "failure modes, not to tune the final model."
)

print("\nOutputs:")
print(OUTPUT_FOLDER)
