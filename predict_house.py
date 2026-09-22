from pathlib import Path
from datetime import datetime

import joblib
import numpy as np
import pandas as pd


# ============================================================
# 1. 路径
# ============================================================

# Cloud/local compatible path:
# this file and final_deployment_package/ live in the same repository folder.
PROJECT_FOLDER = Path(__file__).resolve().parent

PACKAGE_FOLDER = (
    PROJECT_FOLDER
    / "final_deployment_package"
)


CONTROL_MODEL_FILE = (
    PACKAGE_FOLDER
    / "control_model.joblib"
)

ENHANCED_MODEL_FILE = (
    PACKAGE_FOLDER
    / "enhanced_model.joblib"
)

LOCATION_FILE = (
    PACKAGE_FOLDER
    / "location_statistics.joblib"
)

BASE_RELIABILITY_FILE = (
    PACKAGE_FOLDER
    / "base_reliability_lookup.csv"
)

LOCAL_RELIABILITY_FILE = (
    PACKAGE_FOLDER
    / "local_reliability_lookup.csv"
)


# ============================================================
# 2. 加载 Deployment Package
#
# 网站启动时加载一次。
# 不要每次预测重新加载。
# ============================================================

print("Loading deployment package...")

control_model = joblib.load(
    CONTROL_MODEL_FILE
)

enhanced_model = joblib.load(
    ENHANCED_MODEL_FILE
)

location_statistics = joblib.load(
    LOCATION_FILE
)

base_reliability = pd.read_csv(
    BASE_RELIABILITY_FILE
)

local_reliability = pd.read_csv(
    LOCAL_RELIABILITY_FILE
)

print("Deployment package loaded.")


# ============================================================
# 3. 名称映射
# ============================================================

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


# ============================================================
# 4. 固定模型特征
# ============================================================

BASE_NUMERIC_FEATURES = [
    "year",
    "tfarea",
    "numberrooms_filled",
    "rooms_missing",
    "CURRENT_ENERGY_EFFICIENCY",
    "POTENTIAL_ENERGY_EFFICIENCY",
]


ENHANCED_NUMERIC_FEATURES = (
    BASE_NUMERIC_FEATURES
    +
    [
        "sector_hist_median_price",
        "district_hist_median_price",
        "borough_hist_median_price",
        "location_hist_price",
        "sector_hist_count",
        "district_hist_count",
        "borough_hist_count",
    ]
)


CATEGORICAL_FEATURES = [
    "propertytype",
    "duration",
    "borough",
    "postcode_district",
    "construction_age_clean",
]


# ============================================================
# 5. 合法值
# ============================================================

VALID_PROPERTY_TYPES = {
    "F",
    "T",
    "S",
    "D",
}

VALID_DURATIONS = {
    "F",
    "L",
}


VALID_BOROUGHS = set(
    location_statistics[
        "borough_stats"
    ]["borough"]
    .dropna()
    .astype(str)
    .tolist()
)


VALID_CONSTRUCTION_AGES = {
    "1900-1929",
    "1930-1949",
    "1950-1966",
    "1967-1975",
    "1976-1982",
    "1983-1990",
    "1991-1995",
    "1996-2002",
    "2003-2006",
    "2007 onwards",
    "2007-2011",
    "2012 onwards",
    "Unknown",
    "before 1900",
}


# ============================================================
# 6. Postcode 清理
# ============================================================

def clean_postcode(postcode):

    if postcode is None:
        raise ValueError(
            "postcode cannot be empty."
        )

    postcode = (
        str(postcode)
        .strip()
        .upper()
    )

    if len(postcode) == 0:
        raise ValueError(
            "postcode cannot be empty."
        )

    return postcode


def extract_postcode_district(postcode):

    postcode = clean_postcode(
        postcode
    )

    parts = postcode.split()

    if len(parts) != 2:
        raise ValueError(
            "Postcode format should look like 'SW3 6AB'."
        )

    outward = parts[0]
    inward = parts[1]

    if (
        len(outward) == 0
        or
        len(inward) < 2
    ):
        raise ValueError(
            "Invalid postcode format."
        )

    return outward


