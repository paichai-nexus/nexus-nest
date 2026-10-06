from __future__ import annotations

import math
from itertools import combinations

from .models import (
    AnalysisResult,
    Furniture,
    Point,
    Rect,
    RiskCandidate,
    RiskType,
    RoomLayout,
    Severity,
)


def _center(rect: Rect) -> Point:
    return Point(x=rect.x + rect.width / 2, y=rect.y + rect.height / 2)


def _expand(rect: Rect, amount: float) -> Rect:
    return Rect(
        x=max(0, rect.x - amount),
        y=max(0, rect.y - amount),
        width=rect.width + amount * 2,
        height=rect.height + amount * 2,
    )


def _intersects(a: Rect, b: Rect) -> bool:
    return not (
        a.x + a.width <= b.x
        or b.x + b.width <= a.x
        or a.y + a.height <= b.y
        or b.y + b.height <= a.y
    )


def _axis_gap(a: Rect, b: Rect) -> tuple[float, float]:
    ax2, ay2 = a.x + a.width, a.y + a.height
    bx2, by2 = b.x + b.width, b.y + b.height
    gap_x = max(b.x - ax2, a.x - bx2, 0)
    gap_y = max(b.y - ay2, a.y - by2, 0)
    return gap_x, gap_y


def _overlap_1d(a1: float, a2: float, b1: float, b2: float) -> bool:
    return min(a2, b2) > max(a1, b1)


def _point_in_rect(p: Point, r: Rect) -> bool:
    return r.x <= p.x <= r.x + r.width and r.y <= p.y <= r.y + r.height


def _segments_intersect(p1: Point, p2: Point, p3: Point, p4: Point) -> bool:
    def orient(a: Point, b: Point, c: Point) -> float:
        return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

    o1, o2 = orient(p1, p2, p3), orient(p1, p2, p4)
    o3, o4 = orient(p3, p4, p1), orient(p3, p4, p2)
    return (o1 == 0 or o2 == 0 or o1 * o2 < 0) and (o3 == 0 or o4 == 0 or o3 * o4 < 0)


def _line_intersects_rect(a: Point, b: Point, r: Rect) -> bool:
    if _point_in_rect(a, r) or _point_in_rect(b, r):
        return True
    tl = Point(x=r.x, y=r.y)
    tr = Point(x=r.x + r.width, y=r.y)
    br = Point(x=r.x + r.width, y=r.y + r.height)
    bl = Point(x=r.x, y=r.y + r.height)
    return any(
        _segments_intersect(a, b, c, d)
        for c, d in [(tl, tr), (tr, br), (br, bl), (bl, tl)]
    )


def _movement_risks(layout: RoomLayout) -> list[RiskCandidate]:
    risks: list[RiskCandidate] = []
    for a, b in combinations(layout.furniture, 2):
        ra, rb = a.rect, b.rect
        gap_x, gap_y = _axis_gap(ra, rb)
        vertical_overlap = _overlap_1d(ra.y, ra.y + ra.height, rb.y, rb.y + rb.height)
        horizontal_overlap = _overlap_1d(ra.x, ra.x + ra.width, rb.x, rb.x + rb.width)

        gap = None
        if vertical_overlap and 0 < gap_x < layout.min_passage_cm:
            gap = gap_x
        elif horizontal_overlap and 0 < gap_y < layout.min_passage_cm:
            gap = gap_y
        elif _intersects(ra, rb):
            gap = 0

        if gap is None:
            continue

        severity = Severity.HIGH if gap < layout.min_passage_cm * 0.6 else Severity.MEDIUM
        ca, cb = _center(ra), _center(rb)
        risks.append(
            RiskCandidate(
                id=f"movement:{a.id}:{b.id}",
                type=RiskType.MOVEMENT,
                severity=severity,
                title="좁은 통로 후보",
                explanation=(
                    f"{a.name}와 {b.name} 사이 여유 폭이 약 {gap:.0f}cm로 "
                    f"현재 기준({layout.min_passage_cm:.0f}cm)보다 좁습니다."
                ),
                related_ids=[a.id, b.id],
                location=Point(x=(ca.x + cb.x) / 2, y=(ca.y + cb.y) / 2),
                evidence={"clearance_cm": round(gap, 1), "threshold_cm": layout.min_passage_cm},
            )
        )
    return risks


