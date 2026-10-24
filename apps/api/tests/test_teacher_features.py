from fastapi.testclient import TestClient
from app.call_state import reset_call_state
from app.main import app

client = TestClient(app)

def setup_function():
    reset_call_state()

def test_teacher_reason_priority_assignee_timestamps():
    created = client.post('/api/v1/calls',json={'room_id':'HM101','room_name':'HM101','reason':'안전 확인','severity':'DANGER','requester':'담임'} )
    assert created.status_code == 201
    call = created.json()['calls'][0]
    assert call['reason']=='안전 확인' and call['severity']=='DANGER'
    assert call['accepted_at'] is None
    for action,field in [('accept','accepted_at'),('respond','responding_at'),('complete','completed_at')]:
        result = client.post(f"/api/v1/calls/{call['id']}/transition",json={'action':action,'actor':'원장'})
        assert result.status_code == 200
        call = result.json()['calls'][0]
        assert call[field] is not None
    assert call['accepted_by']=='원장' and call['responding_by']=='원장'
    assert call['response_seconds'] >= 0

def test_teacher_page():
    response=client.get('/teacher')
    assert response.status_code == 200
    assert '교사 호출' in response.text
