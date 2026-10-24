from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from .models import (
    CallCreateRequest,
    CallStatus,
    CallTransitionRequest,
    StaffCall,
    StaffCallEvent,
    StaffCallSnapshot,
)


class CallStateError(ValueError):
    pass


_lock = Lock()
_calls: dict[str, StaffCall] = {}
_events: list[StaffCallEvent] = []


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _event(call: StaffCall, event_type: str, actor: str | None) -> None:
    _events.append(
        StaffCallEvent(
            id=str(uuid4()),
            call_id=call.id,
            room_id=call.room_id,
            room_name=call.room_name,
            type=event_type,
            event_type=call.event_type,
            severity=call.severity,
            source=call.source,
            actor=actor,
            created_at=_now(),
        )
    )


def _snapshot() -> StaffCallSnapshot:
    calls = sorted(_calls.values(), key=lambda item: item.updated_at, reverse=True)
    events = sorted(_events, key=lambda item: item.created_at, reverse=True)
    summary = {
        "requested": sum(item.status == CallStatus.REQUESTED for item in calls),
        "active": sum(
            item.status in {CallStatus.ACCEPTED, CallStatus.RESPONDING}
            for item in calls
        ),
        "completed": sum(item.status == CallStatus.COMPLETED for item in calls),
        "total": len(calls),
    }
    return StaffCallSnapshot(calls=calls, events=events, summary=summary)


def get_calls() -> StaffCallSnapshot:
    with _lock:
        return _snapshot()


def create_call(payload: CallCreateRequest) -> StaffCallSnapshot:
    now = _now()
    call = StaffCall(
        id=str(uuid4()),
        room_id=payload.room_id,
        room_name=payload.room_name,
        requester=payload.requester,
        event_type=payload.event_type,
        severity=payload.severity,
        source=payload.source,
        source_event_id=payload.event_id,
        status=CallStatus.REQUESTED,
        created_at=now,
        updated_at=now,
    )
    with _lock:
        if payload.event_id:
            duplicate_event = next(
                (item for item in _calls.values()
                 if item.source_event_id == payload.event_id
                 and item.source == payload.source),
                None,
            )
            if duplicate_event is not None:
                return _snapshot()
        duplicate = any(
            item.room_id == payload.room_id
            and item.status != CallStatus.COMPLETED
            for item in _calls.values()
        )
        if duplicate:
            raise CallStateError("해당 교실에 완료되지 않은 호출이 이미 있습니다.")
        _calls[call.id] = call
        _event(call, "requested", payload.requester)
        return _snapshot()


def transition_call(
    call_id: str,
    payload: CallTransitionRequest,
) -> StaffCallSnapshot:
    transitions = {
        (CallStatus.REQUESTED, "accept"): CallStatus.ACCEPTED,
        (CallStatus.ACCEPTED, "respond"): CallStatus.RESPONDING,
        (CallStatus.RESPONDING, "complete"): CallStatus.COMPLETED,
    }
    event_types = {
        "accept": "accepted",
        "respond": "responding",
        "complete": "completed",
    }

    with _lock:
        current = _calls.get(call_id)
        if current is None:
            raise KeyError(call_id)

        next_status = transitions.get((current.status, payload.action))
        if next_status is None:
            raise CallStateError(
                f"{current.status.value} 상태에서 {payload.action} 전이는 허용되지 않습니다."
            )

        now = _now()
        update = {
            "status": next_status,
            "updated_at": now,
        }
        if payload.action == "accept":
            update["accepted_by"] = payload.actor
        if payload.action == "complete":
            update["completed_at"] = now

        changed = current.model_copy(update=update)
        _calls[call_id] = changed
        _event(changed, event_types[payload.action], payload.actor)
        return _snapshot()


def reset_call_state() -> None:
    with _lock:
        _calls.clear()
        _events.clear()
