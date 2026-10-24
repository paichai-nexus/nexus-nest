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

브라우저에서 `http://127.0.0.1:8000`을 열면 원장실 통합 관제
대시보드가 표시됩니다. 기존 RoomLayout 편집과 공간안전 분석 도구는
`http://127.0.0.1:8000/analysis`, API 문서는
`http://127.0.0.1:8000/docs`에서 확인합니다.

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

## Arduino UNO 실측 거리 연동

현재 검증된 실물 입력은 Arduino UNO + HC-SR04의 다음 텍스트 프레임입니다.

```text
NEXUS NEST SENSOR READY
DISTANCE:11.2
DISTANCE:OUT_OF_RANGE
```

API 서버와 Serial Bridge를 각각 실행합니다.

```bash
# Terminal 1 — API + dashboard
cd /Users/gamjeong/nexus-nest/apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --reload --port 8000

# Terminal 2 — discover and verify the current Arduino serial port
cd /Users/gamjeong/nexus-nest
source /Users/gamjeong/NEXUS_NEST_Hardware/.venv/bin/activate
ls /dev/cu.usbserial-* /dev/cu.usbmodem-* 2>/dev/null

# Example only: use the port printed by the command above.
export NEST_SERIAL_PORT=/dev/cu.usbserial-110
test -e "$NEST_SERIAL_PORT"
python apps/bridge/nest_serial_bridge.py \
  --port "$NEST_SERIAL_PORT" \
  --baud 9600 \
  --room-id HM101 \
  --distance-attention-cm 20 \
  --api http://127.0.0.1:8000
```

`apps/api/.venv`가 이미 준비되어 있으면 Terminal 1의 가상환경 생성과
패키지 설치 명령은 생략할 수 있습니다. 하드웨어용 가상환경은 Serial
Bridge 실행에 사용합니다.

macOS 장치 이름은 재연결 시 바뀔 수 있으므로 포트를 고정값으로 가정하지
않습니다. Bridge 실행 전 위 검색 명령으로 현재 포트를 확인해야 합니다.
포트는 `--port` 또는 환경 변수로 지정하고 baud 등은 환경 변수로도 변경할
수 있습니다.

```bash
# 현재 연결에서 확인한 값을 사용합니다. 아래 값은 2026-10-24 확인 예시입니다.
export NEST_SERIAL_PORT=/dev/cu.usbserial-110
export NEST_SERIAL_BAUD=9600
export NEST_API_BASE=http://127.0.0.1:8000
export NEST_ROOM_ID=HM101
export NEST_DISTANCE_ATTENTION_CM=20
python apps/bridge/nest_serial_bridge.py
```

웹 대시보드는 `http://127.0.0.1:8000`에서 실측/시뮬레이션 여부,
최근 수신 시각, 데이터 지연, 측정 범위 밖 상태를 구분해 표시합니다.
HC-SR04 거리값은 별도 센서 이벤트이며 그 자체를 어린이 안전 위험으로
판정하지 않습니다. 기존 JSON-lines Bridge 입력은 하위 호환을 위해 유지됩니다.

`--distance-attention-cm`은 메이커톤 근접 시연을 위한 임시 임계값이며
공식 안전기준이 아닙니다. 기본값 20cm 이하에서는 지정 교실 마커가
`근접 주의`로 바뀌고, 임계값보다 멀어지거나 `OUT_OF_RANGE`가 수신되면
정상 표시로 돌아옵니다. 원본 측정 상태는 `measurement_status`에 그대로
보존됩니다.

센서 최신 상태와 최근 이력은 다음 API로 확인합니다.

```text
GET /api/v1/device/live
GET /api/v1/sensor-events?room_id=HM101&limit=50
```

## 교직원 웹 호출

통합 관제 대시보드의 `웹 호출 요청`에서 교직원 도움 요청을 만들고
`요청 → 수락 → 대응 중 → 완료` 순서로 처리할 수 있습니다. 서버는 중복
요청과 잘못된 상태 전이를 거절합니다. 호출 상태는 현재 FastAPI 프로세스의
메모리에 보관되므로 서버 재시작 시 초기화됩니다.

```text
GET  /api/v1/calls
POST /api/v1/calls
POST /api/v1/calls/{call_id}/transition
```

## CAD 기반 Three.js 교실 지도

통합 관제 화면은 CAD와 현장 사진을 참고한 Three.js 근사 모델로 1층과
2층을 표시합니다. 실측 치수 모델이나 Unity 결과물은 아니며, 교실 마커는
호출 API와 센서 최신 상태에 연결됩니다. Serial Bridge의 `--room-id`가
지도 교실 ID(`HM101`~`HM214`)와 일치할 때만 해당 교실에 센서 상태가
표시됩니다. 호출 상태가 있으면 호출 표시가 센서 표시보다 우선합니다.

메이커톤 현장 실행과 복구 순서는
[`docs/makerthon-demo-runbook.md`](docs/makerthon-demo-runbook.md)를 참고합니다.

## Repository structure

```text
apps/api/      FastAPI + deterministic risk-candidate engine
web/           2D classroom/risk overlay MVP
contracts/     Unity/Web/API shared JSON contract + sample
/docs          architecture, API, field-validation notes
```

## 2026-10-13 Field Validation

실제 부속유치원 방문 후 샘플 공간과 임시 기준을 현장 데이터/교사 의견에 맞게 수정합니다. 초기 테스트에서는 유아 얼굴·이름·음성·행동영상 등 개인식별 자료를 수집하지 않습니다.
