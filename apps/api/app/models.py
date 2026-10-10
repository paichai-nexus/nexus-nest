from __future__ import annotations

from enum import Enum
from typing import Literal, Optional, Union
from pydantic import BaseModel, Field


class RiskType(str, Enum):
    MOVEMENT = "movement"
    EVACUATION = "evacuation"
    BLIND_SPOT = "blind_spot"
    COLLISION = "collision"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Rect(BaseModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class Point(BaseModel):
    x: float
    y: float


class Furniture(BaseModel):
    id: str
    name: str
    rect: Rect
    movable: bool = True
    height_cm: float = Field(default=60, ge=0)
    blocks_view: bool = True
    sharp_edge: bool = False


class Door(BaseModel):
    id: str
    name: str = "출입문"
    rect: Rect
    is_emergency_exit: bool = True


class RoomLayout(BaseModel):
    id: str
    name: str
    width_cm: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    furniture: list[Furniture] = []
    doors: list[Door] = []
    teacher_positions: list[Point] = []
    observation_points: list[Point] = []
    min_passage_cm: float = Field(default=80, gt=0)
    exit_clearance_cm: float = Field(default=100, gt=0)


class RiskCandidate(BaseModel):
    id: str
    type: RiskType
    severity: Severity
    title: str
    explanation: str
    related_ids: list[str]
    location: Point
    evidence: dict[str, Union[float, int, str, bool]] = {}
    source: Literal["rule", "manual"] = "rule"
    requires_teacher_review: bool = True


class AnalysisResult(BaseModel):
    room_id: str
    risks: list[RiskCandidate]
    summary: dict[str, int]
    disclaimer: str = (
        "본 결과는 공간안전 위험 후보를 시각화하는 참고자료이며, "
        "공식 안전검사 또는 교사의 전문적 판단을 대체하지 않습니다."
    )


class CompareRequest(BaseModel):
    current: RoomLayout
    proposed: RoomLayout


class CompareResult(BaseModel):
    current: AnalysisResult
    proposed: AnalysisResult
    delta_total: int
    delta_high: int



class PhysicalRiskType(str, Enum):
    PASSAGE = "passage"
    LOW_LIGHT = "low_light"
    WET_FLOOR = "wet_floor"


class PhysicalSensorInput(BaseModel):
    """
    Physical Twin sensor snapshot.

    low_light_detected / wet_detected are boolean for the first PoC.
    Raw sensor calibration will be added after the actual Arduino test.
    """

    room_id: str

    # Ultrasonic sensor result.
    passage_cm: Optional[float] = Field(default=None, ge=0)

    # Temporary demo threshold.
    # This is not an official kindergarten safety standard.
    passage_min_cm: float = Field(default=80, gt=0)

    # Arduino-side detection result for the first prototype.
    low_light_detected: Optional[bool] = None
    wet_detected: Optional[bool] = None


class PhysicalRiskCandidate(BaseModel):
    id: str
    type: PhysicalRiskType
    severity: Severity
    title: str
    explanation: str
    evidence: dict[str, Union[float, int, str, bool]] = Field(
        default_factory=dict
    )


class DeviceCommand(BaseModel):
    overall: Literal["safe", "warning", "danger"]
    led_color: Literal["green", "yellow", "red"]
    buzzer: bool
    lcd_line1: str
    lcd_line2: str


class PhysicalAnalysisResult(BaseModel):
    room_id: str
    risks: list[PhysicalRiskCandidate]
    summary: dict[str, int]
    device: DeviceCommand
    disclaimer: str = (
        "센서 결과와 현재 기준값을 이용한 NEST 시제품의 위험 후보 판단입니다. "
        "공식 안전검사 또는 교사의 전문적 판단을 대체하지 않습니다."
    )



class AlertPreferences(BaseModel):
    """
    현장 피드백을 반영한 NEST 알림 설정.

    기본값은 상시 경고음이 아니라
    Critical Zone에서만 경고음을 사용하는 정책이다.
    """

    buzzer_enabled: bool = True

    buzzer_mode: Literal[
        "off",
        "critical_only",
        "high_and_critical",
    ] = "critical_only"

    # 데모용 융합 반경.
    # 공식 안전기준이 아니며 현장 검증 후 조정한다.
    critical_zone_radius_cm: float = Field(
        default=120,
        gt=0,
    )


class CriticalZone(BaseModel):
    id: str
    level: Literal["critical"] = "critical"
    title: str
    explanation: str

    blind_spot_risk_id: str
    collision_risk_id: str

    distance_cm: float
    location: Point


class SystemAnalyzeRequest(BaseModel):
    layout: RoomLayout
    sensors: PhysicalSensorInput

    alerts: AlertPreferences = Field(
        default_factory=AlertPreferences
    )


class SystemFeatureStatus(BaseModel):
    key: Literal[
        "passage",
        "evacuation",
        "blind_spot",
        "collision",
        "low_light",
        "wet_floor",
    ]

    label: str
    active: bool
    severity: Optional[Severity] = None

    sources: list[
        Literal["spatial", "sensor"]
    ] = Field(default_factory=list)

    related_risk_ids: list[str] = Field(
        default_factory=list
    )


class SystemAnalysisResult(BaseModel):
    room_id: str

    features: list[SystemFeatureStatus]
    active_features: int

    # 현장 검증 이후 추가된 핵심 융합 결과
    critical_zones: list[CriticalZone]

    spatial: AnalysisResult
    physical: PhysicalAnalysisResult

    device: DeviceCommand
    alert_policy: AlertPreferences

    disclaimer: str = (
        "NEST 통합 결과는 공간분석과 시제품 센서값을 결합한 "
        "위험 후보 참고정보입니다. 공식 안전검사 또는 교사의 "
        "전문적 판단을 대체하지 않습니다."
    )

class LiveDeviceUpdate(BaseModel):
    transport: Literal[
        "none",
        "serial",
        "stdio",
        "mock",
    ] = "none"

    simulated: bool = False
    bridge_connected: bool = False
    arduino_connected: bool = False

    room_id: Optional[str] = None
    sensor: Optional[PhysicalSensorInput] = None
    device: Optional[DeviceCommand] = None
    error: Optional[str] = None


class LiveDeviceState(LiveDeviceUpdate):
    received_at: Optional[str] = None
    stale: bool = True
    age_seconds: Optional[float] = None
