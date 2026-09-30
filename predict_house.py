from pathlib import Path
from datetime import datetime
import json

import joblib
import numpy as np
import pandas as pd


PROJECT_FOLDER = Path(__file__).resolve().parent
PACKAGE_FOLDER = PROJECT_FOLDER / "final_deployment_package"

UNIFIED_MODEL_FILE = PACKAGE_FOLDER / "unified_model.joblib"
SPECIALIST_MODEL_FILE = PACKAGE_FOLDER / "luxury_specialist_model.joblib"
ROUTER_MODEL_FILE = PACKAGE_FOLDER / "router_model.joblib"
LOCATION_FILE = PACKAGE_FOLDER / "location_statistics.joblib"
BASE_RELIABILITY_FILE = PACKAGE_FOLDER / "base_reliability_lookup.csv"
LOCAL_RELIABILITY_FILE = PACKAGE_FOLDER / "local_reliability_lookup.csv"
METADATA_FILE = PACKAGE_FOLDER / "model_metadata.json"
ALLOWED_VALUES_FILE = PACKAGE_FOLDER / "allowed_values.json"

print("Loading final 2024-tested deployment package...")

unified_model = joblib.load(UNIFIED_MODEL_FILE)
specialist_model = joblib.load(SPECIALIST_MODEL_FILE)
router_model = joblib.load(ROUTER_MODEL_FILE)
location_statistics = joblib.load(LOCATION_FILE)
base_reliability = pd.read_csv(BASE_RELIABILITY_FILE)
local_reliability = pd.read_csv(LOCAL_RELIABILITY_FILE)

with open(METADATA_FILE, "r", encoding="utf-8") as f:
    model_metadata = json.load(f)

with open(ALLOWED_VALUES_FILE, "r", encoding="utf-8") as f:
    allowed_values = json.load(f)

print("Final deployment package loaded.")

PROPERTY_NAME_MAP = {
    "F": "Flat",
    "T": "Terraced",
    "S": "Semi-detached",
    "D": "Detached",
}

DURATION_NAME_MAP = {
    "F": "Freehold",
    "L": "Leasehold",
}

BASE_NUMERIC_FEATURES = [
    "year",
    "tfarea",
    "numberrooms_filled",
    "rooms_missing",
    "CURRENT_ENERGY_EFFICIENCY",
    "POTENTIAL_ENERGY_EFFICIENCY",
]

LOCATION_FEATURES = [
    "sector_hist_median_price",
    "district_hist_median_price",
    "borough_hist_median_price",
    "location_hist_price",
    "sector_hist_count",
    "district_hist_count",
    "borough_hist_count",
]

ENHANCED_NUMERIC_FEATURES = BASE_NUMERIC_FEATURES + LOCATION_FEATURES

CATEGORICAL_FEATURES = [
    "propertytype",
    "duration",
    "borough",
    "postcode_district",
    "construction_age_clean",
]

ROUTER_NUMERIC_FEATURES = [
    "unified_prediction",
    "tfarea",
    "numberrooms_filled",
    "rooms_missing",
    "CURRENT_ENERGY_EFFICIENCY",
    "POTENTIAL_ENERGY_EFFICIENCY",
    "sector_hist_median_price",
    "sector_hist_count",
    "district_hist_median_price",
    "district_hist_count",
    "borough_hist_median_price",
    "borough_hist_count",
    "location_hist_price",
]

ROUTER_CATEGORICAL_FEATURES = [
    "propertytype",
    "duration",
    "borough",
    "postcode_district",
    "construction_age_clean",
]

ROUTER_FEATURES = ROUTER_NUMERIC_FEATURES + ROUTER_CATEGORICAL_FEATURES
ROUTER_THRESHOLD = float(model_metadata.get("router_probability_threshold", 0.90))

VALID_PROPERTY_TYPES = set(allowed_values.get("propertytype", ["F", "T", "S", "D"]))
VALID_DURATIONS = set(allowed_values.get("duration", ["F", "L"]))
VALID_BOROUGHS = set(allowed_values.get("borough", []))
VALID_CONSTRUCTION_AGES = set(allowed_values.get("construction_age_clean", []))


