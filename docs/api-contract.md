# API Contract v0.1

## GET `/api/health`
서비스 상태 확인.

## GET `/api/v1/demo/room`
샘플 교실 JSON 반환.

## POST `/api/v1/analyze`
`RoomLayout`을 입력받아 위험 후보를 반환.

현재 규칙:
- 출입구 주변 확보영역 침범 → evacuation
- 가구 사이 여유 폭 부족 → movement
- 교사 시야선 차단 후보 → blind_spot
- 수동 표시된 돌출/모서리 속성 → collision

> 기준값은 임시값이다. 10/13 현장 확인 후 조정한다.

## POST `/api/v1/compare`
현재 배치와 개선 배치를 각각 분석하고 위험 후보 개수 차이를 반환.

### Unity 연동
Unity에서 가구 이동 후 동일한 JSON 구조로 현재/개선 배치를 직렬화하여 `/api/v1/compare`로 전송하면 된다.

## GET `/api/v1/device/live`

Serial Bridge가 마지막으로 게시한 장치·센서 상태를 반환한다.

주요 필드:

- `room_id`: 대시보드 교실 ID. 예: `HM101`
- `transport`: `serial`, `stdio`, `mock`, `none`
- `simulated`: 실제 입력은 `false`, 가상 입력은 `true`
- `bridge_connected`, `arduino_connected`: 연결 상태
- `sensor_type`: 현재 실물 검증 센서는 `hc_sr04`
- `measurement_status`: `ok`, `out_of_range`, `unavailable`
- `sensor_state`: `normal`, `attention`, `unavailable`
- `attention_threshold_cm`: 근접 시연 임계값. 공식 안전기준 아님
- `received_at`, `stale`, `age_seconds`: 마지막 수신 및 지연 상태

`sensor_state=attention`은 HC-SR04 근접 시연 이벤트이며 어린이 안전 위험
판정이나 공간안전 분석 결과를 뜻하지 않는다.

## POST `/api/v1/device/live`

Serial Bridge가 최신 상태를 게시한다. 기존 필드는 유지되며
`sensor_type`, `sensor_state`, `attention_threshold_cm`은 선택 필드라서
기존 Bridge 클라이언트와 호환된다.

## GET `/api/v1/sensor-events`

최근 센서 이벤트를 최신순으로 반환한다. 서버 메모리에 최대 100개를
보관하며 재시작 시 초기화된다.

쿼리:

- `room_id` (선택): 특정 교실만 조회
- `limit` (기본 50, 최대 100): 반환 개수

Unity 예시:

```text
GET /api/v1/sensor-events?room_id=HM101&limit=20
```

## 교직원 호출 API

```text
GET  /api/v1/calls
POST /api/v1/calls
POST /api/v1/calls/{call_id}/transition
```

호출 상태는 `requested → accepted → responding → completed` 순서이며,
중복 활성 호출과 잘못된 전이는 `409`로 거절된다. 호출 데이터는 현재
서버 프로세스 메모리에 보관되어 재시작 시 초기화된다.

## Unity 협업 원칙

- Unity는 `RoomLayout` 분석·비교 API와 위 조회 API만 사용한다.
- 웹과 Unity 모두 교실 ID를 `HM101`~`HM214` 형식으로 맞춘다.
- 센서 `attention`은 공간안전 `RiskCandidate`와 별도 상태로 표시한다.
- Unity 폴더의 코드와 자산은 Unity 담당자 브랜치에서 관리한다.
