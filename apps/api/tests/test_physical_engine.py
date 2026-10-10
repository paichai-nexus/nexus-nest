from fastapi.testclient import TestClient

from app.main import app
from app.models import PhysicalSensorInput
from app.physical_engine import analyze_physical


def test_physical_safe_state():
    sensors = PhysicalSensorInput(
        room_id="nest-test",
        passage_cm=100,
        low_light_detected=False,
        wet_detected=False,
    )

    result = analyze_physical(sensors)

    assert result.summary["total"] == 0
    assert result.device.overall == "safe"
    assert result.device.led_color == "green"
    assert result.device.buzzer is False


def test_physical_danger_state():
    sensors = PhysicalSensorInput(
        room_id="nest-test",
        passage_cm=30,
        low_light_detected=True,
        wet_detected=True,
    )

    result = analyze_physical(sensors)

    types = {risk.type.value for risk in result.risks}

    assert "passage" in types
    assert "low_light" in types
    assert "wet_floor" in types

    assert result.summary["total"] == 3
    assert result.summary["high"] >= 1

    assert result.device.overall == "danger"
    assert result.device.led_color == "red"
    assert result.device.buzzer is True


def test_physical_api():
    client = TestClient(app)

    response = client.post(
        "/api/v1/physical-twin/analyze",
        json={
            "room_id": "nest-demo-01",
            "passage_cm": 32,
            "passage_min_cm": 80,
            "low_light_detected": True,
            "wet_detected": False,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["room_id"] == "nest-demo-01"
    assert data["device"]["overall"] == "danger"
    assert data["device"]["led_color"] == "red"