def extract_postcode_sector(postcode):

    postcode = clean_postcode(
        postcode
    )

    parts = postcode.split()

    if len(parts) != 2:
        raise ValueError(
            "Postcode format should look like 'SW3 6AB'."
        )

    outward = parts[0]
    inward = parts[1]

    if (
        len(outward) == 0
        or
        len(inward) == 0
    ):
        raise ValueError(
            "Invalid postcode."
        )

    return (
        outward
        + " "
        + inward[0]
    )


# ============================================================
# 7. Location Lookup
# ============================================================

def get_location_features(
    postcode_district,
    postcode_sector,
    borough,
):

    sector_stats = (
        location_statistics[
            "sector_stats"
        ]
    )

    district_stats = (
        location_statistics[
            "district_stats"
        ]
    )

    borough_stats = (
        location_statistics[
            "borough_stats"
        ]
    )

    global_median = float(
        location_statistics[
            "global_median_price"
        ]
    )

    # --------------------------------------------------------
    # Sector
    # --------------------------------------------------------

    sector_match = (
        sector_stats[
            sector_stats[
                "postcode_sector"
            ]
            ==
            postcode_sector
        ]
    )

    sector_seen = (
        len(
            sector_match
        ) > 0
    )

    if sector_seen:

        sector_median = float(
            sector_match[
                "median_price"
            ].iloc[0]
        )

        sector_count = int(
            sector_match[
                "count"
            ].iloc[0]
        )

    else:

        sector_median = np.nan
        sector_count = 0

    # --------------------------------------------------------
    # District
    # --------------------------------------------------------

    district_match = (
        district_stats[
            district_stats[
                "postcode_district"
            ]
            ==
            postcode_district
        ]
    )

    if len(
        district_match
    ) > 0:

        district_median = float(
            district_match[
                "median_price"
            ].iloc[0]
        )

        district_count = int(
            district_match[
                "count"
            ].iloc[0]
        )

    else:

        district_median = np.nan
        district_count = 0

    # --------------------------------------------------------
    # Borough
    # --------------------------------------------------------

    borough_match = (
        borough_stats[
            borough_stats[
                "borough"
            ]
            ==
            borough
        ]
    )

    if len(
        borough_match
    ) > 0:

        borough_median = float(
            borough_match[
                "median_price"
            ].iloc[0]
        )

        borough_count = int(
            borough_match[
                "count"
            ].iloc[0]
        )

    else:

        borough_median = np.nan
        borough_count = 0

    # --------------------------------------------------------
    # Hierarchical fallback
    #
    # sector
    # -> district
    # -> borough
    # -> London global median
    # --------------------------------------------------------

    if not np.isnan(
        sector_median
    ):

        location_hist_price = (
            sector_median
        )

    elif not np.isnan(
        district_median
    ):

        location_hist_price = (
            district_median
        )

    elif not np.isnan(
        borough_median
    ):

        location_hist_price = (
            borough_median
        )

    else:

        location_hist_price = (
            global_median
        )

    # --------------------------------------------------------
    # 模型输入不能有 NaN
    # --------------------------------------------------------

    if np.isnan(
        sector_median
    ):

        sector_median = (
            location_hist_price
        )

    if np.isnan(
        district_median
    ):

        if not np.isnan(
            borough_median
        ):

            district_median = (
                borough_median
            )

        else:

            district_median = (
                location_hist_price
            )

    if np.isnan(
        borough_median
    ):

        borough_median = (
            location_hist_price
        )

    return {
        "sector_seen":
            sector_seen,

        "sector_hist_median_price":
            sector_median,

        "sector_hist_count":
            sector_count,

        "district_hist_median_price":
            district_median,

        "district_hist_count":
            district_count,

        "borough_hist_median_price":
            borough_median,

        "borough_hist_count":
            borough_count,

        "location_hist_price":
            location_hist_price,
    }


# ============================================================
# 8. 预测价格段
# ============================================================

def prediction_price_band(
    prediction
):

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


# ============================================================
# 9. Reliability Lookup
# ============================================================

