# NEXUS NEST

**AI-Based Kindergarten Classroom Spatial-Safety Diagnostic Service**  
Early Childhood Education × Computer Engineering × Game Engineering × Architecture

NEXUS NEST는 빈 교실의 공간정보를 바탕으로 **위험 가능성이 있는 위치를 후보로 표시하고, 교사가 배치 개선 전후를 검토하도록 돕는 도구**입니다. 공식 안전검사나 교사의 전문적 판단을 대체하지 않습니다.

## MVP v0.1

- 교실/가구/출입구 공통 JSON 데이터 계약
- 출입구 주변 대피동선 방해 후보 탐지
- 가구 사이 좁은 통로 후보 탐지
- 교사 시야 사각 후보 탐지(간단한 2D 선분 기반)
- 수동 모서리/돌출 위험 후보 표시
- 위험 후보 2D Web Overlay
- 현재 배치 ↔ 개선 배치 분석 API
- Unity 3D/Drag & Drop 결과와 연결 가능한 REST API

## Team

- **이영준 · Computer Engineering** — project/system/web/API integration
- **김승조 · Game Engineering** — 3D classroom, Drag & Drop, before/after interaction
- **박하음 · Architecture** — spatial layout, circulation, entrances, evacuation review
- **곽예람 · Early Childhood Education** — teacher interview, field validation, educational appropriateness

## Run

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

브라우저에서 `http://127.0.0.1:8000`을 연다. API 문서는 `http://127.0.0.1:8000/docs`.

### Windows PowerShell

```powershell
cd apps\api
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Test

```bash
cd apps/api
PYTHONPATH=. pytest -q
```

## Repository structure

```text
apps/api/      FastAPI + deterministic risk-candidate engine
web/           2D classroom/risk overlay MVP
contracts/     Unity/Web/API shared JSON contract + sample
/docs          architecture, API, field-validation notes
```

## 2026-10-13 Field Validation

실제 부속유치원 방문 후 샘플 공간과 임시 기준을 현장 데이터/교사 의견에 맞게 수정합니다. 초기 테스트에서는 유아 얼굴·이름·음성·행동영상 등 개인식별 자료를 수집하지 않습니다.
