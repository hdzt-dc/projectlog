from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from predict_house import predict_house


# ============================================================
# 1. FastAPI App
# ============================================================

app = FastAPI(
    title="London Housing Price Intelligence API",
    description=(
        "Prediction API for the London Housing Price "
        "Intelligence Project."
    ),
    version="1.0.0",
)


# ============================================================
# 2. CORS
#
# 目前开发阶段先允许本地前端调用。
#
# 以后真正部署网站时，
# 再把 allow_origins 改成正式网站域名。
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 3. API Input Schema
# ============================================================

class HousePredictionRequest(BaseModel):

    year: int = Field(
        ...,
        examples=[2023],
        description="Prediction year",
    )

    postcode: str = Field(
        ...,
        examples=["E14 9GU"],
        description="UK postcode",
    )

    borough: str = Field(
        ...,
        examples=["Tower_Hamlets"],
        description="London borough",
    )

    propertytype: str = Field(
        ...,
        examples=["F"],
        description=(
            "F=Flat, T=Terraced, "
            "S=Semi-detached, D=Detached"
        ),
    )

    duration: str = Field(
        ...,
        examples=["L"],
        description="F=Freehold, L=Leasehold",
    )

    tfarea: float = Field(
        ...,
        examples=[70],
        description="Total floor area in square metres",
    )

    numberrooms: Optional[float] = Field(
        default=None,
        examples=[3],
        description=(
            "Number of rooms. "
            "Can be null if unavailable."
        ),
    )

    current_energy_efficiency: float = Field(
        ...,
        examples=[72],
        description="Current EPC efficiency score",
    )

    potential_energy_efficiency: float = Field(
        ...,
        examples=[82],
        description="Potential EPC efficiency score",
    )

    construction_age_clean: str = Field(
        ...,
        examples=["2007 onwards"],
        description="Construction age category",
    )


# ============================================================
# 4. Health Check
#
# 用来确认 API 是否启动成功。
# ============================================================

@app.get("/")
def root():

    return {
        "status": "ok",
        "service": (
            "London Housing Price "
            "Intelligence API"
        ),
        "version": "1.0.0",
    }


@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


# ============================================================
# 5. Prediction Endpoint
# ============================================================

@app.post("/predict")
def predict(
    request: HousePredictionRequest
):

    try:

        result = predict_house(

            year=request.year,

            postcode=request.postcode,

            borough=request.borough,

            propertytype=
                request.propertytype,

            duration=
                request.duration,

            tfarea=
                request.tfarea,

            numberrooms=
                request.numberrooms,

            current_energy_efficiency=
                request.current_energy_efficiency,

            potential_energy_efficiency=
                request.potential_energy_efficiency,

            construction_age_clean=
                request.construction_age_clean,
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

        print(
            "Unexpected API error:",
            repr(e)
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Internal prediction error."
            ),
        )


# ============================================================
# 6. Optional Metadata Endpoint
#
# 前端以后可以用它显示说明。
# ============================================================

@app.get("/model-info")
def model_info():

    return {
        "primary_model":
            "Enhanced Location HGB",

        "fallback_model":
            "Control HGB",

        "tested_period":
            "2022-2023",

        "training_period":
            "2011-2021",

        "main_market":
            "£250k-£2m",

        "final_test": {
            "MAE_GBP":
                133125,

            "RMSE_GBP":
                411840,

            "R2":
                0.8025,

            "median_percentage_error":
                12.28,
        },

        "important_note": (
            "Predictions outside the independently "
            "tested 2022-2023 period may have "
            "additional temporal uncertainty."
        ),
    }