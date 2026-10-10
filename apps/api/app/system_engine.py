from __future__ import annotations

import math

from .models import (
    AlertPreferences,
    CriticalZone,
    DeviceCommand,
    PhysicalRiskType,
    RiskType,
    Severity,
    SystemAnalysisResult,
    SystemAnalyzeRequest,
    SystemFeatureStatus,
)

from .physical_engine import analyze_physical
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

    all_risks = [
        *spatial_risks,
        *sensor_risks,
    ]

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
        related_risk_ids=[
            risk.id
            for risk in all_risks
        ],
    )


def _distance(a, b) -> float:
    return math.hypot(
        a.x - b.x,
        a.y - b.y,
    )


def _critical_zones(
    blind_spot_risks,
    collision_risks,
    radius_cm: float,
) -> list[CriticalZone]:
    """
    현장 인터뷰 이후 추가된 핵심 로직.

    교사가 볼 수 없는 위치와
    가구/모서리 충돌 위험 위치가 가까이 있을 경우
    Critical Zone 후보로 결합한다.

    radius_cm은 현재 데모 기준이다.
    """

    zones = []

    for blind in blind_spot_risks:
        for collision in collision_risks:

            distance_cm = _distance(
                blind.location,
                collision.location,
            )

            if distance_cm > radius_cm:
                continue

            location = type(blind.location)(
                x=(
                    blind.location.x
                    + collision.location.x
                ) / 2,
                y=(
                    blind.location.y
                    + collision.location.y
                ) / 2,
            )

            zones.append(
                CriticalZone(
                    id=(
                        "critical:"
                        f"{blind.id}:"
                        f"{collision.id}"
                    ),
                    title=(
                        "시야 사각 × 충돌 위험 "
                        "Critical Zone"
                    ),
                    explanation=(
                        "교사 시야 사각 후보와 "
                        "가구·모서리 충돌 위험 후보가 "
                        f"약 {distance_cm:.0f}cm 이내에 "
                        "함께 존재합니다. "
                        "교사의 우선 확인이 필요합니다."
                    ),
                    blind_spot_risk_id=blind.id,
                    collision_risk_id=collision.id,
                    distance_cm=round(
                        distance_cm,
                        1,
                    ),
                    location=location,
                )
            )

    return zones


def _should_buzz(
    alerts: AlertPreferences,
    high_count: int,
    critical_count: int,
) -> bool:
    """
    현직 교사 피드백 반영:
    위험이 발생할 때마다 벨을 울리지 않는다.
    """

    if not alerts.buzzer_enabled:
        return False

    if alerts.buzzer_mode == "off":
        return False

    if alerts.buzzer_mode == "high_and_critical":
        return (
            high_count > 0
            or critical_count > 0
        )

    # default: critical_only
    return critical_count > 0


def _build_system_device(
    total: int,
    high: int,
    medium: int,
    critical_count: int,
    alerts: AlertPreferences,
) -> DeviceCommand:

    buzzer = _should_buzz(
        alerts=alerts,
        high_count=high,
        critical_count=critical_count,
    )

    # Critical Zone은 우선 주의가 필요한 상태
    if critical_count > 0:
        return DeviceCommand(
            overall="danger",
            led_color="red",
            buzzer=buzzer,
            lcd_line1="NEST CRITICAL",
            lcd_line2=(
                f"ZONES: {critical_count}"
            ),
        )

    # 일반 HIGH 위험은 화면/LED 중심.
    # 기본 설정에서는 소리를 내지 않는다.
    if high > 0:
        return DeviceCommand(
            overall="danger",
            led_color="red",
            buzzer=buzzer,
            lcd_line1="NEST DANGER",
            lcd_line2=f"RISKS: {total}",
        )

    if medium > 0:
        return DeviceCommand(
            overall="warning",
            led_color="yellow",
            buzzer=False,
            lcd_line1="NEST WARNING",
            lcd_line2=f"RISKS: {total}",
        )

    return DeviceCommand(
        overall="safe",
        led_color="green",
        buzzer=False,
        lcd_line1="NEST SAFE",
        lcd_line2="RISKS: 0",
    )


def analyze_system(
    payload: SystemAnalyzeRequest,
) -> SystemAnalysisResult:

    spatial = analyze(
        payload.layout
    )

    physical = analyze_physical(
        payload.sensors
    )

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

    # 기존 6개 기능은 유지한다.
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

    # 현장검증 이후 추가된 핵심 융합 분석
    critical_zones = _critical_zones(
        blind_spot_risks=blind_spot,
        collision_risks=collision,
        radius_cm=(
            payload.alerts
            .critical_zone_radius_cm
        ),
    )

    active = [
        feature
        for feature in features
        if feature.active
    ]

    high = sum(
        feature.severity == Severity.HIGH
        for feature in active
    )

    medium = sum(
        feature.severity == Severity.MEDIUM
        for feature in active
    )

    device = _build_system_device(
        total=len(active),
        high=high,
        medium=medium,
        critical_count=len(
            critical_zones
        ),
        alerts=payload.alerts,
    )

    return SystemAnalysisResult(
        room_id=payload.layout.id,
        features=features,
        active_features=len(active),
        critical_zones=critical_zones,
        spatial=spatial,
        physical=physical,
        device=device,
        alert_policy=payload.alerts,
    )
