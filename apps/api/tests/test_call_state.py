from fastapi.testclient import TestClient

from app.call_state import reset_call_state
from app.main import app


client = TestClient(app)


def setup_function():
    reset_call_state()


def request_call():
    return client.post(
        "/api/v1/calls",
        json={
            "room_id": "room-1",
            "room_name": "테스트 교실",
            "requester": "요청 교사",
        },
    )


def test_call_flow_request_accept_respond_complete():
    created = request_call()
    assert created.status_code == 201
    call = created.json()["calls"][0]
    assert call["status"] == "requested"

    for action, expected in [
        ("accept", "accepted"),
        ("respond", "responding"),
        ("complete", "completed"),
    ]:
        response = client.post(
            f"/api/v1/calls/{call['id']}/transition",
            json={"action": action, "actor": "지원 교사"},
        )
        assert response.status_code == 200
        assert response.json()["calls"][0]["status"] == expected

    snapshot = client.get("/api/v1/calls").json()
    assert snapshot["summary"] == {
        "requested": 0,
        "active": 0,
        "completed": 1,
        "total": 1,
    }
    assert [event["type"] for event in snapshot["events"]] == [
        "completed",
        "responding",
        "accepted",
        "requested",
    ]


def test_duplicate_active_call_is_rejected():
    assert request_call().status_code == 201
    duplicate = request_call()

    assert duplicate.status_code == 409
    assert "완료되지 않은 호출" in duplicate.json()["detail"]


def test_distinct_rooms_can_have_concurrent_calls():
    assert request_call().status_code == 201
    second = client.post(
        "/api/v1/calls",
        json={
            "room_id": "room-2",
            "room_name": "두 번째 교실",
            "requester": "다른 교사",
        },
    )

    assert second.status_code == 201
    assert second.json()["summary"] == {
        "requested": 2,
        "active": 0,
        "completed": 0,
        "total": 2,
    }


def test_invalid_transition_is_rejected():
    created = request_call().json()["calls"][0]
    response = client.post(
        f"/api/v1/calls/{created['id']}/transition",
        json={"action": "complete", "actor": "지원 교사"},
    )

    assert response.status_code == 409
    assert "허용되지 않습니다" in response.json()["detail"]


def test_unknown_call_is_not_found():
    response = client.post(
        "/api/v1/calls/missing/transition",
        json={"action": "accept", "actor": "지원 교사"},
    )

    assert response.status_code == 404
