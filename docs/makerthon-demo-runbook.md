# NEXUS NEST 메이커톤 현장 시연 Runbook

## 검증 범위

실물 검증 대상은 Arduino UNO, HC-SR04, macOS USB Serial,
FastAPI, 원장실 웹 대시보드다. 사운드 센서, 네오픽셀, LCD, 부저,
Wi-Fi, Unity 실시간 연동은 연결·검증 전이면 완료로 보고하지 않는다.

## 실행

터미널 1:

```bash
cd /Users/gamjeong/nexus-nest/apps/api
source .venv/bin/activate
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

터미널 2:

```bash
cd /Users/gamjeong/nexus-nest
source /Users/gamjeong/NEXUS_NEST_Hardware/.venv/bin/activate

# USB를 연결할 때마다 현재 포트를 다시 확인한다.
ls /dev/cu.usbserial-* /dev/cu.usbmodem-* 2>/dev/null

# 현재 확인값은 /dev/cu.usbserial-110이지만 출력 결과를 우선한다.
export NEST_SERIAL_PORT=/dev/cu.usbserial-110
test -e "$NEST_SERIAL_PORT"
python apps/bridge/nest_serial_bridge.py \
  --port "$NEST_SERIAL_PORT" \
  --baud 9600 \
  --room-id HM101 \
  --distance-attention-cm 20 \
  --api http://127.0.0.1:8000
```

브라우저:

```text
http://127.0.0.1:8000/
```

## 시연 순서

1. 대시보드에서 서버 정상, Arduino 연결, `REAL · SERIAL`을 확인한다.
2. HM101을 선택한다.
3. HC-SR04 앞 물체를 20cm 이내로 이동한다.
4. 거리값, 센서 이벤트, HM101 `근접 주의` 표시를 확인한다.
5. 물체를 20cm 밖으로 이동하거나 측정 범위 밖으로 치운다.
6. HM101이 `센서 정상`으로 돌아오는지 확인한다.
7. 웹 호출을 생성하고 `요청 → 수락 → 대응 중 → 완료`를 별도로 시연한다.

근접 임계값은 발표 환경에 맞춘 임시값이며 공식 안전기준이 아니다.

## 빠른 확인

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/v1/device/live
curl 'http://127.0.0.1:8000/api/v1/sensor-events?room_id=HM101&limit=10'
```

## 장애 대응

- 포트 없음: USB를 다시 연결하고 `ls /dev/cu.usbserial-* /dev/cu.usbmodem-* 2>/dev/null`로 현재 포트를 확인한다. 번호는 고정값이 아니다.
- 포트 사용 중: Arduino Serial Monitor를 닫고 Bridge 재실행
- 장치 오프라인: USB 케이블 재연결 후 2초 이상 대기
- 데이터 지연: API와 Bridge 프로세스가 모두 실행 중인지 확인
- 대시보드가 이전 화면: 강력 새로고침 또는 쿼리 문자열 변경

## Unity 담당자 공유 API

- 공간: `GET /api/v1/demo/field-critical`, `POST /api/v1/analyze`,
  `POST /api/v1/compare`
- 센서: `GET /api/v1/device/live`, `GET /api/v1/sensor-events`
- 호출: `GET /api/v1/calls`

Unity는 조회 연동부터 시작하고, 센서 `attention`을 공간안전 위험 판정으로
변환하지 않는다. 세부 계약은 `docs/api-contract.md`를 따른다.
