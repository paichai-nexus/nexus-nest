const dashboard = {
  room: null,
  analysis: null,
  live: null,
  events: [],
  eventFilter: 'all',
  lastReceivedAt: null,
  lastConnectionKey: null,
  zoom: 1,
  toastTimer: null,
};

const canvas = document.getElementById('floorCanvas');
const ctx = canvas.getContext('2d');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setClass(id, className) {
  const element = document.getElementById(id);
  if (element) element.className = className;
}

function formatClock(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).format(date);
}

function formatReceived(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function updateClock() {
  const now = new Date();
  text('currentDate', formatDate(now));
  text('currentTime', formatClock(now).slice(0, 5));
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(dashboard.toastTimer);
  dashboard.toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function liveMode(state) {
  if (!state || !state.received_at) return 'offline';
  if (!state.bridge_connected || !state.arduino_connected) return 'offline';
  if (state.stale) return 'delayed';
  return 'online';
}

function distanceLabel(state) {
  if (!state) return '데이터 없음';
  if (state.measurement_status === 'out_of_range') return '측정 범위 밖';
  const distance = state.sensor?.passage_cm;
  return Number.isFinite(distance) ? `${distance.toFixed(1)} cm` : '데이터 대기';
}

function sourceLabel(state) {
  if (!state?.received_at) return '-';
  return state.simulated ? 'SIMULATED' : 'REAL · Arduino UNO';
}

function addEvent(event) {
  dashboard.events.unshift(event);
  dashboard.events = dashboard.events.slice(0, 50);
  renderEvents();
}

function captureLiveEvents(state) {
  const connectionKey = `${state.bridge_connected}:${state.arduino_connected}:${state.stale}`;
  if (connectionKey !== dashboard.lastConnectionKey) {
    dashboard.lastConnectionKey = connectionKey;
    const mode = liveMode(state);
    addEvent({
      type: 'device',
      title: mode === 'online' ? 'Arduino 장치 연결' : mode === 'delayed' ? '센서 데이터 지연' : '장치 연결 해제',
      detail: mode === 'online' ? `${sourceLabel(state)} · Serial Bridge` : '실시간 장치 상태를 확인하세요.',
      at: new Date(),
      tag: mode === 'online' ? '연결' : mode === 'delayed' ? '지연' : '오프라인',
    });
  }

  if (state.received_at && state.received_at !== dashboard.lastReceivedAt) {
    dashboard.lastReceivedAt = state.received_at;
    addEvent({
      type: 'sensor',
      title: 'HC-SR04 거리 측정',
      detail: distanceLabel(state),
      at: new Date(state.received_at),
      tag: state.simulated ? 'SIMULATED' : 'REAL',
    });
  }
}

function renderEvents() {
  const list = document.getElementById('eventList');
  const filtered = dashboard.events.filter(event => dashboard.eventFilter === 'all' || event.type === dashboard.eventFilter);
  text('eventCount', String(filtered.length));

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><span>◎</span><strong>표시할 이벤트 없음</strong><p>선택한 유형의 실제 이벤트가 없습니다.</p></div>';
    return;
  }

  list.innerHTML = filtered.map(event => {
    const icon = event.type === 'sensor' ? '↔' : event.type === 'device' ? '●' : '!';
    return `<article class="event-item">
      <span class="event-type ${event.type}">${icon}</span>
      <div><strong>${event.title}</strong><p>${event.detail}</p><span class="event-tag">${event.tag}</span></div>
      <time>${formatClock(event.at)}</time>
    </article>`;
  }).join('');
}

function renderLive(state) {
  dashboard.live = state;
  const mode = liveMode(state);
  const distance = distanceLabel(state);
  const online = mode === 'online';

  text('serverLabel', '서버 정상 연결');
  text('deviceHeaderState', online ? 'Arduino 실측 수신 중' : mode === 'delayed' ? '센서 데이터 지연' : 'Arduino 오프라인');
  setClass('serverDot', `status-dot ${mode === 'offline' ? 'warning' : 'online'}`);

  const marker = document.getElementById('roomMarker');
  marker.className = `room-marker ${mode}`;
  text('markerStatus', online ? `실측 · ${distance}` : mode === 'delayed' ? '데이터 지연' : '장치 오프라인');

  setClass('classroomDot', `room-dot ${online ? 'online' : ''}`);
  setClass('classroomBadge', `state-pill ${mode}`);
  text('classroomBadge', online ? '연결됨' : mode === 'delayed' ? '데이터 지연' : '오프라인');
  text('classroomSub', online ? `${distance} · ${sourceLabel(state)}` : mode === 'delayed' ? `마지막 ${formatReceived(state.received_at)}` : '실시간 장치 연결 없음');

  setClass('arduinoDot', `device-dot ${online ? 'online' : ''}`);
  setClass('sensorDot', `device-dot ${online ? 'online' : ''}`);
  text('arduinoState', online ? 'USB Serial 연결' : mode === 'delayed' ? '데이터 지연' : '오프라인');
  text('distanceState', online ? distance : mode === 'delayed' ? distance : '데이터 없음');
  text('hardwareCount', online ? '2 / 2 연결' : '0 / 2 연결');

  text('detailDevice', online ? '온라인' : mode === 'delayed' ? '데이터 지연' : '오프라인');
  text('detailSource', sourceLabel(state));
  text('detailDistance', distance);
  text('detailReceived', formatReceived(state.received_at));
  captureLiveEvents(state);
}

function renderOffline(error) {
  text('serverLabel', '서버 연결 실패');
  text('deviceHeaderState', 'API 상태 확인 필요');
  setClass('serverDot', 'status-dot warning');
  if (error) console.warn(error);
}

function drawCircle(x, y, radius, fill, glow) {
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = glow || fill;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFloor() {
  if (!dashboard.room) return;
  const bounds = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * dpr));
  canvas.height = Math.max(1, Math.round(bounds.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = bounds.width;
  const height = bounds.height;
  const room = dashboard.room;
  const zoom = dashboard.zoom;
  const padding = Math.max(46, Math.min(width, height) * .13);
  const scale = Math.min((width - padding * 2) / room.width_cm, (height - padding * 1.65) / room.height_cm) * zoom;
  const roomW = room.width_cm * scale;
  const roomH = room.height_cm * scale;
  const ox = (width - roomW) / 2;
  const oy = (height - roomH) / 2 + 8;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.shadowBlur = 28;
  ctx.shadowColor = 'rgba(31,151,255,.2)';
  ctx.fillStyle = 'rgba(18,53,86,.82)';
  ctx.strokeStyle = '#467ca8';
  ctx.lineWidth = 3;
  ctx.fillRect(ox, oy, roomW, roomH);
  ctx.strokeRect(ox, oy, roomW, roomH);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(99,164,211,.12)';
  ctx.lineWidth = 1;
  for (let x = 100; x < room.width_cm; x += 100) {
    ctx.beginPath(); ctx.moveTo(ox + x * scale, oy); ctx.lineTo(ox + x * scale, oy + roomH); ctx.stroke();
  }
  for (let y = 100; y < room.height_cm; y += 100) {
    ctx.beginPath(); ctx.moveTo(ox, oy + y * scale); ctx.lineTo(ox + roomW, oy + y * scale); ctx.stroke();
  }
  ctx.restore();

  room.furniture.forEach(item => {
    const x = ox + item.rect.x * scale;
    const y = oy + item.rect.y * scale;
    const w = item.rect.width * scale;
    const h = item.rect.height * scale;
    ctx.save();
    ctx.fillStyle = item.sharp_edge ? 'rgba(240,91,101,.32)' : 'rgba(74,141,197,.34)';
    ctx.strokeStyle = item.sharp_edge ? '#ff7b82' : '#61a9df';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#d7ecff';
    ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, x + w / 2, y + h / 2 + 3, Math.max(w - 8, 30));
    ctx.restore();
  });

  room.doors.forEach(door => {
    const x = ox + door.rect.x * scale;
    const y = oy + door.rect.y * scale;
    ctx.fillStyle = '#23c9df';
    ctx.fillRect(x, y, Math.max(door.rect.width * scale, 4), Math.max(door.rect.height * scale, 4));
  });

  room.teacher_positions.forEach(point => {
    const x = ox + point.x * scale;
    const y = oy + point.y * scale;
    drawCircle(x, y, 8, '#2d8cff', '#2d8cff');
    ctx.fillStyle = '#b9dcff'; ctx.font = '700 9px Inter, sans-serif'; ctx.fillText('교사 위치', x + 13, y - 10);
  });

  room.observation_points.forEach(point => {
    const x = ox + point.x * scale;
    const y = oy + point.y * scale;
    drawCircle(x, y, 7, '#a876ff', '#a876ff');
    ctx.strokeStyle = 'rgba(168,118,255,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d8c6ff'; ctx.font = '700 9px Inter, sans-serif'; ctx.fillText('관찰지점', x + 12, y + 18);
  });

  ctx.fillStyle = 'rgba(181,216,244,.7)';
  ctx.font = '800 9px Inter, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText(`${room.width_cm} × ${room.height_cm} cm`, ox, oy - 10);

  const markerX = Math.min(width - 85, ox + roomW * .72);
  const markerY = Math.max(75, oy + roomH * .33);
  const marker = document.getElementById('roomMarker');
  marker.style.left = `${markerX}px`;
  marker.style.top = `${markerY}px`;
}

async function loadRoom() {
  try {
    dashboard.room = await fetchJson('/api/v1/demo/field-critical');
    dashboard.analysis = await fetchJson('/api/v1/analyze', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dashboard.room),
    });
    text('mapRoomName', `${dashboard.room.name} · ${dashboard.room.width_cm} × ${dashboard.room.height_cm} cm`);
    text('markerTitle', dashboard.room.name.replace('현장검증 데모 - ', ''));
    text('classroomName', dashboard.room.name.replace('현장검증 데모 - ', ''));
    text('detailRoomName', dashboard.room.name);
    text('detailRiskCount', `${dashboard.analysis.summary.total}건 · 분석 페이지에서 검토`);
    drawFloor();
  } catch (error) {
    text('mapRoomName', 'RoomLayout API를 불러오지 못했습니다.');
    console.error(error);
  }
}

