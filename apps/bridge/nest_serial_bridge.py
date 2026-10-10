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
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional


DEFAULT_API_BASE = "http://127.0.0.1:8000"
DEFAULT_BAUD = 115200


def normalize_sensor_snapshot(
    raw: Dict[str, Any],
    room_id: str,
) -> Dict[str, Any]:
    """
    Arduino에서 받은 값을 System API sensor 형식으로 정규화한다.
    """

    passage = raw.get("passage_cm")

    if passage is not None:
        passage = float(passage)

    return {
        "room_id": room_id,
        "passage_cm": passage,
        "passage_min_cm": float(
            raw.get("passage_min_cm", 80)
        ),
        "low_light_detected": bool(
            raw.get("low_light_detected", False)
        ),
        "wet_detected": bool(
            raw.get("wet_detected", False)
        ),
    }


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
    """
    NEST System API 결과를 Arduino가 사용하기 쉬운
    단순 command packet으로 변환한다.
    """

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


def request_json(
    url: str,
    method: str = "GET",
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

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

    with urllib.request.urlopen(
        req,
        timeout=5,
    ) as response:
        return json.loads(
            response.read().decode("utf-8")
        )


def load_layout(
    api_base: str,
    room_json: Optional[str] = None,
    demo: str = "critical",
) -> Dict[str, Any]:

    if room_json:
        return json.loads(
            Path(room_json).read_text(
                encoding="utf-8"
            )
        )

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

    print(
        "NEST Bridge connected:",
        args.port,
        "@",
        args.baud,
        file=sys.stderr,
    )

    with serial.Serial(
        args.port,
        args.baud,
        timeout=1,
    ) as ser:

        time.sleep(2)

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

                raw_sensor = json.loads(line)

                result = analyze(
                    api_base=args.api,
                    layout=layout,
                    raw_sensor=raw_sensor,
                    buzzer_enabled=not args.buzzer_off,
                    buzzer_mode=args.buzzer_mode,
                )

                packet = device_packet(result)

                encoded = (
                    json.dumps(
                        packet,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    + "\n"
                )

                ser.write(
                    encoded.encode("utf-8")
                )

                print(
                    encoded.strip()
                )

            except (
                json.JSONDecodeError,
                KeyError,
                ValueError,
                urllib.error.URLError,
            ) as exc:
                print(
                    "BRIDGE ERROR:",
                    exc,
                    file=sys.stderr,
                )


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
        default=None,
    )

    parser.add_argument(
        "--baud",
        type=int,
        default=DEFAULT_BAUD,
    )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.mock:
        return run_mock(args)

    if not args.port:
        parser.error(
            "--port is required unless --mock is used"
        )

    return run_serial(args)


if __name__ == "__main__":
    raise SystemExit(main())
