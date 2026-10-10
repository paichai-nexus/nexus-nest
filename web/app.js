let currentRoom = null;
let proposedRoom = null;
let room = null;
let risks = [];
let criticalZones = [];
let movedFurnitureIds = new Set();

const canvas = document.getElementById('roomCanvas');
const ctx = canvas.getContext('2d');

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

function setImportStatus(message, isError = false) {
  const el = document.getElementById('importStatus');
  el.textContent = message;
  el.classList.toggle('error-text', isError);
}

async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

async function validateRoomLayout(candidate) {
  await requestJson('/api/v1/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(candidate)
  });

  return candidate;
}

function refreshLayoutButtons() {
  document.getElementById('currentBtn').disabled = !currentRoom;
  document.getElementById('proposedBtn').disabled = !proposedRoom;
}

function rectChanged(a, b) {
  if (!a || !b) return false;

  return (
    a.x !== b.x ||
    a.y !== b.y ||
    a.width !== b.width ||
    a.height !== b.height
  );
}

function updateMovedFurnitureIds() {
  movedFurnitureIds = new Set();

  if (!currentRoom || !proposedRoom) return;

  const currentById = new Map(
    currentRoom.furniture.map(item => [item.id, item])
  );

  for (const proposed of proposedRoom.furniture) {
    const current = currentById.get(proposed.id);

    if (current && rectChanged(current.rect, proposed.rect)) {
      movedFurnitureIds.add(proposed.id);
    }
  }
}

function drawRoom() {
  if (!room) return;

  canvas.width = room.width_cm;
  canvas.height = room.height_cm;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fbfaf4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#3f4c59';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

  // Doors + clearance zones
  for (const door of room.doors) {
    const r = door.rect;
    const c = room.exit_clearance_cm;

    ctx.fillStyle = 'rgba(230,126,34,.10)';
    ctx.fillRect(
      Math.max(0, r.x - c),
      Math.max(0, r.y - c),
      r.width + c * 2,
      r.height + c * 2
    );

    ctx.fillStyle = '#e67e22';
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }

  // Furniture
  for (const item of room.furniture) {
    const r = item.rect;

    ctx.fillStyle = item.blocks_view ? '#566573' : '#85929e';
    ctx.fillRect(r.x, r.y, r.width, r.height);

    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(item.name, r.x + 8, r.y + 24);

    // Improved layout: clearly show furniture that moved
    if (
      proposedRoom &&
      room &&
      room.id === proposedRoom.id &&
      movedFurnitureIds.has(item.id)
    ) {
      ctx.save();

      ctx.strokeStyle = '#1f9d63';
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 8]);

      ctx.strokeRect(
        r.x - 5,
        r.y - 5,
        r.width + 10,
        r.height + 10
      );

      ctx.setLineDash([]);
      ctx.fillStyle = '#1f9d63';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(
        '이동',
        r.x,
        Math.max(18, r.y - 12)
      );

      ctx.restore();
    }
  }

  // Teacher positions
  for (const p of room.teacher_positions || []) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#2f6fed';
    ctx.fill();

    ctx.fillStyle = '#2f6fed';
    ctx.font = '16px sans-serif';
    ctx.fillText('교사', p.x + 16, p.y + 5);
  }

  // Observation points
  for (const p of room.observation_points || []) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#8e44ad';
    ctx.fill();
  }

  // Risk candidates
  for (const risk of risks) {
    const p = risk.location;

    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);

    ctx.fillStyle =
      risk.severity === 'high'
        ? 'rgba(231,76,60,.88)'
        : 'rgba(243,156,18,.88)';

    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', p.x, p.y + 6);
    ctx.textAlign = 'start';
  }

  // Field validation CORE:
  // blind spot × collision Critical Zone
  for (const zone of criticalZones) {
    const p = zone.location;

    ctx.save();

    ctx.beginPath();
    ctx.arc(
      p.x,
      p.y,
      42,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = 'rgba(192,57,43,.12)';
    ctx.fill();

    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 6;
    ctx.setLineDash([10, 7]);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';

    ctx.fillText(
      'CRITICAL',
      p.x,
      p.y - 50
    );

    ctx.restore();
  }
}

