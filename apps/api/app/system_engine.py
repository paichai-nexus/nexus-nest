from __future__ import annotations

from .models import (
    PhysicalRiskType,
    RiskType,
    Severity,
    SystemAnalysisResult,
    SystemAnalyzeRequest,
    SystemFeatureStatus,
)
from .physical_engine import analyze_physical, build_device_command
from .risk_engine import analyze


SEVERITY_RANK = {
    Severity.LOW: 1,
    Severity.MEDIUM: 2,
    Severity.HIGH: 3,
}


def _highest_severity(risks):
    if not risks:
        return None

    return max(
        (risk.severity for risk in risks),
        key=lambda severity: SEVERITY_RANK[severity],
    )


def _feature(
    key: str,
    label: str,
    spatial_risks=None,
    sensor_risks=None,
) -> SystemFeatureStatus:
    spatial_risks = spatial_risks or []
    sensor_risks = sensor_risks or []

    all_risks = [*spatial_risks, *sensor_risks]

    sources = []
    if spatial_risks:
        sources.append("spatial")
    if sensor_risks:
        sources.append("sensor")

    return SystemFeatureStatus(
        key=key,
        label=label,
        active=bool(all_risks),
        severity=_highest_severity(all_risks),
        sources=sources,
        related_risk_ids=[risk.id for risk in all_risks],
    )


def analyze_system(
    payload: SystemAnalyzeRequest,
) -> SystemAnalysisResult:
    spatial = analyze(payload.layout)
    physical = analyze_physical(payload.sensors)

    movement = [
        risk
        for risk in spatial.risks
        if risk.type == RiskType.MOVEMENT
    ]
    evacuation = [
        risk
        for risk in spatial.risks
        if risk.type == RiskType.EVACUATION
    ]
    blind_spot = [
        risk
        for risk in spatial.risks
        if risk.type == RiskType.BLIND_SPOT
    ]
    collision = [
        risk
        for risk in spatial.risks
        if risk.type == RiskType.COLLISION
    ]

    sensor_passage = [
        risk
        for risk in physical.risks
        if risk.type == PhysicalRiskType.PASSAGE
    ]
    low_light = [
        risk
        for risk in physical.risks
        if risk.type == PhysicalRiskType.LOW_LIGHT
    ]
    wet_floor = [
        risk
        for risk in physical.risks
        if risk.type == PhysicalRiskType.WET_FLOOR
    ]

    # Passage is one NEST feature.
    # Spatial geometry and ultrasonic measurement are fused here.
    features = [
        _feature(
            key="passage",
            label="통로 안전",
            spatial_risks=movement,
            sensor_risks=sensor_passage,
        ),
        _feature(
            key="evacuation",
            label="출입구 안전",
            spatial_risks=evacuation,
        ),
        _feature(
            key="blind_spot",
            label="교사 시야 사각",
            spatial_risks=blind_spot,
        ),
        _feature(
            key="collision",
            label="가구 충돌 위험",
            spatial_risks=collision,
        ),
        _feature(
            key="low_light",
            label="저조도 위험",
            sensor_risks=low_light,
        ),
        _feature(
            key="wet_floor",
            label="바닥 습윤 위험",
            sensor_risks=wet_floor,
        ),
    ]

    active = [feature for feature in features if feature.active]

    high = sum(
        feature.severity == Severity.HIGH
        for feature in active
    )
    medium = sum(
        feature.severity == Severity.MEDIUM
        for feature in active
    )

    device = build_device_command(
        total=len(active),
        high=high,
        medium=medium,
    )

    return SystemAnalysisResult(
        room_id=payload.layout.id,
        features=features,
        active_features=len(active),
        spatial=spatial,
        physical=physical,
        device=device,
    )
