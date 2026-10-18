const ROOMS = [
  {id: 'sunshine', name: '햇살반', x: 32, y: 30, deviceDemo: true},
  {id: 'star', name: '별님반', x: 68, y: 25, deviceDemo: false},
  {id: 'moon', name: '달님반', x: 72, y: 50, deviceDemo: false},
  {id: 'rainbow', name: '무지개반', x: 40, y: 53, deviceDemo: false},
];

const state = {
  roomLayout: null,
  analysis: null,
  selectedRoomId: 'sunshine',
  focusedCallId: null,
  live: null,
  calls: {calls: [], events: [], summary: {requested: 0, active: 0, completed: 0, total: 0}},
  deviceEvents: [],
  distances: [],
  eventFilter: 'all',
  lastReceivedAt: null,
  lastSensorEventAt: 0,
  lastMeasurementStatus: null,
  lastConnectionKey: null,
  zoom: 1,
  layers: {markers: true, sensors: true, paths: true},
  toastTimer: null,
};

const trendCanvas = document.getElementById('distanceTrend');
const trendCtx = trendCanvas.getContext('2d');
const mapStage = document.getElementById('mapStage');

const statusLabels = {
  requested: '도움 요청',
  accepted: '호출 수락',
  responding: '대응 중',
  completed: '완료',
};

const nextActions = {
  requested: {action: 'accept', label: '호출 수락'},
  accepted: {action: 'respond', label: '대응 시작'},
  responding: {action: 'complete', label: '호출 완료'},
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { detail = (await response.json()).detail || detail; } catch (_) { /* response was not JSON */ }
    throw new Error(detail);
  }
  return response.json();
}

function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function clock(value = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
  }).format(value);
}

function shortClock(value) {
  return value ? clock(new Date(value)).slice(0, 5) : '-';
}