def get_reliability(
    property_name,
    predicted_band,
    borough,
    sector_seen,
):

    # --------------------------------------------------------
    # Unseen postcode sector
    # --------------------------------------------------------

    if not sector_seen:

        return {
            "grade":
                None,

            "evidence":
                "Very Low",

            "status":
                "Insufficient local evidence",

            "source":
                "Unseen postcode sector fallback",
        }

    # --------------------------------------------------------
    # 优先使用 Local Reliability
    # --------------------------------------------------------

    local_match = (
        local_reliability[
            (
                local_reliability[
                    "property_name"
                ]
                ==
                property_name
            )
            &
            (
                local_reliability[
                    "enhanced_predicted_price_band"
                ]
                ==
                predicted_band
            )
            &
            (
                local_reliability[
                    "borough"
                ]
                ==
                borough
            )
        ]
    )

    if len(
        local_match
    ) > 0:

        row = (
            local_match.iloc[0]
        )

        return {
            "grade":
                row[
                    "final_grade"
                ],

            "evidence":
                row[
                    "final_evidence"
                ],

            "status":
                row[
                    "final_status"
                ],

            "source":
                "Local reliability",
        }

    # --------------------------------------------------------
    # 找不到 local 时回退 Base
    # --------------------------------------------------------

    base_match = (
        base_reliability[
            (
                base_reliability[
                    "property_name"
                ]
                ==
                property_name
            )
            &
            (
                base_reliability[
                    "enhanced_predicted_price_band"
                ]
                ==
                predicted_band
            )
        ]
    )

    if len(
        base_match
    ) > 0:

        row = (
            base_match.iloc[0]
        )

        return {
            "grade":
                row[
                    "predictability_grade"
                ],

            "evidence":
                row[
                    "evidence_strength"
                ],

            "status":
                row[
                    "deployment_status"
                ],

            "source":
                "Base reliability fallback",
        }

    # --------------------------------------------------------
    # 完全找不到
    # --------------------------------------------------------

    return {
        "grade":
            None,

        "evidence":
            "Very Low",

        "status":
            "Insufficient evidence",

        "source":
            "No reliability segment found",
    }


# ============================================================
# 10. 输入检查
# ============================================================

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

    current_year = (
        datetime.now().year
    )

    # --------------------------------------------------------
    # Year
    # --------------------------------------------------------

    if not isinstance(
        year,
        (int, np.integer)
    ):
        raise ValueError(
            "year must be an integer."
        )

    if year < 1900:
        raise ValueError(
            "year is invalid."
        )

    if year > (
        current_year + 1
    ):
        raise ValueError(
            "year is too far in the future."
        )

    # --------------------------------------------------------
    # Postcode
    # --------------------------------------------------------

    clean_postcode(
        postcode
    )

    # --------------------------------------------------------
    # Property Type
    # --------------------------------------------------------

    if propertytype not in (
        VALID_PROPERTY_TYPES
    ):

        raise ValueError(
            "propertytype must be "
            "F, T, S or D."
        )

    # --------------------------------------------------------
    # Duration
    # --------------------------------------------------------

    if duration not in (
        VALID_DURATIONS
    ):

        raise ValueError(
            "duration must be "
            "F or L."
        )

    # --------------------------------------------------------
    # Borough
    # --------------------------------------------------------

    if borough not in (
        VALID_BOROUGHS
    ):

        raise ValueError(
            f"Unknown borough: {borough}"
        )

    # --------------------------------------------------------
    # Construction Age
    # --------------------------------------------------------

    if (
        construction_age_clean
        not in
        VALID_CONSTRUCTION_AGES
    ):

        raise ValueError(
            "Unknown construction age category: "
            f"{construction_age_clean}"
        )

    # --------------------------------------------------------
    # Area
    # --------------------------------------------------------

    if tfarea is None:
        raise ValueError(
            "tfarea cannot be empty."
        )

    if not isinstance(
        tfarea,
        (int, float, np.integer, np.floating)
    ):
        raise ValueError(
            "tfarea must be numeric."
        )

    if tfarea <= 0:
        raise ValueError(
            "tfarea must be greater than 0."
        )

    # --------------------------------------------------------
    # Rooms
    # --------------------------------------------------------

    if numberrooms is not None:

        if not isinstance(
            numberrooms,
            (
                int,
                float,
                np.integer,
                np.floating,
            )
        ):
            raise ValueError(
                "numberrooms must be numeric or None."
            )

        if numberrooms < 0:
            raise ValueError(
                "numberrooms cannot be negative."
            )

    # --------------------------------------------------------
    # Energy Efficiency
    # --------------------------------------------------------

    if not isinstance(
        current_energy_efficiency,
        (
            int,
            float,
            np.integer,
            np.floating,
        )
    ):
        raise ValueError(
            "current energy efficiency "
            "must be numeric."
        )

    if not (
        0
        <=
        current_energy_efficiency
        <=
        100
    ):
        raise ValueError(
            "current energy efficiency "
            "must be between 0 and 100."
        )

    if not isinstance(
        potential_energy_efficiency,
        (
            int,
            float,
            np.integer,
            np.floating,
        )
    ):
        raise ValueError(
            "potential energy efficiency "
            "must be numeric."
        )

    if not (
        0
        <=
        potential_energy_efficiency
        <=
        100
    ):
        raise ValueError(
            "potential energy efficiency "
            "must be between 0 and 100."
        )


