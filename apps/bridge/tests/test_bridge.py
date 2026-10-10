import importlib.util
from pathlib import Path


BRIDGE_PATH = (
    Path(__file__)
    .resolve()
    .parents[1]
    / "nest_serial_bridge.py"
)

spec = importlib.util.spec_from_file_location(
    "nest_serial_bridge",
    BRIDGE_PATH,
)

bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def test_normalize_sensor_snapshot():
    raw = {
        "passage_cm": "32.4",
        "low_light_detected": False,
        "wet_detected": True,
    }

    result = bridge.normalize_sensor_snapshot(
        raw,
        room_id="room-01",
    )

    assert result == {
        "room_id": "room-01",
        "passage_cm": 32.4,
        "passage_min_cm": 80.0,
        "low_light_detected": False,
        "wet_detected": True,
    }


def test_device_packet():
    result = {
        "active_features": 3,
        "critical_zones": [
            {"id": "critical:1"}
        ],
        "device": {
            "overall": "danger",
            "led_color": "red",
            "buzzer": True,
            "lcd_line1": "NEST CRITICAL",
            "lcd_line2": "ZONES: 1",
        },
    }

    packet = bridge.device_packet(result)

    assert packet == {
        "type": "device",
        "overall": "danger",
        "led_color": "red",
        "buzzer": True,
        "lcd_line1": "NEST CRITICAL",
        "lcd_line2": "ZONES: 1",
        "active_features": 3,
        "critical_zones": 1,
    }


def test_build_system_payload_defaults():
    layout = {
        "id": "room-01",
    }

    sensors = {
        "room_id": "room-01",
    }

    payload = bridge.build_system_payload(
        layout,
        sensors,
    )

    assert payload["layout"] == layout
    assert payload["sensors"] == sensors

    assert payload["alerts"] == {
        "buzzer_enabled": True,
        "buzzer_mode": "critical_only",
    }
