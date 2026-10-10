from fastapi.testclient import TestClient

from app.main import app
from app.models import SystemAnalyzeRequest
from app.system_engine import analyze_system


def _payload():
    return {
        "layout": {
            "id": "nest-demo-01",
            "name": "NEST Demo Classroom",
            "width_cm": 800,
            "height_cm": 600,
            "min_passage_cm": 80,
            "exit_clearance_cm": 100,
            "doors": [
                {
                    "id": "door-1",
                    "name": "출입문",
                    "rect": {
                        "x": 0,
                        "y": 240,
                        "width": 20,
                        "height": 120
                    }
                }
            ],
            "furniture": [
                {
                    "id": "cabinet-1",
                    "name": "수납장",
                    "rect": {
                        "x": 40,
                        "y": 250,
                        "width": 100,
                        "height": 80
                    },
                    "height_cm": 120,
                    "sharp_edge": True
                },
                {
                    "id": "table-1",
                    "name": "책상",
                    "rect": {
                        "x": 200,
                        "y": 250,
                        "width": 100,
                        "height": 80
                    }
                }
            ],
            "teacher_positions": [],
            "observation_points": []
        },
        "sensors": {
            "room_id": "nest-demo-01",
            "passage_cm": 32,
            "passage_min_cm": 80,
            "low_light_detected": True,
            "wet_detected": False
        }
    }


def test_system_has_exactly_six_features():
    payload = SystemAnalyzeRequest.model_validate(_payload())
    result = analyze_system(payload)

    assert len(result.features) == 6

    keys = {feature.key for feature in result.features}

    assert keys == {
        "passage",
        "evacuation",
        "blind_spot",
        "collision",
        "low_light",
        "wet_floor",
    }


def test_passage_fuses_spatial_and_sensor_sources():
    payload = SystemAnalyzeRequest.model_validate(_payload())
    result = analyze_system(payload)

    passage = next(
        feature
        for feature in result.features
        if feature.key == "passage"
    )

    assert passage.active is True
    assert "spatial" in passage.sources
    assert "sensor" in passage.sources


def test_system_device_command_uses_feature_count():
    payload = SystemAnalyzeRequest.model_validate(_payload())
    result = analyze_system(payload)

    assert result.active_features >= 1
    assert result.device.overall == "danger"
    assert result.device.led_color == "red"
    assert result.device.buzzer is True


def test_system_api():
    client = TestClient(app)

    response = client.post(
        "/api/v1/system/analyze",
        json=_payload(),
    )

    assert response.status_code == 200

    data = response.json()

    assert data["room_id"] == "nest-demo-01"
    assert len(data["features"]) == 6
    assert data["device"]["overall"] == "danger"
