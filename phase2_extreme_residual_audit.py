from pathlib import Path
import numpy as np
import pandas as pd

# ============================================================
# Phase 2 - Extreme Residual Audit
# Purpose:
#   Inspect the largest FINAL TEST errors without tuning the
#   already-opened 2022-2023 final test.
#
# This script is diagnostic only:
# - it does NOT retrain the model
# - it does NOT change thresholds/model parameters
# - it does NOT delete rows automatically
# ============================================================

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
    / "phase2_noise_audit"
)
OUTPUT_FOLDER.mkdir(exist_ok=True)


def first_existing(df, names):
    for name in names:
        if name in df.columns:
            return name
    return None


def add_flag(flags, mask, label):
    flags.loc[mask] = flags.loc[mask].apply(
        lambda x: x + [label]
    )


print("=" * 90)
print("PHASE 2 - EXTREME RESIDUAL AUDIT")
print("=" * 90)

if not INPUT_FILE.exists():
    raise FileNotFoundError(
        f"Cannot find:\n{INPUT_FILE}\n\n"
        "Run final_test_2022_2023.py first, or confirm that "
        "final_test_outputs/10_final_test_predictions.csv exists."
    )

df = pd.read_csv(INPUT_FILE)

required = [
    "price",
    "final_prediction",
]

missing_required = [
    c for c in required
    if c not in df.columns
]

if missing_required:
    raise ValueError(
        "Missing required columns: "
        + ", ".join(missing_required)
    )

# ------------------------------------------------------------
# 1. Recreate error fields safely
# ------------------------------------------------------------

df["audit_signed_error"] = (
    df["final_prediction"]
    - df["price"]
)

df["audit_absolute_error"] = (
    df["audit_signed_error"]
    .abs()
)

df["audit_percentage_error"] = np.where(
    df["price"] > 0,
    df["audit_absolute_error"]
    / df["price"]
    * 100,
    np.nan,
)

df["audit_error_direction"] = np.select(
    [
        df["audit_signed_error"] < 0,
        df["audit_signed_error"] > 0,
    ],
    [
        "Underprediction",
        "Overprediction",
    ],
    default="Exact",
)

# ------------------------------------------------------------
# 2. Market segment
# Diagnostic segmentation only.
# ------------------------------------------------------------

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
        "£250k-£2m mainstream",
        "£2m-£5m luxury",
        "£5m+ ultra-luxury",
    ],
    right=False,
)

# ------------------------------------------------------------
# 3. Data-quality REVIEW flags
#
# These are review prompts, NOT deletion rules.
# A flagged record may still be a valid real property.
# ------------------------------------------------------------

flags = pd.Series(
    [[] for _ in range(len(df))],
    index=df.index,
    dtype=object,
)

if "tfarea" in df.columns:
    add_flag(
        flags,
        df["tfarea"].isna(),
        "missing_floor_area",
    )
    add_flag(
        flags,
        df["tfarea"] <= 10,
        "very_small_or_invalid_floor_area",
    )
    add_flag(
        flags,
        df["tfarea"] > 1000,
        "extreme_floor_area_review",
    )

rooms_col = first_existing(
    df,
    [
        "numberrooms",
        "numberrooms_filled",
    ],
)

if rooms_col:
    add_flag(
        flags,
        df[rooms_col].isna(),
        "missing_rooms",
    )
    add_flag(
        flags,
        df[rooms_col] <= 0,
        "nonpositive_rooms",
    )
    add_flag(
        flags,
        df[rooms_col] > 20,
        "extreme_room_count_review",
    )

for epc_col in [
    "CURRENT_ENERGY_EFFICIENCY",
    "POTENTIAL_ENERGY_EFFICIENCY",
]:
    if epc_col in df.columns:
        add_flag(
            flags,
            df[epc_col].notna()
            & (
                (df[epc_col] < 0)
                | (df[epc_col] > 100)
            ),
            f"{epc_col}_outside_0_100",
        )

if "postcode_sector" in df.columns:
    add_flag(
        flags,
        df["postcode_sector"]
        .fillna("UNKNOWN")
        .astype(str)
        .str.upper()
        .eq("UNKNOWN"),
        "unknown_postcode_sector",
    )

if "borough" in df.columns:
    add_flag(
        flags,
        df["borough"].isna()
        | df["borough"].astype(str).str.strip().eq(""),
        "missing_borough",
    )

add_flag(
    flags,
    df["price"] <= 10_000,
    "very_low_transaction_price_review",
)

df["audit_quality_flags"] = flags.apply(
    lambda xs: "; ".join(xs)
    if xs
    else ""
)

df["audit_has_quality_flag"] = (
    df["audit_quality_flags"] != ""
)

# ------------------------------------------------------------
# 4. Interpretive category
#
# This is deliberately conservative:
# it does not claim an outlier is definitely "bad data".
# ------------------------------------------------------------