function elapsed(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 ${seconds % 60}초`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}

function roomById(roomId) {
  return ROOMS.find(room => room.id === roomId) || ROOMS[0];
}

function selectedRoom() {
  return roomById(state.selectedRoomId);
}

function roomCalls(roomId) {
  return state.calls.calls.filter(call => call.room_id === roomId);
}

function latestRoomCall(roomId = state.selectedRoomId) {
  return roomCalls(roomId)[0] || null;
}

function activeRoomCall(roomId = state.selectedRoomId) {
  return roomCalls(roomId).find(call => call.status !== 'completed') || null;
}

function liveMode(live = state.live) {
  if (!live?.received_at || !live.bridge_connected || !live.arduino_connected) return 'offline';
  return live.stale ? 'delayed' : 'online';
}

function distanceLabel(live = state.live) {
  if (!live) return '데이터 대기';
  if (live.measurement_status === 'out_of_range') return '측정 범위 밖';
  const value = live.sensor?.passage_cm;
  return Number.isFinite(value) ? `${value.toFixed(1)} cm` : '데이터 대기';
}

function sourceLabel(live = state.live) {
  if (!live?.received_at) return '-';
  return live.simulated ? 'SIMULATED' : 'REAL';
}

function updateClock() {
  const now = new Date();
  text('currentDate', new Intl.DateTimeFormat('ko-KR', {
    year:'numeric', month:'2-digit', day:'2-digit', weekday:'short',
  }).format(now));
  text('currentTime', clock(now).slice(0, 5));
  const latest = state.calls.calls[0];
  text('recentCallElapsed', latest ? elapsed(latest.created_at) : '-');
  renderMarkers();
  renderSelectedRoom();
}

function addDeviceEvent(event) {
  state.deviceEvents.unshift(event);
  state.deviceEvents = state.deviceEvents.slice(0, 12);
  renderEvents();
}

function captureDeviceEvents(live) {
  const connectionKey = `${live.bridge_connected}:${live.arduino_connected}:${live.stale}`;
  if (connectionKey !== state.lastConnectionKey) {
    state.lastConnectionKey = connectionKey;
    const mode = liveMode(live);
    addDeviceEvent({
      type: 'device',
      title: mode === 'online' ? '장치 연결' : mode === 'delayed' ? '데이터 지연' : '장치 연결 해제',
      detail: mode === 'online' ? 'Arduino UNO · USB Serial' : '장치 연결 상태를 확인하세요.',
      created_at: new Date().toISOString(),
      status: mode,
    });
  }

  if (!live.received_at || live.received_at === state.lastReceivedAt) return;
  state.lastReceivedAt = live.received_at;
  const value = live.sensor?.passage_cm;
  if (Number.isFinite(value)) {
    state.distances.push({value, at: new Date(live.received_at)});
    state.distances = state.distances.slice(-28);
    drawTrend();
  }
  const now = Date.now();
  const statusChanged = live.measurement_status !== state.lastMeasurementStatus;
  if (statusChanged || now - state.lastSensorEventAt >= 15000) {
    state.lastMeasurementStatus = live.measurement_status;
    state.lastSensorEventAt = now;
    addDeviceEvent({
      type: 'sensor',
      title: 'HC-SR04 거리 측정',
      detail: `${distanceLabel(live)} · ${sourceLabel(live)}`,
      created_at: live.received_at,
      status: live.measurement_status,
    });
  }
}

function renderLive(live) {
  state.live = live;
  const mode = liveMode(live);
  const online = mode === 'online';
  text('serverLabel', '서버 연결 정상');
  document.getElementById('serverDot').className = 'dot online';
  text('arduinoTopLabel', online ? 'Arduino 연결됨' : mode === 'delayed' ? 'Arduino 데이터 지연' : 'Arduino 오프라인');
  text('arduinoTopSub', live.simulated ? 'SIMULATED' : 'USB Serial');
  document.getElementById('arduinoTopDot').className = `dot ${online ? 'online' : mode === 'delayed' ? 'delayed' : 'off'}`;
  document.getElementById('arduinoDot').className = `dot ${online ? 'online' : mode === 'delayed' ? 'delayed' : 'off'}`;
  document.getElementById('sensorDot').className = `dot ${online ? 'online' : mode === 'delayed' ? 'delayed' : 'off'}`;
  text('arduinoState', online ? `연결됨 · ${live.simulated ? 'SIMULATED' : 'USB Serial'}` : mode === 'delayed' ? '데이터 지연' : '미연결');
  text('deviceDistance', distanceLabel(live));
  text('distanceValue', distanceLabel(live));
  text('distanceStatus', online ? '정상 수신' : mode === 'delayed' ? '데이터 지연' : '미연결');
  text('sensorSource', `${sourceLabel(live)} · ${live.transport?.toUpperCase() || 'NONE'}`);
  text('sensorRealBadge', sourceLabel(live));
  const sensorPin = document.getElementById('sensorPin');
  sensorPin.classList.toggle('offline', !online);
  captureDeviceEvents(live);
  renderMarkers();
  renderSelectedRoom();
}

function renderCalls(snapshot) {
  state.calls = snapshot;
  const {summary, calls} = snapshot;
  text('activeCallCount', summary.active);
  text('waitingCallCount', summary.requested);
  text('completedCallCount', summary.completed);
  text('activeCallText', summary.active ? '지원 교직원 대응 중' : '현재 진행 중 없음');
  text('waitingCallText', summary.requested ? '수락 대기 중' : '현재 대기 없음');
  text('sideCallCount', summary.requested + summary.active);
  document.getElementById('sideCallCount').hidden = summary.requested + summary.active === 0;

  const recent = calls[0];
  document.getElementById('recentCallEmpty').hidden = Boolean(recent);
  document.getElementById('recentCallSummary').hidden = !recent;
  if (recent) {
    text('recentCallRoom', recent.room_name);
    text('recentCallStatus', statusLabels[recent.status]);
    text('recentCallElapsed', elapsed(recent.created_at));
  }

  const newestActive = calls.find(call => call.status !== 'completed' && ROOMS.some(room => room.id === call.room_id));
  if (newestActive && newestActive.id !== state.focusedCallId) {
    state.focusedCallId = newestActive.id;
    state.selectedRoomId = newestActive.room_id;
  }
  if (!newestActive) state.focusedCallId = null;

  renderRecentCalls();
  renderEvents();
  renderMarkers();
  renderSelectedRoom();
  updateDialog();
}

function renderRecentCalls() {
  const target = document.getElementById('recentCallList');
  if (!state.calls.calls.length) {
    target.innerHTML = '<div class="empty-row">호출 기록이 없습니다.</div>';
    return;
  }
  target.innerHTML = state.calls.calls.slice(0, 5).map((call, index) => `
    <div class="call-row ${call.status}">
      <i>${index + 1}</i><span><strong>${escapeHtml(call.room_name)}</strong>
      <small>${shortClock(call.created_at)} · ${escapeHtml(call.accepted_by || '담당자 미배정')}</small></span>
      <b>${statusLabels[call.status]}</b>
    </div>`).join('');
}

function normalizedEvents() {
  const callEvents = state.calls.events.map(event => ({
    type: 'call',
    title: statusLabels[event.type],
    detail: `${event.room_name} · 웹 호출${event.actor ? ` · ${event.actor}` : ''}`,
    created_at: event.created_at,
    status: event.type,
  }));
  return [...callEvents, ...state.deviceEvents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderEvents() {
  const events = normalizedEvents().filter(event => state.eventFilter === 'all' || event.type === state.eventFilter);
  text('eventCount', events.length);
  const target = document.getElementById('eventList');
  if (!events.length) {
    target.innerHTML = '<div class="empty-event"><b>표시할 이벤트 없음</b><span>선택한 유형의 실제 이벤트가 없습니다.</span></div>';
    return;
  }
  const icons = {call:'♢', sensor:'↔', device:'●', environment:'≋'};
  target.innerHTML = events.slice(0, 30).map(event => `
    <article class="event-item"><span class="event-icon ${event.type}">${icons[event.type] || '•'}</span>
    <div class="event-body"><strong>${escapeHtml(event.title)}</strong><b>${escapeHtml(event.status || '')}</b>
    <p>${escapeHtml(event.detail)}</p></div><time>${clock(new Date(event.created_at))}</time></article>`).join('');
}

function drawTrend() {
  const rect = trendCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  trendCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  trendCanvas.height = Math.max(1, Math.round(rect.height * dpr));
  trendCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  trendCtx.clearRect(0, 0, rect.width, rect.height);
  trendCtx.strokeStyle = '#dce8f4';
  trendCtx.lineWidth = 1;
  [10, 26, 42].forEach(y => {
    trendCtx.beginPath(); trendCtx.moveTo(0, y); trendCtx.lineTo(rect.width, y); trendCtx.stroke();
  });
  if (state.distances.length < 2) return;
  const values = state.distances.map(item => item.value);
  const min = Math.min(...values);
  const range = Math.max(Math.max(...values) - min, 10);
  trendCtx.strokeStyle = '#1780f3';
  trendCtx.lineWidth = 2;
  trendCtx.beginPath();
  values.forEach((value, index) => {
    const x = index / (values.length - 1) * (rect.width - 8) + 4;
    const y = 38 - (value - min) / range * 28;
    index ? trendCtx.lineTo(x, y) : trendCtx.moveTo(x, y);
  });
  trendCtx.stroke();
}

function layoutMap() {
  const viewport = document.getElementById('mapViewport');
  const rect = viewport.getBoundingClientRect();
  const maxWidth = rect.width * 0.96;
  const maxHeight = rect.height * 0.96;
  const width = Math.max(320, Math.min(maxWidth, maxHeight * 16 / 9));
  mapStage.style.width = `${width}px`;
  mapStage.style.height = `${width * 9 / 16}px`;
  mapStage.style.setProperty('--map-zoom', state.zoom);
}

function markerPresentation(room) {
  const call = activeRoomCall(room.id);
  if (call?.status === 'requested') return {className: 'requested', label: '도움 요청', detail: elapsed(call.created_at)};
  if (call && ['accepted', 'responding'].includes(call.status)) {
    return {className: 'active', label: statusLabels[call.status], detail: call.accepted_by || elapsed(call.created_at)};
  }
  if (room.deviceDemo && liveMode() !== 'online') return {className: 'offline', label: '장치 오프라인', detail: 'DEMO 위치'};
  return {className: 'online', label: '정상', detail: room.deviceDemo ? 'REAL 데이터 · DEMO 위치' : '호출 없음'};
}

function renderMarkers() {
  const target = document.getElementById('roomMarkers');
  target.innerHTML = ROOMS.map(room => {
    const view = markerPresentation(room);
    const selected = room.id === state.selectedRoomId;
    return `<button class="map-marker ${view.className}${selected ? ' selected' : ''}" type="button"
      data-room-id="${room.id}" style="left:${room.x}%;top:${room.y}%" aria-pressed="${selected}"
      aria-label="${room.name}, ${view.label}, ${view.detail}">
      <i aria-hidden="true">●</i><span><strong>${room.name}</strong><b>${view.label}</b><small>${view.detail}</small></span>
    </button>`;
  }).join('');
  target.querySelectorAll('.map-marker').forEach(marker => {
    marker.addEventListener('click', () => selectRoom(marker.dataset.roomId));
  });
}

function deviceStateFor(room) {
  if (!room.deviceDemo) return '등록 장치 없음';
  const mode = liveMode();
  if (mode === 'online') return `${sourceLabel()} 데이터 · DEMO 위치`;
  if (mode === 'delayed') return 'Arduino 데이터 지연 · DEMO 위치';
  return 'Arduino 오프라인 · DEMO 위치';
}

function selectedStatus(room) {
  const active = activeRoomCall(room.id);
  if (active) return {label: statusLabels[active.status], className: active.status};
  if (room.deviceDemo && liveMode() !== 'online') return {label: '장치 오프라인', className: 'offline'};
  return {label: '정상', className: 'idle'};
}

function renderSelectedRoom() {
  const room = selectedRoom();
  const latest = latestRoomCall(room.id);
  const active = activeRoomCall(room.id);
  const status = selectedStatus(room);
  text('selectedRoomName', room.name);
  text('selectedCallState', status.label);
  document.getElementById('selectedCallState').className = `call-state ${status.className}`;
  text('selectedRecentCall', latest ? statusLabels[latest.status] : '없음');
  text('selectedCallTime', latest ? shortClock(latest.created_at) : '-');
  text('supportTeacher', latest?.accepted_by || '미배정');
  text('selectedDeviceState', deviceStateFor(room));
  text('selectedRoomAction', active ? '호출 상태 관리' : '웹 호출 요청');

  text('detailRoomName', room.name);
  text('detailCallState', status.label);
  text('detailRecentCall', latest ? statusLabels[latest.status] : '없음');
  text('detailCallTime', latest ? shortClock(latest.created_at) : '-');
  text('detailSupportTeacher', latest?.accepted_by || '미배정');
  text('detailDeviceState', deviceStateFor(room));
  text('detailCallAction', active ? '호출 상태 관리' : '웹 호출 요청');
}

function selectRoom(roomId) {
  state.selectedRoomId = roomById(roomId).id;
  renderMarkers();
  renderSelectedRoom();
  updateDialog();
}

function updateDialog() {
  const room = selectedRoom();
  const call = activeRoomCall(room.id);
  const createView = document.getElementById('callCreateView');
  const actionView = document.getElementById('callActionView');
  createView.hidden = Boolean(call);
  actionView.hidden = !call;
  document.getElementById('callRoomName').value = room.name;
  if (call) {
    text('dialogCallStatus', statusLabels[call.status]);
    const next = nextActions[call.status];
    text('transitionCallButton', next?.label || '완료됨');
    document.getElementById('transitionCallButton').disabled = !next;
  }
}

function openCallDialog() {
  text('callDialogError', '');
  updateDialog();
  document.getElementById('callDialog').showModal();
}

function openRoomDialog() {
  renderSelectedRoom();
  document.getElementById('roomDialog').showModal();
}

async function createCall() {
  const room = selectedRoom();
  try {
    const snapshot = await requestJson('/api/v1/calls', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({room_id: room.id, room_name: room.name, requester: document.getElementById('callRequester').value.trim() || null}),
    });
    renderCalls(snapshot);
    showToast(`${room.name} 도움 요청이 등록되었습니다.`);
  } catch (error) { text('callDialogError', error.message); }
}

async function transitionCall() {
  const room = selectedRoom();
  const call = activeRoomCall(room.id);
  const next = call && nextActions[call.status];
  if (!call || !next) return;
  try {
    const snapshot = await requestJson(`/api/v1/calls/${call.id}/transition`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: next.action, actor: document.getElementById('callActor').value.trim() || null}),
    });
    renderCalls(snapshot);
    showToast(`${room.name} · ${next.label} 처리되었습니다.`);
  } catch (error) { text('callDialogError', error.message); }
}

async function loadRoomLayout() {
  state.roomLayout = await requestJson('/api/v1/demo/field-critical');
  state.analysis = await requestJson('/api/v1/analyze', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(state.roomLayout),
  });
  text('mapSubtitle', `4개 DEMO 교실 · RoomLayout 분석 ${state.roomLayout.width_cm} × ${state.roomLayout.height_cm}cm 보존`);
  layoutMap();
  renderMarkers();
}

async function pollLive() {
  try { renderLive(await requestJson('/api/v1/device/live', {cache: 'no-store'})); }
  catch (error) {
    text('serverLabel', '서버 연결 실패');
    document.getElementById('serverDot').className = 'dot off';
    console.warn(error);
  }
}

async function pollCalls() {
  try { renderCalls(await requestJson('/api/v1/calls', {cache: 'no-store'})); }
  catch (error) { console.warn(error); }
}

function bind() {
  document.querySelectorAll('[data-pending]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.pending)));
  document.querySelectorAll('[data-scroll]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.scroll).scrollIntoView({behavior:'smooth', block:'nearest'})));
  document.querySelectorAll('.event-filters button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.event-filters button').forEach(item => item.classList.remove('active'));
    button.classList.add('active'); state.eventFilter = button.dataset.filter; renderEvents();
  }));
  document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => {
    state.layers[input.dataset.layer] = input.checked;
    mapStage.classList.toggle(`hide-${input.dataset.layer}`, !input.checked);
  }));
  document.getElementById('openCallDialog').addEventListener('click', openCallDialog);
  document.getElementById('selectedRoomAction').addEventListener('click', openCallDialog);
  document.getElementById('createCallButton').addEventListener('click', createCall);
  document.getElementById('transitionCallButton').addEventListener('click', transitionCall);
  document.getElementById('roomDetailButton').addEventListener('click', openRoomDialog);
  document.getElementById('detailCallAction').addEventListener('click', () => {
    document.getElementById('roomDialog').close(); openCallDialog();
  });
  document.getElementById('zoomIn').addEventListener('click', () => {
    state.zoom = Math.min(1.35, state.zoom + 0.1); layoutMap();
  });
  document.getElementById('zoomOut').addEventListener('click', () => {
    state.zoom = Math.max(0.8, state.zoom - 0.1); layoutMap();
  });
  document.getElementById('overviewButton').addEventListener('click', () => {
    state.zoom = 1; layoutMap(); selectRoom('sunshine');
  });
  document.getElementById('fullscreenButton').addEventListener('click', async () => {
    const viewport = document.getElementById('mapViewport');
    if (!document.fullscreenElement) await viewport.requestFullscreen(); else await document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', layoutMap);
  window.addEventListener('resize', () => { layoutMap(); drawTrend(); });
  document.querySelector('.isometric-map').addEventListener('load', layoutMap);
}

async function start() {
  bind();
  updateClock();
  setInterval(updateClock, 1000);
  await Promise.all([loadRoomLayout(), pollLive(), pollCalls()]);
  setInterval(pollLive, 1000);
  setInterval(pollCalls, 1500);
}

start();
