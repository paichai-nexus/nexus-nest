import importlib.util
from pathlib import Path

import pytest


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


def test_normalize_boolean_strings():
    result = bridge.normalize_sensor_snapshot(
        {
            "passage_cm": None,
            "low_light_detected": "false",
            "wet_detected": "true",
        },
        room_id="room-01",
    )

    assert result["low_light_detected"] is False
    assert result["wet_detected"] is True


def test_negative_passage_is_rejected():
    with pytest.raises(
        bridge.BridgeProtocolError
    ):
        bridge.normalize_sensor_snapshot(
            {"passage_cm": -1},
            room_id="room-01",
        )


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


def test_encode_device_packet_is_one_json_line():
    packet = {
        "type": "device",
        "overall": "safe",
    }

    encoded = bridge.encode_device_packet(
        packet
    )

    assert encoded.endswith("\n")
    assert encoded.count("\n") == 1


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


def test_process_sensor_line(
    monkeypatch,
):
    fake_result = {
        "active_features": 2,
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

    def fake_analyze(**kwargs):
        assert kwargs["raw_sensor"] == {
            "passage_cm": 100,
            "low_light_detected": False,
            "wet_detected": False,
        }
        return fake_result

    monkeypatch.setattr(
        bridge,
        "analyze",
        fake_analyze,
    )

    packet = bridge.process_sensor_line(
        line=(
            '{"passage_cm":100,'
            '"low_light_detected":false,'
            '"wet_detected":false}'
        ),
        api_base="http://example.test",
        layout={"id": "room-01"},
    )

    assert packet["lcd_line1"] == (
        "NEST CRITICAL"
    )
    assert packet["critical_zones"] == 1


def test_process_sensor_line_rejects_bad_json():
    with pytest.raises(
        bridge.BridgeProtocolError
    ):
        bridge.process_sensor_line(
            line="{broken-json",
            api_base="http://example.test",
            layout={"id": "room-01"},
        )


def test_process_sensor_line_rejects_array():
    with pytest.raises(
        bridge.BridgeProtocolError
    ):
        bridge.process_sensor_line(
            line="[1,2,3]",
            api_base="http://example.test",
            layout={"id": "room-01"},
        )