def _evacuation_risks(layout: RoomLayout) -> list[RiskCandidate]:
    risks: list[RiskCandidate] = []
    for door in layout.doors:
        if not door.is_emergency_exit:
            continue
        zone = _expand(door.rect, layout.exit_clearance_cm)
        for item in layout.furniture:
            if not _intersects(zone, item.rect):
                continue
            risks.append(
                RiskCandidate(
                    id=f"evacuation:{door.id}:{item.id}",
                    type=RiskType.EVACUATION,
                    severity=Severity.HIGH,
                    title="출입구·대피동선 방해 후보",
                    explanation=(
                        f"{item.name}이(가) {door.name} 주변 확보영역 "
                        f"({layout.exit_clearance_cm:.0f}cm)에 들어와 있습니다."
                    ),
                    related_ids=[door.id, item.id],
                    location=_center(item.rect),
                    evidence={"clearance_zone_cm": layout.exit_clearance_cm},
                )
            )
    return risks


def _collision_risks(layout: RoomLayout) -> list[RiskCandidate]:
    risks: list[RiskCandidate] = []
    for item in layout.furniture:
        if not item.sharp_edge:
            continue
        risks.append(
            RiskCandidate(
                id=f"collision:{item.id}",
                type=RiskType.COLLISION,
                severity=Severity.MEDIUM,
                title="충돌 위험 검토 후보",
                explanation=f"{item.name}에 돌출/모서리 위험 속성이 표시되어 있어 교사 확인이 필요합니다.",
                related_ids=[item.id],
                location=_center(item.rect),
                evidence={"sharp_edge": True, "height_cm": item.height_cm},
            )
        )
    return risks


def _blind_spot_risks(layout: RoomLayout) -> list[RiskCandidate]:
    if not layout.teacher_positions or not layout.observation_points:
        return []

    blockers = [f for f in layout.furniture if f.blocks_view and f.height_cm >= 70]
    risks: list[RiskCandidate] = []
    for idx, target in enumerate(layout.observation_points):
        visible_from_any = False
        blocking_ids: set[str] = set()
        for teacher in layout.teacher_positions:
            blocked_here = []
            for item in blockers:
                if _line_intersects_rect(teacher, target, item.rect):
                    blocked_here.append(item.id)
            if not blocked_here:
                visible_from_any = True
                break
            blocking_ids.update(blocked_here)

        if visible_from_any:
            continue
        risks.append(
            RiskCandidate(
                id=f"blind_spot:{idx}",
                type=RiskType.BLIND_SPOT,
                severity=Severity.MEDIUM,
                title="교사 시야 사각 후보",
                explanation="등록된 교사 위치에서 이 관찰지점까지의 시야가 가구에 의해 가려질 가능성이 있습니다.",
                related_ids=sorted(blocking_ids),
                location=target,
                evidence={"teacher_positions": len(layout.teacher_positions), "blockers": len(blocking_ids)},
            )
        )
    return risks


def analyze(layout: RoomLayout) -> AnalysisResult:
    risks = []
    risks.extend(_evacuation_risks(layout))
    risks.extend(_movement_risks(layout))
    risks.extend(_blind_spot_risks(layout))
    risks.extend(_collision_risks(layout))

    summary = {
        "total": len(risks),
        "high": sum(r.severity == Severity.HIGH for r in risks),
        "medium": sum(r.severity == Severity.MEDIUM for r in risks),
        "low": sum(r.severity == Severity.LOW for r in risks),
    }
    return AnalysisResult(room_id=layout.id, risks=risks, summary=summary)
