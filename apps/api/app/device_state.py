from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Optional

from .models import LiveDeviceState, LiveDeviceUpdate


STALE_AFTER_SECONDS = 3.0

_lock = Lock()
_state: Optional[LiveDeviceState] = None


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

    state = LiveDeviceState(
        **update.model_dump(),
        received_at=received_at,
        stale=False,
        age_seconds=0.0,
    )

    with _lock:
        _state = state

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


def reset_live_device_state() -> None:
    global _state

    with _lock:
        _state = None
