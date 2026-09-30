from pathlib import Path
from typing import Optional
import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from predict_house import predict_house


PROJECT_FOLDER = Path(__file__).resolve().parent
METADATA_FILE = (
    PROJECT_FOLDER
    / "final_deployment_package"
    / "model_metadata.json"
)

with open(METADATA_FILE, "r", encoding="utf-8") as f:
    MODEL_METADATA = json.load(f)


app = FastAPI(
    title="London Housing Price Intelligence API",
    description=(
        "Final 2024-tested London residential property "
        "price prediction API."
    ),
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HousePredictionRequest(BaseModel):
    year: int = Field(..., examples=[2024])
    postcode: str = Field(..., examples=["E14 9GU"])
    borough: str = Field(..., examples=["Tower_Hamlets"])
    propertytype: str = Field(..., examples=["F"])
    duration: str = Field(..., examples=["L"])
    tfarea: float = Field(..., examples=[70])
    numberrooms: Optional[float] = Field(default=None, examples=[3])
    current_energy_efficiency: float = Field(..., examples=[72])
    potential_energy_efficiency: float = Field(..., examples=[82])
    construction_age_clean: str = Field(
        ...,
        examples=["2007 onwards"],
    )


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "London Housing Price Intelligence API",
        "version": "3.0.0",
        "model_version": MODEL_METADATA.get(
            "model_version",
            "3.0-final-2024-tested",
        ),
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_version": MODEL_METADATA.get("model_version"),
    }


@app.post("/predict")
def predict(request: HousePredictionRequest):
    try:
        result = predict_house(
            year=request.year,
            postcode=request.postcode,
            borough=request.borough,
            propertytype=request.propertytype,
            duration=request.duration,
            tfarea=request.tfarea,
            numberrooms=request.numberrooms,
            current_energy_efficiency=(
                request.current_energy_efficiency
            ),
            potential_energy_efficiency=(
                request.potential_energy_efficiency
            ),
            construction_age_clean=(
                request.construction_age_clean
            ),
        )

        return {
            "success": True,
            "prediction": result,
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    except Exception as e:
        print("Unexpected API error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Internal prediction error.",
        )


@app.get("/model-info")
def model_info():
    metrics = MODEL_METADATA.get(
        "2024_out_of_time_metrics",
        {},
    )

    router = MODEL_METADATA.get(
        "2024_router_metrics",
        {},
    )

    return {
        "model_version": MODEL_METADATA.get("model_version"),
        "architecture": MODEL_METADATA.get("architecture"),
        "training_period": MODEL_METADATA.get("training_period"),
        "historical_location_period": MODEL_METADATA.get(
            "historical_location_period"
        ),
        "independent_test_period": MODEL_METADATA.get(
            "independent_test_period"
        ),
        "luxury_definition_gbp": MODEL_METADATA.get(
            "luxury_definition_gbp"
        ),
        "router_threshold": MODEL_METADATA.get(
            "router_probability_threshold"
        ),
        "final_2024_test": {
            "rows": metrics.get("rows"),
            "MAE_GBP": metrics.get("mae_gbp"),
            "RMSE_GBP": metrics.get("rmse_gbp"),
            "R2": metrics.get("r2"),
            "median_percentage_error": metrics.get(
                "median_percentage_error"
            ),
            "within_10pct": metrics.get("within_10pct"),
            "within_20pct": metrics.get("within_20pct"),
            "within_30pct": metrics.get("within_30pct"),
        },
        "router_2024": {
            "precision_pct": router.get("precision_pct"),
            "recall_pct": router.get("recall_pct"),
            "routed_share_pct": router.get("routed_share_pct"),
        },
        "important_note": (
            "2024 metrics are historical out-of-time test results. "
            "They are not a guarantee of accuracy for an individual "
            "future property."
        ),
    }
