"""
NEST Physical Twin Serial Bridge
2026-10-10 이영준

Arduino UNO 센서값을 newline-delimited JSON으로 받아
NEST System API에 전달하고, 최종 device command를
Arduino가 사용할 JSON으로 다시 출력한다.

Python 3.9 compatible.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


DEFAULT_API_BASE = os.getenv(
    "NEST_API_BASE",
    "http://127.0.0.1:8000",
)
DEFAULT_SERIAL_PORT = os.getenv("NEST_SERIAL_PORT")
DEFAULT_BAUD = int(
    os.getenv("NEST_SERIAL_BAUD", "9600")
)
DEFAULT_ROOM_ID = os.getenv(
    "NEST_ROOM_ID",
    "HM101",
)
DEFAULT_DISTANCE_ATTENTION_CM = float(
    os.getenv("NEST_DISTANCE_ATTENTION_CM", "20")
)
DEFAULT_TIMEOUT = 5.0
DEFAULT_RETRIES = 3
DEFAULT_RETRY_DELAY = 0.4


class BridgeProtocolError(ValueError):
    """Invalid sensor or bridge protocol payload."""


def log_event(event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "event": event,
    }
    payload.update(fields)

    print(
        json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        file=sys.stderr,
        flush=True,
    )


def _coerce_bool(value: Any, field_name: str) -> bool:
    if isinstance(value, bool):
        return value

    if value in (0, 1):
        return bool(value)

    if isinstance(value, str):
        normalized = value.strip().lower()

        if normalized in ("true", "1", "yes", "on"):
            return True

        if normalized in ("false", "0", "no", "off", ""):
            return False

    raise BridgeProtocolError(
        "{} must be boolean-like".format(field_name)
    )


def normalize_sensor_snapshot(
    raw: Dict[str, Any],
    room_id: str,
) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise BridgeProtocolError(
            "sensor payload must be a JSON object"
        )

    passage = raw.get("passage_cm")

    if passage is not None:
        try:
            passage = float(passage)
        except (TypeError, ValueError) as exc:
            raise BridgeProtocolError(
                "passage_cm must be numeric or null"
            ) from exc

        if passage < 0:
            raise BridgeProtocolError(
                "passage_cm must be >= 0 or null"
            )

    try:
        passage_min = float(
            raw.get("passage_min_cm", 80)
        )
    except (TypeError, ValueError) as exc:
        raise BridgeProtocolError(
            "passage_min_cm must be numeric"
        ) from exc

    if passage_min <= 0:
        raise BridgeProtocolError(
            "passage_min_cm must be > 0"
        )

    return {
        "room_id": room_id,
        "passage_cm": passage,
        "passage_min_cm": passage_min,
        "low_light_detected": _coerce_bool(
            raw.get("low_light_detected", False),
            "low_light_detected",
        ),
        "wet_detected": _coerce_bool(
            raw.get("wet_detected", False),
            "wet_detected",
        ),
    }


def parse_serial_frame(line: str) -> Dict[str, Any]:
    """Parse both the existing JSON protocol and UNO text output.

    DISTANCE frames are measurement events only. They are intentionally
    kept separate from the NEST risk-analysis request because an HC-SR04
    distance change is not, by itself, an assessed child-safety risk.
    """
    stripped = line.strip()

    if not stripped:
        raise BridgeProtocolError("empty sensor line")

    if stripped == "NEXUS NEST SENSOR READY":
        return {
            "type": "ready",
            "measurement_status": "unavailable",
            "sensor": None,
        }

    if stripped.startswith("DISTANCE:"):
        value = stripped.split(":", 1)[1].strip()

        if value == "OUT_OF_RANGE":
            return {
                "type": "distance",
                "measurement_status": "out_of_range",
                "sensor": {
                    "passage_cm": None,
                    "passage_min_cm": 80.0,
                    "low_light_detected": False,
                    "wet_detected": False,
                },
            }

        try:
            distance = float(value)
        except ValueError as exc:
            raise BridgeProtocolError(
                "DISTANCE value must be numeric or OUT_OF_RANGE"
            ) from exc

        if distance < 0:
            raise BridgeProtocolError(
                "DISTANCE value must be >= 0"
            )

        return {
            "type": "distance",
            "measurement_status": "ok",
            "sensor": {
                "passage_cm": distance,
                "passage_min_cm": 80.0,
                "low_light_detected": False,
                "wet_detected": False,
            },
        }

    try:
        raw_sensor = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise BridgeProtocolError(
            "unsupported serial frame"
        ) from exc

    if not isinstance(raw_sensor, dict):
        raise BridgeProtocolError(
            "sensor JSON must be an object"
        )

    return {
        "type": "json",
        "measurement_status": (
            "ok"
            if raw_sensor.get("passage_cm") is not None
            else "unavailable"
        ),
        "sensor": raw_sensor,
    }


def proximity_state(
    frame: Dict[str, Any],
    attention_threshold_cm: float,
) -> str:
    """Classify a demo proximity event without making a safety judgment."""
    if attention_threshold_cm <= 0:
        raise BridgeProtocolError(
            "attention threshold must be > 0"
        )

    if frame.get("measurement_status") == "out_of_range":
        return "normal"

    sensor = frame.get("sensor") or {}
    distance = sensor.get("passage_cm")

    if distance is None:
        return "unavailable"

    return (
        "attention"
        if float(distance) <= attention_threshold_cm
        else "normal"
    )


def build_system_payload(
    layout: Dict[str, Any],
    sensors: Dict[str, Any],
    buzzer_enabled: bool = True,
    buzzer_mode: str = "critical_only",
) -> Dict[str, Any]:
    return {
        "layout": layout,
        "sensors": sensors,
        "alerts": {
            "buzzer_enabled": buzzer_enabled,
            "buzzer_mode": buzzer_mode,
        },
    }


def device_packet(
    result: Dict[str, Any],
) -> Dict[str, Any]:
    device = result["device"]

    return {
        "type": "device",
        "overall": device["overall"],
        "led_color": device["led_color"],
        "buzzer": bool(device["buzzer"]),
        "lcd_line1": device["lcd_line1"],
        "lcd_line2": device["lcd_line2"],
        "active_features": int(
            result.get("active_features", 0)
        ),
        "critical_zones": len(
            result.get("critical_zones", [])
        ),
    }


def encode_device_packet(
    packet: Dict[str, Any],
) -> str:
    return (
        json.dumps(
            packet,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n"
    )


def build_live_update(
    transport: str,
    simulated: bool,
    arduino_connected: bool,
    layout: Dict[str, Any],
    raw_sensor: Dict[str, Any],
    packet: Optional[Dict[str, Any]],
    measurement_status: Optional[str] = None,
    room_id: Optional[str] = None,
    sensor_type: Optional[str] = None,
    sensor_state: Optional[str] = None,
    attention_threshold_cm: Optional[float] = None,
) -> Dict[str, Any]:
    live_room_id = room_id or layout["id"]
    sensor = normalize_sensor_snapshot(
        raw_sensor,
        room_id=live_room_id,
    )

    device = None

    if packet is not None:
        device = {
            "overall": packet["overall"],
            "led_color": packet["led_color"],
            "buzzer": packet["buzzer"],
            "lcd_line1": packet["lcd_line1"],
            "lcd_line2": packet["lcd_line2"],
        }

    return {
        "transport": transport,
        "simulated": simulated,
        "bridge_connected": True,
        "arduino_connected": arduino_connected,
        "room_id": live_room_id,
        "sensor": sensor,
        "device": device,
        "measurement_status": (
            measurement_status
            or (
                "ok"
                if sensor["passage_cm"] is not None
                else "unavailable"
            )
        ),
        "sensor_type": sensor_type,
        "sensor_state": sensor_state,
        "attention_threshold_cm": attention_threshold_cm,
        "error": None,
    }


def build_bridge_status_update(
    connected: bool,
    error: Optional[str] = None,
    room_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "transport": "serial",
        "simulated": False,
        "bridge_connected": True,
        "arduino_connected": connected,
        "room_id": room_id,
        "sensor": None,
        "device": None,
        "measurement_status": "unavailable",
        "error": error,
    }


def publish_live_update(
    api_base: str,
    update: Dict[str, Any],
) -> None:
    try:
        request_json(
            api_base.rstrip("/")
            + "/api/v1/device/live",
            method="POST",
            payload=update,
            retries=1,
        )
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
        BridgeProtocolError,
        ValueError,
    ) as exc:
        log_event(
            "live_state_publish_error",
            error=str(exc),
        )


def request_json(
    url: str,
    method: str = "GET",
    payload: Optional[Dict[str, Any]] = None,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = DEFAULT_RETRIES,
    retry_delay: float = DEFAULT_RETRY_DELAY,
) -> Dict[str, Any]:
    if retries < 1:
        raise ValueError("retries must be >= 1")

    data = None
    headers = {}

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method=method,
    )

    last_error = None

    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(
                req,
                timeout=timeout,
            ) as response:
                decoded = json.loads(
                    response.read().decode("utf-8")
                )

                if not isinstance(decoded, dict):
                    raise BridgeProtocolError(
                        "API response must be a JSON object"
                    )

                return decoded

        except urllib.error.HTTPError as exc:
            last_error = exc

            if exc.code < 500 or attempt >= retries:
                raise

        except (
            urllib.error.URLError,
            TimeoutError,
        ) as exc:
            last_error = exc

            if attempt >= retries:
                raise

        log_event(
            "api_retry",
            attempt=attempt,
            retries=retries,
            error=str(last_error),
        )
        time.sleep(retry_delay)

    if last_error is not None:
        raise last_error

    raise RuntimeError("request_json failed unexpectedly")


def load_layout(
    api_base: str,
    room_json: Optional[str] = None,
    demo: str = "critical",
) -> Dict[str, Any]:
    if room_json:
        data = json.loads(
            Path(room_json).read_text(
                encoding="utf-8"
            )
        )

        if not isinstance(data, dict):
            raise BridgeProtocolError(
                "room JSON must contain an object"
            )

        return data

    endpoint = (
        "/api/v1/demo/field-critical"
        if demo == "critical"
        else "/api/v1/demo/field-improved"
    )

    return request_json(
        api_base.rstrip("/") + endpoint
    )


def analyze(
    api_base: str,
    layout: Dict[str, Any],
    raw_sensor: Dict[str, Any],
    buzzer_enabled: bool = True,
    buzzer_mode: str = "critical_only",
) -> Dict[str, Any]:
    sensors = normalize_sensor_snapshot(
        raw_sensor,
        room_id=layout["id"],
    )

    payload = build_system_payload(
        layout=layout,
        sensors=sensors,
        buzzer_enabled=buzzer_enabled,
        buzzer_mode=buzzer_mode,
    )

    return request_json(
        api_base.rstrip("/")
        + "/api/v1/system/analyze",
        method="POST",
        payload=payload,
    )


def process_sensor_line(
    line: str,
    api_base: str,
    layout: Dict[str, Any],
    buzzer_enabled: bool = True,
    buzzer_mode: str = "critical_only",
) -> Dict[str, Any]:
    stripped = line.strip()

    if not stripped:
        raise BridgeProtocolError(
            "empty sensor line"
        )

    try:
        raw_sensor = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise BridgeProtocolError(
            "invalid sensor JSON"
        ) from exc

    if not isinstance(raw_sensor, dict):
        raise BridgeProtocolError(
            "sensor JSON must be an object"
        )

    result = analyze(
        api_base=api_base,
        layout=layout,
        raw_sensor=raw_sensor,
        buzzer_enabled=buzzer_enabled,
        buzzer_mode=buzzer_mode,
    )

    return device_packet(result)


def run_mock(args: argparse.Namespace) -> int:
    layout = load_layout(
        api_base=args.api,
        room_json=args.room_json,
        demo=args.demo,
    )

    raw_sensor = {
        "passage_cm": args.passage_cm,
        "passage_min_cm": args.passage_min_cm,
        "low_light_detected": args.low_light,
        "wet_detected": args.wet,
    }

    result = analyze(
        api_base=args.api,
        layout=layout,
        raw_sensor=raw_sensor,
        buzzer_enabled=not args.buzzer_off,
        buzzer_mode=args.buzzer_mode,
    )

    packet = device_packet(result)

    print(
        json.dumps(
            {
                "sensor": raw_sensor,
                "device": packet,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0


def run_stdio(args: argparse.Namespace) -> int:
    layout = load_layout(
        api_base=args.api,
        room_json=args.room_json,
        demo=args.demo,
    )

    log_event(
        "stdio_ready",
        demo=args.demo,
        room_id=layout.get("id"),
    )

    for raw_line in sys.stdin:
        if not raw_line.strip():
            continue

        try:
            packet = process_sensor_line(
                line=raw_line,
                api_base=args.api,
                layout=layout,
                buzzer_enabled=not args.buzzer_off,
                buzzer_mode=args.buzzer_mode,
            )

            raw_sensor = json.loads(
                raw_line
            )

            publish_live_update(
                api_base=args.api,
                update=build_live_update(
                    transport="stdio",
                    simulated=True,
                    arduino_connected=False,
                    layout=layout,
                    raw_sensor=raw_sensor,
                    packet=packet,
                ),
            )

            sys.stdout.write(
                encode_device_packet(packet)
            )
            sys.stdout.flush()

        except (
            BridgeProtocolError,
            KeyError,
            ValueError,
            urllib.error.URLError,
        ) as exc:
            log_event(
                "frame_error",
                error=str(exc),
            )

    return 0


def run_serial(args: argparse.Namespace) -> int:
    try:
        import serial
    except ImportError:
        print(
            "ERROR: pyserial is required. "
            "Install apps/bridge/requirements.txt",
            file=sys.stderr,
        )
        return 2

    layout = load_layout(
        api_base=args.api,
        room_json=args.room_json,
        demo=args.demo,
    )
    room_id = args.room_id or layout["id"]

    while True:
        try:
            log_event(
                "serial_connecting",
                port=args.port,
                baud=args.baud,
            )

            with serial.Serial(
                args.port,
                args.baud,
                timeout=1,
            ) as ser:
                time.sleep(2)

                log_event(
                    "serial_connected",
                    port=args.port,
                    baud=args.baud,
                )

                publish_live_update(
                    api_base=args.api,
                    update=build_bridge_status_update(
                        connected=True,
                        room_id=room_id,
                    ),
                )

                while True:
                    raw_line = ser.readline()

                    if not raw_line:
                        continue

                    try:
                        line = raw_line.decode(
                            "utf-8"
                        ).strip()

                        if not line:
                            continue

                        frame = parse_serial_frame(line)

                        if frame["type"] == "ready":
                            log_event(
                                "arduino_ready",
                                port=args.port,
                            )
                            publish_live_update(
                                api_base=args.api,
                                update=build_bridge_status_update(
                                    connected=True,
                                    room_id=room_id,
                                ),
                            )
                            continue

                        if frame["type"] == "distance":
                            raw_sensor = frame["sensor"]
                            update = build_live_update(
                                transport="serial",
                                simulated=False,
                                arduino_connected=True,
                                layout=layout,
                                raw_sensor=raw_sensor,
                                packet=None,
                                measurement_status=frame[
                                    "measurement_status"
                                ],
                                room_id=room_id,
                                sensor_type="hc_sr04",
                                sensor_state=proximity_state(
                                    frame,
                                    args.distance_attention_cm,
                                ),
                                attention_threshold_cm=(
                                    args.distance_attention_cm
                                ),
                            )

                            publish_live_update(
                                api_base=args.api,
                                update=update,
                            )

                            print(
                                json.dumps(
                                    {
                                        "type": "sensor_event",
                                        "source": "hc_sr04",
                                        "measurement_status": frame[
                                            "measurement_status"
                                        ],
                                        "distance_cm": raw_sensor[
                                            "passage_cm"
                                        ],
                                        "room_id": room_id,
                                        "sensor_state": update[
                                            "sensor_state"
                                        ],
                                        "attention_threshold_cm": (
                                            args.distance_attention_cm
                                        ),
                                    },
                                    ensure_ascii=False,
                                    separators=(",", ":"),
                                ),
                                flush=True,
                            )
                            continue

                        packet = process_sensor_line(
                            line=line,
                            api_base=args.api,
                            layout=layout,
                            buzzer_enabled=not args.buzzer_off,
                            buzzer_mode=args.buzzer_mode,
                        )

                        raw_sensor = json.loads(
                            line
                        )

                        publish_live_update(
                            api_base=args.api,
                            update=build_live_update(
                                transport="serial",
                                simulated=False,
                                arduino_connected=True,
                                layout=layout,
                                raw_sensor=raw_sensor,
                                packet=packet,
                            ),
                        )

                        encoded = encode_device_packet(
                            packet
                        )

                        ser.write(
                            encoded.encode("utf-8")
                        )

                        print(
                            encoded.strip(),
                            flush=True,
                        )

                    except (
                        UnicodeDecodeError,
                        BridgeProtocolError,
                        KeyError,
                        ValueError,
                        urllib.error.URLError,
                    ) as exc:
                        log_event(
                            "frame_error",
                            error=str(exc),
                        )

        except serial.SerialException as exc:
            log_event(
                "serial_disconnected",
                port=args.port,
                error=str(exc),
            )

            publish_live_update(
                api_base=args.api,
                update=build_bridge_status_update(
                    connected=False,
                    error=str(exc),
                    room_id=room_id,
                ),
            )

            if args.no_reconnect:
                return 3

            time.sleep(
                args.reconnect_seconds
            )

        except KeyboardInterrupt:
            publish_live_update(
                api_base=args.api,
                update={
                    **build_bridge_status_update(
                        connected=False,
                        room_id=room_id,
                    ),
                    "bridge_connected": False,
                },
            )
            log_event("bridge_stopped")
            return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "NEST Arduino ↔ FastAPI Serial Bridge"
        )
    )

    parser.add_argument(
        "--api",
        default=DEFAULT_API_BASE,
    )

    parser.add_argument(
        "--room-json",
        default=None,
    )

    parser.add_argument(
        "--demo",
        choices=[
            "critical",
            "improved",
        ],
        default="critical",
    )

    parser.add_argument(
        "--buzzer-mode",
        choices=[
            "critical_only",
            "high_and_critical",
            "off",
        ],
        default="critical_only",
    )

    parser.add_argument(
        "--buzzer-off",
        action="store_true",
    )

    parser.add_argument(
        "--mock",
        action="store_true",
    )

    parser.add_argument(
        "--stdio",
        action="store_true",
        help=(
            "Read Arduino JSON lines from stdin "
            "and write device JSON lines to stdout"
        ),
    )

    parser.add_argument(
        "--passage-cm",
        type=float,
        default=100.0,
    )

    parser.add_argument(
        "--passage-min-cm",
        type=float,
        default=80.0,
    )

    parser.add_argument(
        "--low-light",
        action="store_true",
    )

    parser.add_argument(
        "--wet",
        action="store_true",
    )

    parser.add_argument(
        "--port",
        default=DEFAULT_SERIAL_PORT,
        help=(
            "Serial port (required for hardware mode; "
            "or set NEST_SERIAL_PORT)"
        ),
    )

    parser.add_argument(
        "--baud",
        type=int,
        default=DEFAULT_BAUD,
    )

    parser.add_argument(
        "--room-id",
        default=DEFAULT_ROOM_ID,
        help=(
            "Dashboard classroom id "
            "(default: NEST_ROOM_ID or HM101)"
        ),
    )

    parser.add_argument(
        "--distance-attention-cm",
        type=float,
        default=DEFAULT_DISTANCE_ATTENTION_CM,
        help=(
            "Demo proximity attention threshold in cm "
            "(not an official safety standard)"
        ),
    )

    parser.add_argument(
        "--reconnect-seconds",
        type=float,
        default=2.0,
    )

    parser.add_argument(
        "--no-reconnect",
        action="store_true",
    )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.mock and args.stdio:
        parser.error(
            "--mock and --stdio cannot be used together"
        )

    if args.mock:
        return run_mock(args)

    if args.stdio:
        return run_stdio(args)

    if not args.port:
        parser.error(
            "--port is required unless "
            "--mock or --stdio is used"
        )

    if args.distance_attention_cm <= 0:
        parser.error(
            "--distance-attention-cm must be > 0"
        )

    return run_serial(args)


if __name__ == "__main__":
    raise SystemExit(main())