function renderResult(result) {
  risks = result.risks;

  const s = result.summary;

  document.getElementById('status').textContent =
    `후보 ${s.total}건`;

  document.getElementById('summary').innerHTML = `
    <div class="metric">
      <strong>${s.total}</strong>
      <span>전체 위험 후보</span>
    </div>
    <div class="metric">
      <strong>${s.high}</strong>
      <span>높음</span>
    </div>
    <div class="metric">
      <strong>${s.medium}</strong>
      <span>중간</span>
    </div>
    <div class="metric">
      <strong>${s.low}</strong>
      <span>낮음</span>
    </div>
  `;

  document.getElementById('riskList').innerHTML =
    risks.length
      ? risks.map(r => `
        <article class="risk-item ${r.severity}">
          <h3>${r.title}</h3>
          <p>${r.explanation}</p>
        </article>
      `).join('')
      : '<p class="muted">현재 규칙 기준 위험 후보가 없습니다.</p>';

  drawRoom();
}

function renderCompareBanner(result) {
  const current = result.current.summary;
  const proposed = result.proposed.summary;
  const delta = proposed.total - current.total;
  const deltaText =
    delta < 0
      ? `위험 후보 ${Math.abs(delta)}건 감소`
      : delta > 0
        ? `위험 후보 ${delta}건 증가`
        : '위험 후보 변화 없음';

  document.getElementById('compareBanner').innerHTML = `
    <div>
      <span class="compare-label">LAYOUT COMPARISON</span>
      <strong>
        현재 ${current.total}건
        →
        개선 ${proposed.total}건
      </strong>
    </div>
    <div class="compare-delta">
      ${deltaText} · HIGH ${current.high} → ${proposed.high}
    </div>
  `;
}

function renderComparisonPending() {
  document.getElementById('compareBanner').innerHTML = `
    <div>
      <span class="compare-label">FIELD DATA</span>
      <strong>현재 배치가 준비되었습니다.</strong>
    </div>
    <div class="compare-delta neutral">
      개선 배치 JSON을 불러오면 Before ↔ After 비교가 활성화됩니다.
    </div>
  `;
}

async function loadFieldValidationDemo() {
  const button =
    document.getElementById('loadFieldDemoBtn');

  button.disabled = true;
  button.textContent = '현장검증 데이터 불러오는 중...';

  try {
    const [critical, improved] =
      await Promise.all([
        requestJson(
          '/api/v1/demo/field-critical'
        ),
        requestJson(
          '/api/v1/demo/field-improved'
        )
      ]);

    currentRoom = critical;
    proposedRoom = improved;

    document.getElementById(
      'passageCm'
    ).value = 100;

    document.getElementById(
      'lowLightDetected'
    ).checked = false;

    document.getElementById(
      'wetDetected'
    ).checked = false;

    document.getElementById(
      'buzzerEnabled'
    ).checked = true;

    document.getElementById(
      'buzzerMode'
    ).value = 'critical_only';

    setImportStatus(
      '현장검증 시연 데이터 사용 중'
    );

    await refreshComparison();
    await selectLayout('current');
    await analyzeNestSystem();

    button.textContent =
      '현장검증 시연 로드 완료';

  } catch (error) {
    console.error(error);

    button.textContent =
      '현장검증 시연 불러오기';

    alert(
      `현장검증 시연 데이터를 불러오지 못했습니다.\n\n${error.message}`
    );
  } finally {
    button.disabled = false;
  }
}


async function refreshComparison() {
  updateMovedFurnitureIds();
  refreshLayoutButtons();

  if (!currentRoom || !proposedRoom) {
    renderComparisonPending();
    return;
  }

  const comparison = await requestJson('/api/v1/compare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      current: currentRoom,
      proposed: proposedRoom
    })
  });

  renderCompareBanner(comparison);
}

function setActiveButton(kind) {
  document
    .getElementById('currentBtn')
    .classList.toggle('active', kind === 'current');

  document
    .getElementById('proposedBtn')
    .classList.toggle('active', kind === 'proposed');
}

async function analyzeRoom(targetRoom) {
  document.getElementById('status').textContent = '분석 중';

  const result = await requestJson('/api/v1/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(targetRoom)
  });

  renderResult(result);
}

async function selectLayout(kind) {
  const target = kind === 'proposed'
    ? proposedRoom
    : currentRoom;

  if (!target) return;

  room = target;
  risks = [];

  setActiveButton(kind);

  document.getElementById('roomName').textContent =
    room.name;

  drawRoom();

  await analyzeRoom(room);
}

async function importLayout(kind, file) {
  if (!file) return;

  try {
    setImportStatus(`${file.name} 확인 중...`);

    const candidate = await readJsonFile(file);
    await validateRoomLayout(candidate);

    if (kind === 'current') {
      currentRoom = candidate;
      // 실제 현장 현재 배치를 불러오면 데모 개선안과의 잘못된 비교를 막는다.
      proposedRoom = null;
    } else {
      proposedRoom = candidate;
    }

    await refreshComparison();
    await selectLayout(kind);

    setImportStatus(`${file.name} 불러오기 완료`);
  } catch (error) {
    console.error(error);
    setImportStatus(`불러오기 실패: ${file.name}`, true);
    alert(`RoomLayout JSON을 확인해주세요.\n\n${error.message}`);
  }
}


