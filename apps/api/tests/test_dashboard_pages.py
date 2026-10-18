from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_operations_dashboard_is_the_home_page():
    response = client.get("/")

    assert response.status_code == 200
    assert "NEXUS NEST · 원장실 통합 관제" in response.text
    assert "웹 호출 요청" in response.text
    assert "실제 3D 모델 미보유" in response.text
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
    stylesheet = client.get("/static/dashboard-v2.css")
    isometric_styles = client.get("/static/dashboard-isometric.css")
    map_asset = client.get("/static/assets/kindergarten-isometric-demo.png")
    university_logo = client.get("/static/assets/paichai-university-logo.png")

    assert javascript.status_code == 200
    assert "pollCalls" in javascript.text
    assert all(name in javascript.text for name in ["햇살반", "별님반", "달님반", "무지개반"])
    assert stylesheet.status_code == 200
    assert ".workspace" in stylesheet.text
    assert isometric_styles.status_code == 200
    assert ".map-stage" in isometric_styles.text
    assert map_asset.status_code == 200
    assert map_asset.headers["content-type"] == "image/png"
    assert university_logo.status_code == 200
    assert university_logo.headers["content-type"] == "image/png"
