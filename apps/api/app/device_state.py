from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Optional
from uuid import uuid4

from .models import (
    LiveDeviceState,
    LiveDeviceUpdate,
    SensorEvent,
    SensorEventSnapshot,
)


STALE_AFTER_SECONDS = 3.0
DEFAULT_DISTANCE_ATTENTION_CM = 20.0
MAX_SENSOR_EVENTS = 100

_lock = Lock()
_state: Optional[LiveDeviceState] = None
_events: list[SensorEvent] = []


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _age_seconds(received_at: Optional[str]) -> Optional[float]:
    if not received_at:
        return None

    try:
        then = datetime.fromisoformat(
            received_at.replace("Z", "+00:00")
        )
    except ValueError:
        return None

    return max(
        0.0,
        (_now() - then).total_seconds(),
    )


def update_live_device(
    update: LiveDeviceUpdate,
) -> LiveDeviceState:
    global _state

    received_at = (
        _now()
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )

    payload = update.model_dump()
    sensor_type = update.sensor_type

    if (
        sensor_type is None
        and update.sensor is not None
        and (
            update.sensor.passage_cm is not None
            or update.measurement_status == "out_of_range"
        )
    ):
        sensor_type = "hc_sr04"

    sensor_state = update.sensor_state
    threshold = (
        update.attention_threshold_cm
        or DEFAULT_DISTANCE_ATTENTION_CM
    )

    if sensor_state is None and sensor_type == "hc_sr04":
        distance = (
            update.sensor.passage_cm
            if update.sensor is not None
            else None
        )
        if update.measurement_status == "out_of_range":
            sensor_state = "normal"
        elif distance is None:
            sensor_state = "unavailable"
        elif distance <= threshold:
            sensor_state = "attention"
        else:
            sensor_state = "normal"

    payload.update(
        {
            "sensor_type": sensor_type,
            "sensor_state": sensor_state,
            "attention_threshold_cm": (
                threshold if sensor_type == "hc_sr04" else None
            ),
        }
    )

    state = LiveDeviceState(
        **payload,
        received_at=received_at,
        stale=False,
        age_seconds=0.0,
    )

    with _lock:
        _state = state
        if (
            state.room_id
            and state.sensor_type
            and state.sensor_state
            and state.measurement_status
            and state.sensor is not None
        ):
            value = state.sensor.passage_cm
            _events.insert(
                0,
                SensorEvent(
                    id=str(uuid4()),
                    room_id=state.room_id,
                    sensor_type=state.sensor_type,
                    measurement_value=value,
                    unit=(
                        "cm"
                        if state.sensor_type == "hc_sr04"
                        else None
                    ),
                    measurement_status=state.measurement_status,
                    sensor_state=state.sensor_state,
                    simulated=state.simulated,
                    transport=state.transport,
                    created_at=_now(),
                ),
            )
            del _events[MAX_SENSOR_EVENTS:]

    return state


def get_live_device() -> LiveDeviceState:
    with _lock:
        current = _state

    if current is None:
        return LiveDeviceState(
            transport="none",
            simulated=False,
            bridge_connected=False,
            arduino_connected=False,
            room_id=None,
            sensor=None,
            device=None,
            error=None,
            received_at=None,
            stale=True,
            age_seconds=None,
        )

    age = _age_seconds(current.received_at)
    stale = (
        age is None
        or age > STALE_AFTER_SECONDS
    )

    return current.model_copy(
        update={
            "stale": stale,
            "age_seconds": age,
        }
    )


def get_sensor_events(
    room_id: Optional[str] = None,
    limit: int = 50,
) -> SensorEventSnapshot:
    with _lock:
        filtered = [
            event
            for event in _events
            if room_id is None or event.room_id == room_id
        ]

    return SensorEventSnapshot(
        events=filtered[:limit],
        total=len(filtered),
    )


def reset_live_device_state() -> None:
    global _state

    with _lock:
        _state = None
        _events.clear()