def clean_postcode(postcode):
    if postcode is None:
        raise ValueError("postcode cannot be empty.")
    postcode = str(postcode).strip().upper()
    if not postcode:
        raise ValueError("postcode cannot be empty.")
    return postcode


def extract_postcode_district(postcode):
    postcode = clean_postcode(postcode)
    parts = postcode.split()
    if len(parts) != 2 or not parts[0] or len(parts[1]) < 2:
        raise ValueError("Postcode format should look like 'SW3 6AB'.")
    return parts[0]


def extract_postcode_sector(postcode):
    postcode = clean_postcode(postcode)
    parts = postcode.split()
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("Postcode format should look like 'SW3 6AB'.")
    return parts[0] + " " + parts[1][0]


def lookup_stat(table, key, median_col, count_col):
    if key in table.index:
        row = table.loc[key]
        if isinstance(row, pd.DataFrame):
            row = row.iloc[0]
        return float(row[median_col]), int(row[count_col]), True

    for key_col in ["postcode_sector", "postcode_district", "borough"]:
        if key_col in table.columns:
            match = table[table[key_col].astype(str) == str(key)]
            if len(match):
                row = match.iloc[0]
                return float(row[median_col]), int(row[count_col]), True

    return np.nan, 0, False


def get_location_features(postcode_district, postcode_sector, borough):
    sector_stats = location_statistics["sector_stats"]
    district_stats = location_statistics["district_stats"]
    borough_stats = location_statistics["borough_stats"]
    global_median = float(location_statistics["global_median_price"])

    sector_median, sector_count, sector_seen = lookup_stat(
        sector_stats, postcode_sector,
        "sector_hist_median_price", "sector_hist_count"
    )
    district_median, district_count, district_seen = lookup_stat(
        district_stats, postcode_district,
        "district_hist_median_price", "district_hist_count"
    )
    borough_median, borough_count, borough_seen = lookup_stat(
        borough_stats, borough,
        "borough_hist_median_price", "borough_hist_count"
    )

    if sector_seen:
        location_hist_price = sector_median
    elif district_seen:
        location_hist_price = district_median
    elif borough_seen:
        location_hist_price = borough_median
    else:
        location_hist_price = global_median

    if not sector_seen:
        sector_median = location_hist_price
    if not district_seen:
        district_median = borough_median if borough_seen else location_hist_price
    if not borough_seen:
        borough_median = location_hist_price

    return {
        "sector_seen": sector_seen,
        "sector_hist_median_price": float(sector_median),
        "sector_hist_count": int(sector_count),
        "district_hist_median_price": float(district_median),
        "district_hist_count": int(district_count),
        "borough_hist_median_price": float(borough_median),
        "borough_hist_count": int(borough_count),
        "location_hist_price": float(location_hist_price),
    }


def prediction_price_band(prediction):
    if prediction < 250_000:
        return "<250k"
    if prediction < 500_000:
        return "250k-500k"
    if prediction < 750_000:
        return "500k-750k"
    if prediction < 1_000_000:
        return "750k-1m"
    if prediction < 1_500_000:
        return "1m-1.5m"
    if prediction < 2_000_000:
        return "1.5m-2m"
    if prediction < 3_000_000:
        return "2m-3m"
    if prediction < 5_000_000:
        return "3m-5m"
    return "5m+"


def get_reliability(property_name, predicted_band, borough, sector_seen):
    if not sector_seen:
        return {
            "grade": None,
            "evidence": "Very Low",
            "status": "Insufficient local evidence",
            "source": "Unseen postcode sector",
        }

    local_match = local_reliability[
        (local_reliability["property_name"] == property_name)
        & (local_reliability["enhanced_predicted_price_band"] == predicted_band)
        & (local_reliability["borough"] == borough)
    ]

    if len(local_match):
        row = local_match.iloc[0]
        return {
            "grade": row["final_grade"],
            "evidence": row["final_evidence"],
            "status": row["final_status"],
            "source": "Local reliability lookup",
        }

    base_match = base_reliability[
        (base_reliability["property_name"] == property_name)
        & (base_reliability["enhanced_predicted_price_band"] == predicted_band)
    ]

    if len(base_match):
        row = base_match.iloc[0]
        return {
            "grade": row["predictability_grade"],
            "evidence": row["evidence_strength"],
            "status": row["deployment_status"],
            "source": "Base reliability lookup",
        }

    return {
        "grade": None,
        "evidence": "Very Low",
        "status": "Insufficient evidence",
        "source": "No reliability segment found",
    }