# ============================================================
# 11. 主预测函数
# ============================================================

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

    # --------------------------------------------------------
    # 输入检查
    # --------------------------------------------------------

    validate_inputs(
        year=year,
        postcode=postcode,
        propertytype=propertytype,
        duration=duration,
        borough=borough,
        tfarea=tfarea,
        numberrooms=numberrooms,
        current_energy_efficiency=
            current_energy_efficiency,
        potential_energy_efficiency=
            potential_energy_efficiency,
        construction_age_clean=
            construction_age_clean,
    )

    # --------------------------------------------------------
    # Postcode
    # --------------------------------------------------------

    postcode = clean_postcode(
        postcode
    )

    postcode_district = (
        extract_postcode_district(
            postcode
        )
    )

    postcode_sector = (
        extract_postcode_sector(
            postcode
        )
    )

    # --------------------------------------------------------
    # Historical location features
    # --------------------------------------------------------

    location = (
        get_location_features(
            postcode_district=
                postcode_district,

            postcode_sector=
                postcode_sector,

            borough=
                borough,
        )
    )

    # --------------------------------------------------------
    # Rooms
    #
    # 训练阶段：
    # missing rooms -> median = 4.0
    #
    # 同时 rooms_missing = 1
    # --------------------------------------------------------

    if numberrooms is None:

        rooms_missing = 1

        numberrooms_filled = 4.0

    else:

        rooms_missing = 0

        numberrooms_filled = float(
            numberrooms
        )

    # --------------------------------------------------------
    # 构造模型输入
    # --------------------------------------------------------

    row = pd.DataFrame(
        [
            {
                "year":
                    int(
                        year
                    ),

                "tfarea":
                    float(
                        tfarea
                    ),

                "numberrooms_filled":
                    numberrooms_filled,

                "rooms_missing":
                    rooms_missing,

                "CURRENT_ENERGY_EFFICIENCY":
                    float(
                        current_energy_efficiency
                    ),

                "POTENTIAL_ENERGY_EFFICIENCY":
                    float(
                        potential_energy_efficiency
                    ),

                "propertytype":
                    propertytype,

                "duration":
                    duration,

                "borough":
                    borough,

                "postcode_district":
                    postcode_district,

                "construction_age_clean":
                    construction_age_clean,

                "sector_hist_median_price":
                    location[
                        "sector_hist_median_price"
                    ],

                "district_hist_median_price":
                    location[
                        "district_hist_median_price"
                    ],

                "borough_hist_median_price":
                    location[
                        "borough_hist_median_price"
                    ],

                "location_hist_price":
                    location[
                        "location_hist_price"
                    ],

                "sector_hist_count":
                    location[
                        "sector_hist_count"
                    ],

                "district_hist_count":
                    location[
                        "district_hist_count"
                    ],

                "borough_hist_count":
                    location[
                        "borough_hist_count"
                    ],
            }
        ]
    )

    # --------------------------------------------------------
    # Control prediction
    # --------------------------------------------------------

    control_input = (
        row[
            BASE_NUMERIC_FEATURES
            +
            CATEGORICAL_FEATURES
        ]
    )

    control_prediction = float(
        control_model.predict(
            control_input
        )[0]
    )

    # --------------------------------------------------------
    # Enhanced prediction
    # --------------------------------------------------------

    enhanced_input = (
        row[
            ENHANCED_NUMERIC_FEATURES
            +
            CATEGORICAL_FEATURES
        ]
    )

    enhanced_prediction = float(
        enhanced_model.predict(
            enhanced_input
        )[0]
    )

    # --------------------------------------------------------
    # Frozen deployment rule
    #
    # Seen sector:
    # Enhanced
    #
    # Unseen sector:
    # Control fallback
    # --------------------------------------------------------

    if location[
        "sector_seen"
    ]:

        final_prediction = (
            enhanced_prediction
        )

        model_used = (
            "Enhanced Location HGB"
        )

    else:

        final_prediction = (
            control_prediction
        )

        model_used = (
            "Control HGB fallback"
        )

    # --------------------------------------------------------
    # Reliability
    # --------------------------------------------------------

    property_name = (
        PROPERTY_NAME_MAP[
            propertytype
        ]
    )

    predicted_band = (
        prediction_price_band(
            enhanced_prediction
        )
    )

    reliability = (
        get_reliability(
            property_name=
                property_name,

            predicted_band=
                predicted_band,

            borough=
                borough,

            sector_seen=
                location[
                    "sector_seen"
                ],
        )
    )

    # --------------------------------------------------------
    # 时间风险
    # --------------------------------------------------------

    if year > 2023:

        temporal_warning = (
            "Prediction year is outside the "
            "independently tested 2022-2023 period. "
            "Market drift may increase uncertainty."
        )

    else:

        temporal_warning = None

    # --------------------------------------------------------
    # 主市场范围风险
    # --------------------------------------------------------

    if (
        final_prediction < 250_000
        or
        final_prediction >= 2_000_000
    ):

        market_warning = (
            "Prediction is outside the model's "
            "main £250k-£2m market range, where "
            "historical error was higher."
        )

    else:

        market_warning = None

    # --------------------------------------------------------
    # Missing Rooms warning
    # --------------------------------------------------------

    if numberrooms is None:

        rooms_warning = (
            "Number of rooms was missing. "
            "The training median value 4.0 was used, "
            "and the missing-room indicator was activated."
        )

    else:

        rooms_warning = None

    # --------------------------------------------------------
    # 输出
    # --------------------------------------------------------

    return {
        "estimated_price":
            round(
                final_prediction,
                2
            ),

        "estimated_price_formatted":
            (
                f"£{final_prediction:,.0f}"
            ),

        "model_used":
            model_used,

        "control_prediction":
            round(
                control_prediction,
                2
            ),

        "enhanced_prediction":
            round(
                enhanced_prediction,
                2
            ),

        "property_type":
            property_name,

        "duration":
            DURATION_NAME_MAP[
                duration
            ],

        "borough":
            borough,

        "postcode":
            postcode,

        "postcode_district":
            postcode_district,

        "postcode_sector":
            postcode_sector,

        "sector_seen_before":
            location[
                "sector_seen"
            ],

        "sector_historical_count":
            location[
                "sector_hist_count"
            ],

        "district_historical_count":
            location[
                "district_hist_count"
            ],

        "borough_historical_count":
            location[
                "borough_hist_count"
            ],

        "predicted_price_band":
            predicted_band,

        "reliability_grade":
            reliability[
                "grade"
            ],

        "evidence_strength":
            reliability[
                "evidence"
            ],

        "reliability_status":
            reliability[
                "status"
            ],

        "reliability_source":
            reliability[
                "source"
            ],

        "temporal_warning":
            temporal_warning,

        "market_warning":
            market_warning,

        "rooms_warning":
            rooms_warning,
    }


# ============================================================
# 12. Demo
# ============================================================

if __name__ == "__main__":

    result = predict_house(

        year=2023,

        postcode="SW3 6AB",

        borough=
            "Kensington_and_Chelsea",

        propertytype="F",

        duration="L",

        tfarea=85,

        numberrooms=4,

        current_energy_efficiency=70,

        potential_energy_efficiency=82,

        construction_age_clean=
            "1996-2002",
    )

    print("\n" + "=" * 70)
    print("PREDICTION RESULT")
    print("=" * 70)

    for key, value in (
        result.items()
    ):

        print(
            f"{key}: {value}"
        )