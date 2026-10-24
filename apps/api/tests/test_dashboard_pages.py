from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_operations_dashboard_is_the_home_page():
    response = client.get("/")

    assert response.status_code == 200
    assert "NEXUS NEST · 원장실 통합 관제" in response.text
    assert "웹 호출 요청" in response.text
    assert "CAD·현장 사진 기반 근사 모델" in response.text
    assert 'data-floor="1"' in response.text
    assert 'data-floor="2"' in response.text
    assert 'data-floor="0"' in response.text
    assert 'id="buildingCanvas"' in response.text
    assert "/static/assets/paichai-university-logo.png" in response.text
    assert 'alt="배재대학교 PAI CHAI UNIVERSITY"' in response.text


def test_spatial_analysis_is_preserved_as_separate_page():
    response = client.get("/analysis")

    assert response.status_code == 200
    assert "현장 교실 RoomLayout 입력" in response.text
    assert "현장검증 반영 통합 안전진단" in response.text
    assert "원장실 통합 관제로 돌아가기" in response.text


def test_dashboard_assets_are_served():
    javascript = client.get("/static/dashboard-isometric.js")
    building_javascript = client.get("/static/dashboard-building.js")
    dashboard_bundle = client.get("/static/dashboard-app.js")
    stylesheet = client.get("/static/dashboard-v2.css")
    isometric_styles = client.get("/static/dashboard-isometric.css")
    university_logo = client.get("/static/assets/paichai-university-logo.png")
    three_module = client.get("/static/vendor/three/three.module.min.js")
    orbit_controls = client.get("/static/vendor/three/OrbitControls.js")

    assert javascript.status_code == 200
    assert "pollCalls" in javascript.text
    assert "NexusBuildingMap" in javascript.text
    assert "sensor_state" in javascript.text
    assert "근접 주의" in javascript.text
    assert building_javascript.status_code == 200
    assert all(room_id in building_javascript.text for room_id in ["HM101", "HM106", "HM201", "HM214"])
    assert "OrbitControls" in building_javascript.text
    assert dashboard_bundle.status_code == 200
    assert "WebGLRenderer" in dashboard_bundle.text
    assert stylesheet.status_code == 200
    assert ".workspace" in stylesheet.text
    assert isometric_styles.status_code == 200
    assert ".map-stage" in isometric_styles.text
    assert university_logo.status_code == 200
    assert university_logo.headers["content-type"] == "image/png"
    assert three_module.status_code == 200
    assert orbit_controls.status_code == 200
