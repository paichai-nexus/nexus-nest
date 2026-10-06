import json
from pathlib import Path

from app.models import RoomLayout
from app.risk_engine import analyze


ROOT = Path(__file__).resolve().parents[3]


def load_room(name: str) -> RoomLayout:
    data = json.loads(
        (ROOT / "contracts" / name).read_text(encoding="utf-8")
    )
    return RoomLayout.model_validate(data)


def test_demo_layout_improvement_reduces_risk_candidates():
    current = analyze(load_room("sample-room.json"))
    proposed = analyze(load_room("proposed-room.json"))

    assert current.summary["total"] == 4
    assert current.summary["high"] == 1

    assert proposed.summary["total"] == 1
    assert proposed.summary["high"] == 0

    assert proposed.summary["total"] < current.summary["total"]
    assert proposed.summary["high"] < current.summary["high"]