def validate_inputs(
    year,
    postcode,
    propertytype,
    duration,
    borough,
    tfarea,
    numberrooms,
    current_energy_efficiency,
    potential_energy_efficiency,
    construction_age_clean,
):
    current_year = datetime.now().year

    if not isinstance(year, (int, np.integer)):
        raise ValueError("year must be an integer.")
    if year < 1900 or year > current_year + 1:
        raise ValueError("year is invalid.")

    clean_postcode(postcode)

    if propertytype not in VALID_PROPERTY_TYPES:
        raise ValueError("propertytype must be F, T, S or D.")
    if duration not in VALID_DURATIONS:
        raise ValueError("duration must be F or L.")
    if VALID_BOROUGHS and borough not in VALID_BOROUGHS:
        raise ValueError(f"Unknown borough: {borough}")
    if VALID_CONSTRUCTION_AGES and construction_age_clean not in VALID_CONSTRUCTION_AGES:
        raise ValueError(
            "Unknown construction age category: "
            f"{construction_age_clean}"
        )

    if tfarea is None or not isinstance(
        tfarea, (int, float, np.integer, np.floating)
    ):
        raise ValueError("tfarea must be numeric.")
    if tfarea <= 0:
        raise ValueError("tfarea must be greater than 0.")

    if numberrooms is not None:
        if not isinstance(
            numberrooms, (int, float, np.integer, np.floating)
        ):
            raise ValueError("numberrooms must be numeric or None.")
        if numberrooms < 0:
            raise ValueError("numberrooms cannot be negative.")

    for name, value in [
        ("current energy efficiency", current_energy_efficiency),
        ("potential energy efficiency", potential_energy_efficiency),
    ]:
        if not isinstance(value, (int, float, np.integer, np.floating)):
            raise ValueError(f"{name} must be numeric.")
        if not 0 <= value <= 100:
            raise ValueError(f"{name} must be between 0 and 100.")


def get_historical_accuracy():
    metrics = model_metadata.get("2024_out_of_time_metrics", {})
    return {
        "test_period": model_metadata.get("independent_test_period", "2024"),
        "test_rows": metrics.get("rows"),
        "mae_gbp": metrics.get("mae_gbp"),
        "rmse_gbp": metrics.get("rmse_gbp"),
        "r2": metrics.get("r2"),
        "median_percentage_error": metrics.get("median_percentage_error"),
        "within_10pct": metrics.get("within_10pct"),
        "within_20pct": metrics.get("within_20pct"),
        "within_30pct": metrics.get("within_30pct"),
        "note": (
            "Historical out-of-time test performance; "
            "not a probability guarantee for this individual property."
        ),
    }


