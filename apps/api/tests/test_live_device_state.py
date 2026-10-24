from datetime import timedelta

from fastapi.testclient import TestClient

from app import device_state
from app.device_state import reset_live_device_state
from app.main import app


client = TestClient(app)


def setup_function():
    reset_live_device_state()


def test_live_device_initial_state_is_offline():
    response = client.get("/api/v1/device/live")

    assert response.status_code == 200

    data = response.json()

    assert data["transport"] == "none"
    assert data["bridge_connected"] is False
    assert data["arduino_connected"] is False
    assert data["stale"] is True
    assert data["device"] is None


def test_live_device_update_round_trip():
    payload = {
        "transport": "stdio",
        "simulated": True,
        "bridge_connected": True,
        "arduino_connected": False,
        "room_id": "nest-field-critical",
        "sensor": {
            "room_id": "nest-field-critical",
            "passage_cm": 100,
            "passage_min_cm": 80,
            "low_light_detected": False,
            "wet_detected": False,
        },
        "device": {
            "overall": "danger",
            "led_color": "red",
            "buzzer": True,
            "lcd_line1": "NEST CRITICAL",
            "lcd_line2": "ZONES: 1",
        },
        "measurement_status": "ok",
        "error": None,
    }

    posted = client.post(
        "/api/v1/device/live",
        json=payload,
    )

    assert posted.status_code == 200
    posted_data = posted.json()

    assert posted_data["simulated"] is True
    assert posted_data["stale"] is False
    assert posted_data["device"]["led_color"] == "red"

    fetched = client.get("/api/v1/device/live")

    assert fetched.status_code == 200

    data = fetched.json()

    assert data["room_id"] == "nest-field-critical"
    assert data["sensor"]["passage_cm"] == 100
    assert data["measurement_status"] == "ok"
    assert data["device"]["buzzer"] is True
    assert data["received_at"] is not None
    assert data["age_seconds"] is not None


def test_live_device_marks_interrupted_stream_as_stale(monkeypatch):
    payload = {
        "transport": "serial",
        "simulated": False,
        "bridge_connected": True,
        "arduino_connected": True,
        "measurement_status": "ok",
        "sensor": {
            "room_id": "nest-field-critical",
            "passage_cm": 11.2,
            "passage_min_cm": 80,
            "low_light_detected": False,
            "wet_detected": False,
        },
    }

    posted = client.post("/api/v1/device/live", json=payload)
    received_at = device_state._now()
    monkeypatch.setattr(
        device_state,
        "_now",
        lambda: received_at
        + timedelta(seconds=device_state.STALE_AFTER_SECONDS + 0.1),
    )

    data = client.get("/api/v1/device/live").json()

    assert posted.status_code == 200
    assert data["stale"] is True
    assert data["age_seconds"] > device_state.STALE_AFTER_SECONDS


def test_live_device_accepts_out_of_range_measurement():
    payload = {
        "transport": "serial",
        "simulated": False,
        "bridge_connected": True,
        "arduino_connected": True,
        "measurement_status": "out_of_range",
        "sensor": {
            "room_id": "nest-field-critical",
            "passage_cm": None,
            "passage_min_cm": 80,
            "low_light_detected": False,
            "wet_detected": False,
        },
    }

    posted = client.post("/api/v1/device/live", json=payload)

    assert posted.status_code == 200
    data = posted.json()
    assert data["simulated"] is False
    assert data["measurement_status"] == "out_of_range"
    assert data["sensor"]["passage_cm"] is None
    assert data["device"] is None
