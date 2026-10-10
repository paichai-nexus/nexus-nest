from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import (
    AnalysisResult,
    CompareRequest,
    CompareResult,
    PhysicalAnalysisResult,
    PhysicalSensorInput,
    RoomLayout,
    SystemAnalysisResult,
    SystemAnalyzeRequest,
)
from .physical_engine import analyze_physical
from .risk_engine import analyze
from .system_engine import analyze_system

BASE_DIR = Path(__file__).resolve().parents[3]
CONTRACTS_DIR = BASE_DIR / "contracts"
WEB_DIR = BASE_DIR / "web"

app = FastAPI(
    title="NEXUS NEST API",
    version="0.1.0",
    description="Kindergarten classroom spatial-safety risk-candidate API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "nexus-nest-api", "version": "0.1.0"}


@app.get("/api/v1/demo/room", response_model=RoomLayout)
def demo_room() -> RoomLayout:
    data = json.loads((CONTRACTS_DIR / "sample-room.json").read_text(encoding="utf-8"))
    return RoomLayout.model_validate(data)


@app.get("/api/v1/demo/proposed", response_model=RoomLayout)
def proposed_room() -> RoomLayout:
    data = json.loads(
        (CONTRACTS_DIR / "proposed-room.json").read_text(encoding="utf-8")
    )
    return RoomLayout.model_validate(data)


@app.post("/api/v1/analyze", response_model=AnalysisResult)
def analyze_room(layout: RoomLayout) -> AnalysisResult:
    return analyze(layout)


@app.post("/api/v1/compare", response_model=CompareResult)
def compare_layouts(payload: CompareRequest) -> CompareResult:
    current = analyze(payload.current)
    proposed = analyze(payload.proposed)
    return CompareResult(
        current=current,
        proposed=proposed,
        delta_total=proposed.summary["total"] - current.summary["total"],
        delta_high=proposed.summary["high"] - current.summary["high"],
    )



@app.post(
    "/api/v1/physical-twin/analyze",
    response_model=PhysicalAnalysisResult,
)
def analyze_physical_twin(
    sensors: PhysicalSensorInput,
) -> PhysicalAnalysisResult:
    return analyze_physical(sensors)



@app.post(
    "/api/v1/system/analyze",
    response_model=SystemAnalysisResult,
)
def analyze_nest_system(
    payload: SystemAnalyzeRequest,
) -> SystemAnalysisResult:
    return analyze_system(payload)


if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")
