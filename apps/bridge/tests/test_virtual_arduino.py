import importlib.util
from pathlib import Path

import pytest


SIM_PATH = (
    Path(__file__)
    .resolve()
    .parents[1]
    / "nest_virtual_arduino.py"
)

spec = importlib.util.spec_from_file_location(
    "nest_virtual_arduino",
    SIM_PATH,
)

sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)


def test_sensor_frame():
    assert sim.sensor_frame(
        passage_cm=55.5,
        low_light=True,
        wet=False,
    ) == {
        "passage_cm": 55.5,
        "passage_min_cm": 80.0,
        "low_light_detected": True,
        "wet_detected": False,
    }


@pytest.mark.parametrize(
    "demo,packet",
    [
        (
            "critical",
            {
                "overall": "danger",
                "led_color": "red",
                "buzzer": True,
                "critical_zones": 1,
            },
        ),
        (
            "improved",
            {
                "overall": "warning",
                "led_color": "yellow",
                "buzzer": False,
                "critical_zones": 0,
            },
        ),
    ],
)
def test_verify_field_expectation(
    demo,
    packet,
):
    sim.verify_field_expectation(
        demo,
        packet,
    )