function featurePriority(key) {
  if (
    key === 'blind_spot' ||
    key === 'collision'
  ) {
    return {
      label: 'CORE',
      className: 'core'
    };
  }

  if (
    key === 'passage' ||
    key === 'evacuation'
  ) {
    return {
      label: 'SUPPORT',
      className: 'support'
    };
  }

  return {
    label: 'EXPERIMENTAL',
    className: 'experimental'
  };
}


function renderCriticalZones(result) {
  criticalZones =
    result.critical_zones || [];

  const count =
    document.getElementById(
      'criticalZoneCount'
    );

  count.textContent =
    `${criticalZones.length} ZONE`;

  const panel =
    document.getElementById(
      'criticalZonePanel'
    );

  if (criticalZones.length === 0) {
    panel.innerHTML = `
      <p class="muted">
        시야 사각과 충돌 위험이 결합된
        Critical Zone이 없습니다.
      </p>
    `;

    drawRoom();
    return;
  }

  panel.innerHTML =
    criticalZones.map(zone => `
      <article class="critical-zone-card">
        <div class="critical-zone-card-head">
          <strong>
            ${zone.title}
          </strong>
          <span>CRITICAL</span>
        </div>

        <p>
          ${zone.explanation}
        </p>

        <small>
          위험 후보 간 거리
          ${zone.distance_cm}cm
        </small>
      </article>
    `).join('');

  drawRoom();
}


function severityText(severity) {
  if (severity === 'high') return 'HIGH';
  if (severity === 'medium') return 'MEDIUM';
  if (severity === 'low') return 'LOW';
  return 'SAFE';
}

function sourceText(sources) {
  if (!sources || sources.length === 0) {
    return '현재 위험 없음';
  }

  return sources
    .map(source => (
      source === 'spatial'
        ? '공간분석'
        : '센서'
    ))
    .join(' + ');
}

function renderSystemResult(result) {
  const status = document.getElementById('systemStatus');
  const devicePanel = document.getElementById('devicePanel');

  const overall = result.device.overall;

  status.textContent = overall.toUpperCase();
  status.className = `system-status ${overall}`;

  devicePanel.className = `device-panel ${overall}`;

  document.getElementById('deviceOverall').textContent =
    result.device.lcd_line1;

  document.getElementById('deviceLed').textContent =
    result.device.led_color.toUpperCase();

  document.getElementById('deviceBuzzer').textContent =
    result.device.buzzer ? 'ON' : 'OFF';

  document.getElementById('deviceLcd').textContent =
    result.device.lcd_line2;

  document.getElementById('systemFeatures').innerHTML =
    result.features.map(feature => {
      const priority =
        featurePriority(feature.key);

      return `
      <article
        class="feature-card
          ${feature.active ? 'active' : 'safe'}
          ${feature.severity || ''}"
      >
        <div class="feature-card-head">
          <div>
            <span
              class="priority-badge ${priority.className}"
            >
              ${priority.label}
            </span>
            <strong>${feature.label}</strong>
          </div>

          <span>
            ${feature.active
              ? severityText(feature.severity)
              : 'SAFE'}
          </span>
        </div>

        <p>
          ${sourceText(feature.sources)}
        </p>

        <small>
          ${feature.active
            ? `위험 후보 ${feature.related_risk_ids.length}건`
            : '현재 위험 후보 없음'}
        </small>
      </article>
      `;
    }).join('');

  renderCriticalZones(result);
}


let liveDeviceTimer = null;

