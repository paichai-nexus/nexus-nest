from __future__ import annotations

from .models import (
    DeviceCommand,
    PhysicalAnalysisResult,
    PhysicalRiskCandidate,
    PhysicalRiskType,
    PhysicalSensorInput,
    Severity,
)


def build_device_command(
    total: int,
    high: int,
    medium: int,
) -> DeviceCommand:
    """
    Convert the risk result into a simple Arduino-friendly state.
    """

    if high > 0:
        return DeviceCommand(
            overall="danger",
            led_color="red",
            buzzer=True,
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


def _passage_risk(
    sensors: PhysicalSensorInput,
) -> PhysicalRiskCandidate | None:
    if sensors.passage_cm is None:
        return None

    if sensors.passage_cm >= sensors.passage_min_cm:
        return None

    # Keep the same demo severity logic as the existing movement engine.
    if sensors.passage_cm < sensors.passage_min_cm * 0.6:
        severity = Severity.HIGH
    else:
        severity = Severity.MEDIUM

    return PhysicalRiskCandidate(
        id="physical:passage",
        type=PhysicalRiskType.PASSAGE,
        severity=severity,
        title="통로 폭 위험 후보",
        explanation=(
            f"초음파센서 측정값이 {sensors.passage_cm:.1f}cm로 "
            f"현재 데모 기준 {sensors.passage_min_cm:.1f}cm보다 좁습니다."
        ),
        evidence={
            "passage_cm": round(sensors.passage_cm, 1),
            "demo_threshold_cm": sensors.passage_min_cm,
        },
    )


def _low_light_risk(
    sensors: PhysicalSensorInput,
) -> PhysicalRiskCandidate | None:
    if sensors.low_light_detected is not True:
        return None

    return PhysicalRiskCandidate(
        id="physical:low-light",
        type=PhysicalRiskType.LOW_LIGHT,
        severity=Severity.MEDIUM,
        title="저조도 구역 검토 후보",
        explanation=(
            "조도센서에서 저조도 상태가 감지되었습니다. "
            "교사가 실제 조명환경을 확인해야 합니다."
        ),
        evidence={
            "low_light_detected": True,
        },
    )


def _wet_floor_risk(
    sensors: PhysicalSensorInput,
) -> PhysicalRiskCandidate | None:
    if sensors.wet_detected is not True:
        return None

    return PhysicalRiskCandidate(
        id="physical:wet-floor",
        type=PhysicalRiskType.WET_FLOOR,
        severity=Severity.HIGH,
        title="바닥 습윤 검토 후보",
        explanation=(
            "시제품 센서에서 습윤 상태가 감지되었습니다. "
            "실제 바닥 상태를 교사가 확인해야 합니다."
        ),
        evidence={
            "wet_detected": True,
        },
    )


def analyze_physical(
    sensors: PhysicalSensorInput,
) -> PhysicalAnalysisResult:
    risks = []

    passage = _passage_risk(sensors)
    if passage is not None:
        risks.append(passage)

    low_light = _low_light_risk(sensors)
    if low_light is not None:
        risks.append(low_light)

    wet_floor = _wet_floor_risk(sensors)
    if wet_floor is not None:
        risks.append(wet_floor)

    summary = {
        "total": len(risks),
        "high": sum(r.severity == Severity.HIGH for r in risks),
        "medium": sum(r.severity == Severity.MEDIUM for r in risks),
        "low": sum(r.severity == Severity.LOW for r in risks),
    }

    device = build_device_command(
        total=summary["total"],
        high=summary["high"],
        medium=summary["medium"],
    )

    return PhysicalAnalysisResult(
        room_id=sensors.room_id,
        risks=risks,
        summary=summary,
        device=device,
    )
