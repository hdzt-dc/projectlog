"""
End-to-end smoke test for the local London Housing Price Intelligence API.

Start the API first:
    python -m uvicorn api:app --reload

Then run:
    python end_to_end_smoke_test.py

Uses only Python's standard library.
"""
import json
from urllib import request, error

BASE = "http://127.0.0.1:8000"

def get(path):
    with request.urlopen(BASE + path, timeout=20) as r:
        return r.status, json.loads(r.read().decode("utf-8"))

def post(path, payload):
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        BASE + path,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def require(condition, message):
    if not condition:
        raise AssertionError(message)

print("1) Root endpoint")
status, body = get("/")
require(status == 200, f"Expected 200, got {status}")
print("   PASS")

print("2) Health endpoint")
status, body = get("/health")
require(status == 200, f"Expected 200, got {status}")
print("   PASS")

normal = {
    "year": 2023,
    "postcode": "E14 9GU",
    "borough": "Tower_Hamlets",
    "propertytype": "F",
    "duration": "L",
    "tfarea": 70,
    "numberrooms": 3,
    "current_energy_efficiency": 72,
    "potential_energy_efficiency": 82,
    "construction_age_clean": "2007 onwards",
}

print("3) Normal prediction")
status, body = post("/predict", normal)
require(status == 200, f"Expected 200, got {status}: {body}")

# Support either direct prediction output or {"success": true, "prediction": {...}}
result = body.get("prediction", body)
require(float(result["estimated_price"]) > 0, "Prediction must be positive")
require(result.get("model_used"), "model_used is missing")
require(result.get("reliability_status") is not None, "reliability_status is missing")
print("   PASS")
print("   Estimated:", result.get("estimated_price_formatted", result["estimated_price"]))

print("4) Missing-room handling")
missing_rooms = dict(normal)
missing_rooms["numberrooms"] = None
status, body = post("/predict", missing_rooms)
require(status == 200, f"Expected 200, got {status}: {body}")
result = body.get("prediction", body)
require(result.get("rooms_warning"), "Missing-room warning expected")
print("   PASS")

print("5) Invalid area should be rejected")
bad = dict(normal)
bad["tfarea"] = -10
status, body = post("/predict", bad)
require(status == 400, f"Expected 400, got {status}: {body}")
print("   PASS")

print("6) Invalid property type should be rejected")
bad = dict(normal)
bad["propertytype"] = "X"
status, body = post("/predict", bad)
require(status == 400, f"Expected 400, got {status}: {body}")
print("   PASS")

print("7) Future-year warning")
future = dict(normal)
future["year"] = 2026
status, body = post("/predict", future)
require(status == 200, f"Expected 200, got {status}: {body}")
result = body.get("prediction", body)
require(result.get("temporal_warning"), "Future-year temporal warning expected")
print("   PASS")

print("\nALL END-TO-END SMOKE TESTS PASSED")