async function pollLive() {
  try {
    const state = await fetchJson('/api/v1/device/live', {cache: 'no-store'});
    renderLive(state);
  } catch (error) {
    renderOffline(error);
  }
}

function bindInteractions() {
  document.querySelectorAll('[data-pending]').forEach(button => {
    button.addEventListener('click', () => showToast(button.dataset.pending));
  });

  document.querySelectorAll('.event-filters button').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.event-filters button').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      dashboard.eventFilter = button.dataset.filter;
      renderEvents();
    });
  });

  document.getElementById('roomMarker').addEventListener('click', () => document.getElementById('roomDetail').classList.add('open'));
  document.getElementById('detailClose').addEventListener('click', () => document.getElementById('roomDetail').classList.remove('open'));
  document.getElementById('zoomIn').addEventListener('click', () => { dashboard.zoom = Math.min(1.35, dashboard.zoom + .1); drawFloor(); });
  document.getElementById('zoomOut').addEventListener('click', () => { dashboard.zoom = Math.max(.7, dashboard.zoom - .1); drawFloor(); });
  window.addEventListener('resize', drawFloor);
}

async function start() {
  bindInteractions();
  updateClock();
  setInterval(updateClock, 1000);
  await Promise.all([loadRoom(), pollLive()]);
  setInterval(pollLive, 1000);
}

start();
