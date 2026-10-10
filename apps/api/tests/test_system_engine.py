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
                        "height": 120,
                    },
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
                        "height": 80,
                    },
                    "height_cm": 120,
                    "sharp_edge": True,
                },
                {
                    "id": "table-1",
                    "name": "책상",
                    "rect": {
                        "x": 200,
                        "y": 250,
                        "width": 100,
                        "height": 80,
                    },
                },
            ],
            "teacher_positions": [],
            "observation_points": [],
        },
        "sensors": {
            "room_id": "nest-demo-01",
            "passage_cm": 32,
            "passage_min_cm": 80,
            "low_light_detected": True,
            "wet_detected": False,
        },
    }


def _critical_payload():
    return {
        "layout": {
            "id": "nest-critical-01",
            "name": "Critical Zone Demo",
            "width_cm": 800,
            "height_cm": 600,
            "doors": [],
            "furniture": [
                {
                    "id": "sharp-cabinet",
                    "name": "모서리 수납장",
                    "rect": {
                        "x": 300,
                        "y": 250,
                        "width": 100,
                        "height": 100,
                    },
                    "height_cm": 120,
                    "blocks_view": True,
                    "sharp_edge": True,
                }
            ],
            "teacher_positions": [
                {
                    "x": 100,
                    "y": 300,
                }
            ],
            "observation_points": [
                {
                    "x": 430,
                    "y": 300,
                }
            ],
        },
        "sensors": {
            "room_id": "nest-critical-01",
            "passage_cm": 100,
            "passage_min_cm": 80,
            "low_light_detected": False,
            "wet_detected": False,
        },
        "alerts": {
            "buzzer_enabled": True,
            "buzzer_mode": "critical_only",
            "critical_zone_radius_cm": 120,
        },
    }


def test_system_has_exactly_six_features():
    payload = SystemAnalyzeRequest.model_validate(
        _payload()
    )

    result = analyze_system(payload)

    assert len(result.features) == 6

    keys = {
        feature.key
        for feature in result.features
    }

    assert keys == {
        "passage",
        "evacuation",
        "blind_spot",
        "collision",
        "low_light",
        "wet_floor",
    }


def test_passage_fuses_spatial_and_sensor_sources():
    payload = SystemAnalyzeRequest.model_validate(
        _payload()
    )

    result = analyze_system(payload)

    passage = next(
        feature
        for feature in result.features
        if feature.key == "passage"
    )

    assert passage.active is True
    assert "spatial" in passage.sources
    assert "sensor" in passage.sources


def test_general_high_risk_does_not_buzz_by_default():
    payload = SystemAnalyzeRequest.model_validate(
        _payload()
    )

    result = analyze_system(payload)

    assert result.active_features >= 1
    assert result.device.overall == "danger"
    assert result.device.led_color == "red"

    # 현장 교사 피드백 반영:
    # 일반 HIGH 위험마다 벨을 울리지 않는다.
    assert result.device.buzzer is False


def test_blind_spot_and_collision_create_critical_zone():
    payload = SystemAnalyzeRequest.model_validate(
        _critical_payload()
    )

    result = analyze_system(payload)

    assert len(result.critical_zones) == 1

    zone = result.critical_zones[0]

    assert zone.level == "critical"

    assert (
        zone.blind_spot_risk_id
        == "blind_spot:0"
    )

    assert (
        zone.collision_risk_id
        == "collision:sharp-cabinet"
    )

    assert result.device.overall == "danger"
    assert result.device.led_color == "red"
    assert result.device.buzzer is True
    assert result.device.lcd_line1 == "NEST CRITICAL"


def test_teacher_can_disable_buzzer():
    data = _critical_payload()

    data["alerts"]["buzzer_enabled"] = False

    payload = SystemAnalyzeRequest.model_validate(
        data
    )

    result = analyze_system(payload)

    assert len(result.critical_zones) == 1
    assert result.device.overall == "danger"
    assert result.device.buzzer is False


def test_system_api():
    client = TestClient(app)

    response = client.post(
        "/api/v1/system/analyze",
        json=_critical_payload(),
    )

    assert response.status_code == 200

    data = response.json()

    assert data["room_id"] == "nest-critical-01"
    assert len(data["features"]) == 6
    assert len(data["critical_zones"]) == 1

    assert (
        data["alert_policy"]["buzzer_mode"]
        == "critical_only"
    )

    assert (
        data["device"]["lcd_line1"]
        == "NEST CRITICAL"
    )