function renderLiveDevice(state) {
  const badge =
    document.getElementById(
      'liveDeviceBadge'
    );

  const isFresh =
    state &&
    !state.stale &&
    state.bridge_connected;

  const mode =
    !isFresh
      ? 'offline'
      : state.simulated
        ? 'simulated'
        : 'live';

  badge.textContent =
    mode === 'live'
      ? 'LIVE'
      : mode === 'simulated'
        ? 'SIMULATED'
        : 'OFFLINE';

  badge.className =
    `live-badge ${mode}`;

  document.getElementById(
    'liveBridge'
  ).textContent =
    isFresh ? 'CONNECTED' : 'OFFLINE';

  document.getElementById(
    'liveArduino'
  ).textContent =
    isFresh && state.arduino_connected
      ? 'CONNECTED'
      : 'NOT CONNECTED';

  document.getElementById(
    'liveTransport'
  ).textContent =
    (state.transport || 'none')
      .toUpperCase();

  document.getElementById(
    'liveLastSeen'
  ).textContent =
    state.age_seconds == null
      ? '-'
      : `${state.age_seconds.toFixed(1)}s ago`;

  const passage =
    state.sensor?.passage_cm;

  document.getElementById(
    'livePassage'
  ).textContent =
    passage == null
      ? '-'
      : `${passage} cm`;

  const device =
    state.device;

  document.getElementById(
    'liveOutput'
  ).textContent =
    device
      ? `${device.led_color.toUpperCase()} · ${
          device.buzzer ? 'BUZZER ON' : 'BUZZER OFF'
        }`
      : '-';

  const note =
    document.getElementById(
      'liveDeviceNote'
    );

  if (!isFresh) {
    note.textContent =
      '최근 3초 이내 장치 데이터가 없습니다.';
  } else if (state.simulated) {
    note.textContent =
      'Virtual Arduino 소프트웨어 E2E 데이터입니다. 실제 Arduino 연결 상태가 아닙니다.';
  } else {
    note.textContent =
      '실제 Serial Bridge에서 수신한 최근 장치 상태입니다.';
  }
}


async function refreshLiveDevice() {
  try {
    const state = await requestJson(
      '/api/v1/device/live'
    );

    renderLiveDevice(state);
  } catch (error) {
    console.error(error);

    renderLiveDevice({
      stale: true,
      bridge_connected: false,
      arduino_connected: false,
      simulated: false,
      transport: 'none',
      age_seconds: null,
      sensor: null,
      device: null
    });
  }
}


function startLiveDevicePolling() {
  if (liveDeviceTimer) {
    clearInterval(liveDeviceTimer);
  }

  refreshLiveDevice();

  liveDeviceTimer = setInterval(
    refreshLiveDevice,
    1000
  );
}

async function analyzeNestSystem() {
  if (!room) return;

  const passageInput =
    document.getElementById('passageCm');

  const passageValue =
    Number(passageInput.value);

  const payload = {
    layout: room,
    sensors: {
      room_id: room.id,

      passage_cm:
        Number.isFinite(passageValue)
          ? passageValue
          : null,

      passage_min_cm:
        room.min_passage_cm || 80,

      low_light_detected:
        document
          .getElementById('lowLightDetected')
          .checked,

      wet_detected:
        document
          .getElementById('wetDetected')
          .checked
    },

    alerts: {
      buzzer_enabled:
        document
          .getElementById('buzzerEnabled')
          .checked,

      buzzer_mode:
        document
          .getElementById('buzzerMode')
          .value
    }
  };

  const button =
    document.getElementById('systemAnalyzeBtn');

  button.disabled = true;
  button.textContent = '분석 중...';

  try {
    const result = await requestJson(
      '/api/v1/system/analyze',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    renderSystemResult(result);
  } catch (error) {
    console.error(error);

    const status =
      document.getElementById('systemStatus');

    status.textContent = 'ERROR';
    status.className = 'system-status danger';
  } finally {
    button.disabled = false;
    button.textContent = '6기능 통합 분석';
  }
}


async function load() {
  [currentRoom, proposedRoom] = await Promise.all([
    requestJson('/api/v1/demo/room'),
    requestJson('/api/v1/demo/proposed')
  ]);

  await refreshComparison();
  await selectLayout('current');
  await analyzeNestSystem();
  startLiveDevicePolling();
}

document
  .getElementById('loadFieldDemoBtn')
  .addEventListener('click', async () => {
    await loadFieldValidationDemo();
  });


document
  .getElementById('currentBtn')
  .addEventListener('click', async () => {
    await selectLayout('current');
    await analyzeNestSystem();
  });

document
  .getElementById('proposedBtn')
  .addEventListener('click', async () => {
    await selectLayout('proposed');
    await analyzeNestSystem();
  });

document
  .getElementById('analyzeBtn')
  .addEventListener('click', async () => {
    if (room) {
      await analyzeRoom(room);
      await analyzeNestSystem();
    }
  });

document
  .getElementById('currentFile')
  .addEventListener('change', async event => {
    await importLayout('current', event.target.files?.[0]);
    event.target.value = '';
  });

document
  .getElementById('proposedFile')
  .addEventListener('change', async event => {
    await importLayout('proposed', event.target.files?.[0]);
    event.target.value = '';
  });


document
  .getElementById('buzzerEnabled')
  .addEventListener('change', async () => {
    await analyzeNestSystem();
  });

document
  .getElementById('buzzerMode')
  .addEventListener('change', async () => {
    await analyzeNestSystem();
  });

load().catch(err => {
  document.getElementById('status').textContent = '오류';
  console.error(err);
});
