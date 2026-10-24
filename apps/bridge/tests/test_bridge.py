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


def test_parse_uno_ready_frame():
    assert bridge.parse_serial_frame(
        "NEXUS NEST SENSOR READY"
    ) == {
        "type": "ready",
        "measurement_status": "unavailable",
        "sensor": None,
    }


def test_parse_uno_distance_frame():
    result = bridge.parse_serial_frame(
        "DISTANCE:11.2"
    )

    assert result["type"] == "distance"
    assert result["measurement_status"] == "ok"
    assert result["sensor"]["passage_cm"] == 11.2


def test_parse_uno_out_of_range_frame():
    result = bridge.parse_serial_frame(
        "DISTANCE:OUT_OF_RANGE"
    )

    assert result["type"] == "distance"
    assert result["measurement_status"] == "out_of_range"
    assert result["sensor"]["passage_cm"] is None


def test_parse_uno_bad_distance_is_rejected():
    with pytest.raises(bridge.BridgeProtocolError):
        bridge.parse_serial_frame("DISTANCE:unknown")


@pytest.mark.parametrize(
    "frame,expected",
    [
        ("DISTANCE:11.2", "attention"),
        ("DISTANCE:45.0", "normal"),
        ("DISTANCE:OUT_OF_RANGE", "normal"),
    ],
)
def test_proximity_state_for_demo_threshold(frame, expected):
    parsed = bridge.parse_serial_frame(frame)
    assert bridge.proximity_state(parsed, 20.0) == expected


def test_proximity_state_rejects_invalid_threshold():
    parsed = bridge.parse_serial_frame("DISTANCE:11.2")
    with pytest.raises(bridge.BridgeProtocolError):
        bridge.proximity_state(parsed, 0)


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


def test_build_live_update():
    layout = {
        "id": "room-01",
    }

    packet = {
        "type": "device",
        "overall": "danger",
        "led_color": "red",
        "buzzer": True,
        "lcd_line1": "NEST CRITICAL",
        "lcd_line2": "ZONES: 1",
        "active_features": 2,
        "critical_zones": 1,
    }

    update = bridge.build_live_update(
        transport="stdio",
        simulated=True,
        arduino_connected=False,
        layout=layout,
        raw_sensor={
            "passage_cm": 100,
            "low_light_detected": False,
            "wet_detected": False,
        },
        packet=packet,
    )

    assert update["transport"] == "stdio"
    assert update["simulated"] is True
    assert update["bridge_connected"] is True
    assert update["arduino_connected"] is False
    assert update["sensor"]["room_id"] == "room-01"
    assert update["device"]["buzzer"] is True
    assert update["measurement_status"] == "ok"


def test_build_measurement_only_live_update():
    update = bridge.build_live_update(
        transport="serial",
        simulated=False,
        arduino_connected=True,
        layout={"id": "room-01"},
        raw_sensor={
            "passage_cm": None,
            "low_light_detected": False,
            "wet_detected": False,
        },
        packet=None,
        measurement_status="out_of_range",
        room_id="HM101",
        sensor_type="hc_sr04",
        sensor_state="normal",
        attention_threshold_cm=20,
    )

    assert update["sensor"]["passage_cm"] is None
    assert update["device"] is None
    assert update["measurement_status"] == "out_of_range"
    assert update["room_id"] == "HM101"
    assert update["sensor"]["room_id"] == "HM101"
    assert update["sensor_type"] == "hc_sr04"
    assert update["sensor_state"] == "normal"
    assert update["attention_threshold_cm"] == 20


def test_default_hardware_settings_match_verified_uno():
    assert bridge.DEFAULT_SERIAL_PORT is None
    assert bridge.DEFAULT_BAUD == 9600
    assert bridge.DEFAULT_ROOM_ID == "HM101"
    assert bridge.DEFAULT_DISTANCE_ATTENTION_CM == 20.0
