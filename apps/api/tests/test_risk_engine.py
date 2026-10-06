from app.models import RoomLayout
from app.risk_engine import analyze


def test_demo_room_has_expected_risk_types():
    room = RoomLayout.model_validate(
        {
            "id": "t",
            "name": "test",
            "width_cm": 800,
            "height_cm": 600,
            "min_passage_cm": 80,
            "exit_clearance_cm": 100,
            "doors": [
                {"id": "door", "name": "출입문", "rect": {"x": 0, "y": 240, "width": 20, "height": 120}}
            ],
            "furniture": [
                {"id": "a", "name": "책장", "rect": {"x": 40, "y": 250, "width": 100, "height": 60}, "height_cm": 120},
                {"id": "b", "name": "책상", "rect": {"x": 200, "y": 250, "width": 100, "height": 80}},
            ],
        }
    )
    result = analyze(room)
    types = {risk.type.value for risk in result.risks}
    assert "evacuation" in types
    assert "movement" in types


def test_proposed_layout_can_reduce_risks():
    current = RoomLayout.model_validate(
        {
            "id": "current",
            "name": "current",
            "width_cm": 800,
            "height_cm": 600,
            "doors": [{"id": "d", "rect": {"x": 0, "y": 250, "width": 20, "height": 100}}],
            "furniture": [{"id": "f", "name": "수납장", "rect": {"x": 40, "y": 250, "width": 100, "height": 80}}],
        }
    )
    proposed = current.model_copy(deep=True)
    proposed.id = "proposed"
    proposed.furniture[0].rect.x = 500
    assert analyze(proposed).summary["total"] < analyze(current).summary["total"]
