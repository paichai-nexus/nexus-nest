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
