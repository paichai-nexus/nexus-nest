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
