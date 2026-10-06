# NEXUS NEST MVP Architecture

## 역할 분리

- **Web / API (이영준)**: 공간 데이터 계약, 위험 후보 분석, 결과 시각화, 시스템 통합
- **Unity / 3D (김승조)**: 교실 3D 모델, 가구 Drag & Drop, 현재/개선 배치 인터랙션
- **Space rule input (박하음)**: 실제 통로·출입구·가구 배치·피난 관점의 기준 검토
- **Field validation (곽예람)**: 교사 인터뷰, 유아교육 현장 적합성, 위험 기준의 실제성 검증

## 데이터 흐름

```text
빈 교실 사진 / 평면도 / 현장 측정
        ↓
RoomLayout JSON (cm 단위)
        ↓
Rule-based Risk Candidate Engine
        ↓
위험 후보 + 근거 + 위치
        ↓
Web 2D Overlay / Unity 3D Visualization
        ↓
교사 검토
        ↓
Current ↔ Proposed Layout 비교
```

## 원칙

1. 지금 단계에서 AI가 공식 안전판정을 하지 않는다.
2. 위험 후보마다 `explanation`과 `evidence`를 제공한다.
3. 실제 수치 기준은 10/13 현장 확인과 교사·건축 관점 검토 후 수정한다.
4. Unity와 Web이 같은 `RoomLayout` JSON 계약을 사용한다.
5. 아동 개인 데이터는 MVP 입력에 포함하지 않는다.