def predict_house(
    year,
    postcode,
    borough,
    propertytype,
    duration,
    tfarea,
    numberrooms,
    current_energy_efficiency,
    potential_energy_efficiency,
    construction_age_clean,
):
    validate_inputs(
        year=year,
        postcode=postcode,
        propertytype=propertytype,
        duration=duration,
        borough=borough,
        tfarea=tfarea,
        numberrooms=numberrooms,
        current_energy_efficiency=current_energy_efficiency,
        potential_energy_efficiency=potential_energy_efficiency,
        construction_age_clean=construction_age_clean,
    )

    postcode = clean_postcode(postcode)
    postcode_district = extract_postcode_district(postcode)
    postcode_sector = extract_postcode_sector(postcode)

    location = get_location_features(
        postcode_district=postcode_district,
        postcode_sector=postcode_sector,
        borough=borough,
    )

    if numberrooms is None:
        rooms_missing = 1
        numberrooms_filled = 4.0
    else:
        rooms_missing = 0
        numberrooms_filled = float(numberrooms)

    row = pd.DataFrame([{
        "year": int(year),
        "tfarea": float(tfarea),
        "numberrooms_filled": numberrooms_filled,
        "rooms_missing": rooms_missing,
        "CURRENT_ENERGY_EFFICIENCY": float(current_energy_efficiency),
        "POTENTIAL_ENERGY_EFFICIENCY": float(potential_energy_efficiency),
        "propertytype": propertytype,
        "duration": duration,
        "borough": borough,
        "postcode_district": postcode_district,
        "construction_age_clean": construction_age_clean,
        "sector_hist_median_price": location["sector_hist_median_price"],
        "district_hist_median_price": location["district_hist_median_price"],
        "borough_hist_median_price": location["borough_hist_median_price"],
        "location_hist_price": location["location_hist_price"],
        "sector_hist_count": location["sector_hist_count"],
        "district_hist_count": location["district_hist_count"],
        "borough_hist_count": location["borough_hist_count"],
    }])

    model_input = row[
        ENHANCED_NUMERIC_FEATURES + CATEGORICAL_FEATURES
    ]

    unified_prediction = float(
        unified_model.predict(model_input)[0]
    )

    specialist_prediction = float(
        specialist_model.predict(model_input)[0]
    )

    router_row = row.copy()
    router_row["unified_prediction"] = unified_prediction

    router_probability = float(
        router_model.predict_proba(
            router_row[ROUTER_FEATURES]
        )[0, 1]
    )

    routed_to_specialist = router_probability >= ROUTER_THRESHOLD

    if routed_to_specialist:
        final_prediction = specialist_prediction
        model_used = "Luxury Specialist HGB"
    else:
        final_prediction = unified_prediction
        model_used = "Unified Enhanced HGB"

    property_name = PROPERTY_NAME_MAP[propertytype]
    predicted_band = prediction_price_band(final_prediction)

    reliability = get_reliability(
        property_name=property_name,
        predicted_band=predicted_band,
        borough=borough,
        sector_seen=location["sector_seen"],
    )

    temporal_warning = None
    if year > 2024:
        temporal_warning = (
            "Prediction year is outside the independently tested "
            "2024 period. Market drift may increase uncertainty."
        )

    market_warning = None
    if final_prediction < 250_000 or final_prediction >= 2_000_000:
        market_warning = (
            "Prediction is outside the main £250k-£2m market, "
            "where historical errors were higher."
        )

    luxury_warning = None
    if routed_to_specialist:
        luxury_warning = (
            "The learned router assigned this property to the luxury "
            "specialist. High-end London property remains materially "
            "more uncertain than the mainstream market."
        )

    rooms_warning = None
    if numberrooms is None:
        rooms_warning = (
            "Number of rooms was missing. The fixed historical median "
            "4.0 was used together with the missing-room indicator."
        )

    return {
        "estimated_price": round(final_prediction, 2),
        "estimated_price_formatted": f"£{final_prediction:,.0f}",
        "model_used": model_used,
        "unified_prediction": round(unified_prediction, 2),
        "luxury_specialist_prediction": round(specialist_prediction, 2),
        "router_probability": round(router_probability, 6),
        "router_probability_pct": round(router_probability * 100, 2),
        "router_threshold": ROUTER_THRESHOLD,
        "routed_to_specialist": bool(routed_to_specialist),
        "property_type": property_name,
        "duration": DURATION_NAME_MAP[duration],
        "borough": borough,
        "postcode": postcode,
        "postcode_district": postcode_district,
        "postcode_sector": postcode_sector,
        "sector_seen_before": bool(location["sector_seen"]),
        "sector_historical_count": int(location["sector_hist_count"]),
        "district_historical_count": int(location["district_hist_count"]),
        "borough_historical_count": int(location["borough_hist_count"]),
        "predicted_price_band": predicted_band,
        "reliability_grade": reliability["grade"],
        "evidence_strength": reliability["evidence"],
        "reliability_status": reliability["status"],
        "reliability_source": reliability["source"],
        "historical_accuracy": get_historical_accuracy(),
        "temporal_warning": temporal_warning,
        "market_warning": market_warning,
        "luxury_warning": luxury_warning,
        "rooms_warning": rooms_warning,
    }


if __name__ == "__main__":
    result = predict_house(
        year=2024,
        postcode="SW3 6AB",
        borough="Kensington_and_Chelsea",
        propertytype="F",
        duration="L",
        tfarea=85,
        numberrooms=4,
        current_energy_efficiency=70,
        potential_energy_efficiency=82,
        construction_age_clean="1996-2002",
    )

    for key, value in result.items():
        print(f"{key}: {value}")
