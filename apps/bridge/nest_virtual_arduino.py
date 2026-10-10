"""
NEST Virtual Arduino
2026-10-10 이영준

Physical Arduino가 없어도 JSON-lines transport를 포함한
Bridge -> FastAPI -> Device packet E2E를 검증한다.

Python 3.9 compatible.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict


BRIDGE_PATH = (
    Path(__file__).resolve().parent
    / "nest_serial_bridge.py"
)


def sensor_frame(
    passage_cm: float = 100.0,
    low_light: bool = False,
    wet: bool = False,
) -> Dict[str, Any]:
    return {
        "passage_cm": passage_cm,
        "passage_min_cm": 80.0,
        "low_light_detected": low_light,
        "wet_detected": wet,
    }


def run_virtual_cycle(
    api_base: str,
    demo: str,
    frame: Dict[str, Any],
) -> Dict[str, Any]:
    command = [
        sys.executable,
        str(BRIDGE_PATH),
        "--stdio",
        "--api",
        api_base,
        "--demo",
        demo,
    ]

    process = subprocess.run(
        command,
        input=(
            json.dumps(
                frame,
                ensure_ascii=False,
                separators=(",", ":"),
            )
            + "\n"
        ),
        capture_output=True,
        text=True,
    )

    output_lines = [
        line.strip()
        for line in process.stdout.splitlines()
        if line.strip()
    ]

    if process.returncode != 0:
        raise RuntimeError(
            "bridge exited with {}: {}".format(
                process.returncode,
                process.stderr.strip(),
            )
        )

    if not output_lines:
        raise RuntimeError(
            "bridge produced no device packet. stderr={}".format(
                process.stderr.strip()
            )
        )

    result = json.loads(
        output_lines[-1]
    )

    if not isinstance(result, dict):
        raise RuntimeError(
            "device packet must be an object"
        )

    return result


def verify_field_expectation(
    demo: str,
    packet: Dict[str, Any],
) -> None:
    if demo == "critical":
        expected = {
            "overall": "danger",
            "led_color": "red",
            "buzzer": True,
            "critical_zones": 1,
        }
    else:
        expected = {
            "overall": "warning",
            "led_color": "yellow",
            "buzzer": False,
            "critical_zones": 0,
        }

    actual = {
        key: packet.get(key)
        for key in expected
    }

    if actual != expected:
        raise RuntimeError(
            "{} demo mismatch: expected={}, actual={}".format(
                demo,
                expected,
                actual,
            )
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Hardware-free NEST Virtual Arduino E2E"
        )
    )

    parser.add_argument(
        "--api",
        default="http://127.0.0.1:8000",
    )

    parser.add_argument(
        "--demo",
        choices=[
            "critical",
            "improved",
            "both",
        ],
        default="both",
    )

    parser.add_argument(
        "--passage-cm",
        type=float,
        default=100.0,
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
        "--no-verify",
        action="store_true",
    )

    return parser


def main() -> int:
    args = build_parser().parse_args()

    demos = (
        ["critical", "improved"]
        if args.demo == "both"
        else [args.demo]
    )

    frame = sensor_frame(
        passage_cm=args.passage_cm,
        low_light=args.low_light,
        wet=args.wet,
    )

    final = {}

    for demo in demos:
        packet = run_virtual_cycle(
            api_base=args.api,
            demo=demo,
            frame=frame,
        )

        if not args.no_verify:
            verify_field_expectation(
                demo,
                packet,
            )

        final[demo] = {
            "sensor": frame,
            "device": packet,
        }

    print(
        json.dumps(
            final,
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