def classify_row(row):
    if row["audit_has_quality_flag"]:
        return "Data-quality review needed"

    segment = str(row["audit_market_segment"])

    if "ultra-luxury" in segment:
        return "Likely luxury / missing-property-information candidate"

    if "luxury" in segment:
        return "Luxury-market candidate"

    return "Large error - inspect source record"


df["audit_review_category"] = df.apply(
    classify_row,
    axis=1,
)

# ------------------------------------------------------------
# 5. Rank the largest errors
# ------------------------------------------------------------

ranked = (
    df
    .sort_values(
        "audit_absolute_error",
        ascending=False,
    )
    .reset_index(drop=False)
    .rename(columns={"index": "source_row_index"})
)

ranked["audit_error_rank"] = (
    np.arange(len(ranked))
    + 1
)

preferred_columns = [
    "audit_error_rank",
    "source_row_index",
    "year",
    "price",
    "final_prediction",
    "audit_signed_error",
    "audit_absolute_error",
    "audit_percentage_error",
    "audit_error_direction",
    "audit_market_segment",
    "audit_review_category",
    "audit_quality_flags",
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
]

audit_columns = [
    c for c in preferred_columns
    if c in ranked.columns
]

for n in [20, 50, 100]:
    (
        ranked
        .head(n)[audit_columns]
        .to_csv(
            OUTPUT_FOLDER
            / f"top_{n}_extreme_residuals.csv",
            index=False,
        )
    )

# ------------------------------------------------------------
# 6. Summary tables
# ------------------------------------------------------------

summary_segment = (
    df
    .groupby(
        "audit_market_segment",
        observed=False,
    )
    .agg(
        rows=("price", "size"),
        mean_absolute_error=(
            "audit_absolute_error",
            "mean",
        ),
        median_absolute_error=(
            "audit_absolute_error",
            "median",
        ),
        mean_percentage_error=(
            "audit_percentage_error",
            "mean",
        ),
        underprediction_rate=(
            "audit_signed_error",
            lambda x: (x < 0).mean() * 100,
        ),
        quality_flag_rate=(
            "audit_has_quality_flag",
            lambda x: x.mean() * 100,
        ),
    )
    .reset_index()
)

summary_segment.to_csv(
    OUTPUT_FOLDER
    / "summary_by_market_segment.csv",
    index=False,
)

if "borough" in df.columns:
    summary_borough = (
        df
        .groupby("borough")
        .agg(
            rows=("price", "size"),
            mean_absolute_error=(
                "audit_absolute_error",
                "mean",
            ),
            median_absolute_error=(
                "audit_absolute_error",
                "median",
            ),
            underprediction_rate=(
                "audit_signed_error",
                lambda x: (x < 0).mean() * 100,
            ),
        )
        .sort_values(
            "mean_absolute_error",
            ascending=False,
        )
        .reset_index()
    )

    summary_borough.to_csv(
        OUTPUT_FOLDER
        / "summary_by_borough.csv",
        index=False,
    )

property_col = first_existing(
    df,
    [
        "property_name",
        "propertytype",
    ],
)

if property_col:
    summary_property = (
        df
        .groupby(property_col)
        .agg(
            rows=("price", "size"),
            mean_absolute_error=(
                "audit_absolute_error",
                "mean",
            ),
            median_absolute_error=(
                "audit_absolute_error",
                "median",
            ),
            underprediction_rate=(
                "audit_signed_error",
                lambda x: (x < 0).mean() * 100,
            ),
        )
        .sort_values(
            "mean_absolute_error",
            ascending=False,
        )
        .reset_index()
    )

    summary_property.to_csv(
        OUTPUT_FOLDER
        / "summary_by_property_type.csv",
        index=False,
    )

# ------------------------------------------------------------
# 7. Console preview
# ------------------------------------------------------------

preview_columns = [
    c for c in [
        "audit_error_rank",
        "year",
        "price",
        "final_prediction",
        "audit_absolute_error",
        "audit_percentage_error",
        "audit_error_direction",
        "audit_market_segment",
        "property_name",
        "borough",
        "postcode",
        "tfarea",
        "numberrooms_filled",
        "audit_review_category",
        "audit_quality_flags",
    ]
    if c in ranked.columns
]

print("\nTOP 20 EXTREME RESIDUALS")
print("-" * 90)
print(
    ranked
    .head(20)[preview_columns]
    .round(2)
    .to_string(index=False)
)

print("\nMARKET SEGMENT SUMMARY")
print("-" * 90)
print(
    summary_segment
    .round(2)
    .to_string(index=False)
)

print("\nSaved to:")
print(OUTPUT_FOLDER)

print("\nFiles created:")
for file in sorted(OUTPUT_FOLDER.glob("*.csv")):
    print("-", file.name)

print(
    "\nIMPORTANT: "
    "Do not delete or tune from these rows automatically. "
    "The next step is manual/source-data classification."
)
