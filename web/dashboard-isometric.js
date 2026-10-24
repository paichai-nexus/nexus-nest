import { BUILDING_ROOMS, NexusBuildingMap } from './dashboard-building.js';

const ROOMS = BUILDING_ROOMS;

const state = {
  roomLayout: null,
  analysis: null,
  selectedRoomId: 'HM101',
  floor: 1,
  focusedCallId: null,
  live: null,
  calls: {calls: [], events: [], summary: {requested: 0, active: 0, completed: 0, total: 0}},
  callsLoaded: false,
  seenRequestEvents: new Set(),
  alertAudioContext: null,
  alertSoundEnabled: false,
  deviceEvents: [],
  eventFilter: 'all',
  lastReceivedAt: null,
  lastSensorEventAt: 0,
  lastMeasurementStatus: null,
  lastSensorState: null,
  lastConnectionKey: null,
  layers: {markers: true},
  toastTimer: null,
};

const mapStage = document.getElementById('mapStage');
let buildingMap = null;

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

function isSensorRoom(room, live = state.live) {
  return Boolean(live?.room_id && live.room_id === room.id);
}

function isSensorAttention(live = state.live) {
  return live?.sensor_state === 'attention';
}

function updateClock() {
  const now = new Date();
  text('currentDate', new Intl.DateTimeFormat('ko-KR', {
    year:'numeric', month:'2-digit', day:'2-digit', weekday:'short',
  }).format(now));
  text('currentTime', clock(now).slice(0, 5));
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
  const now = Date.now();
  const statusChanged = (
    live.measurement_status !== state.lastMeasurementStatus
    || live.sensor_state !== state.lastSensorState
  );
  if (statusChanged || now - state.lastSensorEventAt >= 15000) {
    state.lastMeasurementStatus = live.measurement_status;
    state.lastSensorState = live.sensor_state;
    state.lastSensorEventAt = now;
    addDeviceEvent({
      type: 'sensor',
      title: isSensorAttention(live) ? 'HC-SR04 근접 주의' : 'HC-SR04 거리 측정',
      detail: `${live.room_id || '교실 미지정'} · ${distanceLabel(live)} · ${sourceLabel(live)}`,
      created_at: live.received_at,
      status: live.sensor_state || live.measurement_status,
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
  text('distanceValue', distanceLabel(live));
  text('distanceStatus', online ? '정상 수신' : mode === 'delayed' ? '데이터 지연' : '미연결');
  text('sensorSource', `${sourceLabel(live)} · ${live.transport?.toUpperCase() || 'NONE'}`);
  text('sensorRealBadge', sourceLabel(live));
  captureDeviceEvents(live);
  renderMarkers();
  renderSelectedRoom();
}

function playCallAlert() {
  if (!state.alertSoundEnabled || !state.alertAudioContext) return;
  const context = state.alertAudioContext;
  const now = context.currentTime;
  [0, 0.22].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = index === 0 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(now + offset); oscillator.stop(now + offset + 0.17);
  });
}

function renderCalls(snapshot) {
  const newRequests = snapshot.events.filter(event => event.type === 'requested' && !state.seenRequestEvents.has(event.id));
  if (state.callsLoaded && newRequests.length) playCallAlert();
  snapshot.events.filter(event => event.type === 'requested').forEach(event => state.seenRequestEvents.add(event.id));
  state.callsLoaded = true;
  state.calls = snapshot;
  const {summary, calls} = snapshot;
  const inProgress = summary.requested + summary.active;
  text('activeCallCount', inProgress);
  text('waitingCallCount', summary.requested);
  text('respondingCallCount', summary.active);
  text('completedCallCount', summary.completed);
  text('activeCallText', inProgress ? '확인이 필요한 호출' : '현재 진행 중 없음');
  text('waitingCallText', summary.requested ? '교직원 수락 대기' : '수락 대기 없음');
  text('respondingCallText', summary.active ? '교직원 대응 진행' : '현재 대응 없음');
  text('sideCallCount', inProgress);
  document.getElementById('sideCallCount').hidden = inProgress === 0;

  const newestActive = calls.find(call => call.status !== 'completed');
  if (newestActive && newestActive.id !== state.focusedCallId) {
    state.focusedCallId = newestActive.id;
    if (ROOMS.some(room => room.id === newestActive.room_id))
      state.selectedRoomId = newestActive.room_id;
  }
  if (!newestActive) state.focusedCallId = null;
  renderEvents();
  renderMarkers();
  renderSelectedRoom();
  updateDialog();
}

function normalizedEvents() {
  const callEvents = state.calls.events.map(event => ({
    type: 'call',
    title: event.type === 'requested'
      ? (event.event_type === 'CRY_DETECTED' ? '울음 감지' : '교사 도움 요청')
      : statusLabels[event.type],
    detail: `${event.room_name} · ${event.source || '웹'}${event.actor ? ` · ${event.actor}` : ''}`,
    created_at: event.created_at,
    status: event.type === 'requested' ? (event.severity || '신규') : event.type,
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

function layoutMap() {
  buildingMap?.resize();
}

function syncView() {
  const showingCalls = window.location.hash === '#calls';
  document.getElementById('dashboardView').hidden = showingCalls;
  document.getElementById('callOverview').hidden = !showingCalls;
  document.querySelector('.side-nav a[href="/"]').classList.toggle('active', !showingCalls);
  document.querySelector('[data-view="calls"]').classList.toggle('active', showingCalls);
  if (!showingCalls) requestAnimationFrame(layoutMap);
}

function markerPresentation(room) {
  const call = activeRoomCall(room.id);
  if (call?.status === 'requested') return {className: 'requested', label: '도움 요청', detail: elapsed(call.created_at)};
  if (call && ['accepted', 'responding'].includes(call.status)) {
    return {className: 'active', label: statusLabels[call.status], detail: call.accepted_by || elapsed(call.created_at)};
  }
  if (isSensorRoom(room)) {
    const mode = liveMode();
    if (mode === 'offline') return {className: 'offline', label: '장치 오프라인', detail: 'USB Serial'};
    if (mode === 'delayed') return {className: 'offline', label: '데이터 지연', detail: '최근 수신 확인 필요'};
    if (isSensorAttention()) return {className: 'active', label: '근접 주의', detail: `${distanceLabel()} · ${sourceLabel()}`};
    return {className: 'online', label: '센서 정상', detail: `${distanceLabel()} · ${sourceLabel()}`};
  }
  return {className: 'online', label: '정상', detail: '호출 없음'};
}

function renderMarkers() {
  if (!buildingMap) return;
  ROOMS.forEach(room => buildingMap.setRoomPresentation(room.id, markerPresentation(room)));
  buildingMap.selectRoom(state.selectedRoomId, false);
}

function deviceStateFor(room) {
  if (!state.live?.room_id) {
    return `${sourceLabel()} 센서 연결 · 교실 위치 미등록`;
  }
  if (!isSensorRoom(room)) return '등록 장치 없음';
  const mode = liveMode();
  if (mode === 'online') {
    const status = isSensorAttention() ? '근접 주의' : '정상';
    return `HC-SR04 ${status} · ${distanceLabel()} · ${sourceLabel()}`;
  }
  if (mode === 'delayed') return 'Arduino 데이터 지연';
  return 'Arduino 오프라인';
}

function selectedStatus(room) {
  const active = activeRoomCall(room.id);
  if (active) return {label: statusLabels[active.status], className: active.status};
  if (isSensorRoom(room) && isSensorAttention()) {
    return {label: '센서 주의', className: 'sensor-attention'};
  }
  return {label: '정상', className: 'idle'};
}

function renderSelectedRoom() {
  const room = selectedRoom();
  const latest = latestRoomCall(room.id);
  const active = activeRoomCall(room.id);
  const status = selectedStatus(room);
  text('selectedRoomName', room.name);
  text('selectedCallTime', latest ? shortClock(latest.created_at) : '-');
  text('supportTeacher', active?.accepted_by || '미배정');

  text('detailRoomName', room.name);
  text('detailCallState', status.label);
  text('detailRecentCall', latest ? statusLabels[latest.status] : '없음');
  text('detailCallTime', latest ? shortClock(latest.created_at) : '-');
  text('detailSupportTeacher', latest?.accepted_by || '미배정');
  text('detailDeviceState', deviceStateFor(room));
  text('detailCallAction', active ? '호출 상태 관리' : '웹 호출 요청');
}

function selectRoom(roomId, syncMap = true) {
  state.selectedRoomId = roomById(roomId).id;
  if (state.floor !== 0) state.floor = selectedRoom().floor;
  if (syncMap) buildingMap?.selectRoom(state.selectedRoomId, false);
  updateFloorControls();
  renderMarkers();
  renderSelectedRoom();
  updateDialog();
}

function currentDialogCall() {
  const room = selectedRoom();
  const focusedCall = state.calls.calls.find(call => call.id === state.focusedCallId);
  const focusedRoomIsUnmapped = focusedCall && !ROOMS.some(item => item.id === focusedCall.room_id);
  return activeRoomCall(room.id) || (focusedRoomIsUnmapped ? focusedCall : null);
}

function updateDialog() {
  const room = selectedRoom();
  const call = currentDialogCall();
  const createView = document.getElementById('callCreateView');
  const actionView = document.getElementById('callActionView');
  createView.hidden = Boolean(call);
  actionView.hidden = !call;
  document.getElementById('callRoomName').value = call ? call.room_name : room.name;
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
      body: JSON.stringify({room_id: room.id, room_name: room.name, requester: document.getElementById('callRequester').value.trim() || null, event_type: 'TEACHER_CALL', severity: 'DANGER', source: 'web'}),
    });
    renderCalls(snapshot);
    showToast(`${room.name} 도움 요청이 등록되었습니다.`);
  } catch (error) { text('callDialogError', error.message); }
}

async function transitionCall() {
  const call = currentDialogCall();
  const next = call && nextActions[call.status];
  if (!call || !next) return;
  try {
    const snapshot = await requestJson(`/api/v1/calls/${call.id}/transition`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: next.action, actor: document.getElementById('callActor').value.trim() || null}),
    });
    renderCalls(snapshot);
    showToast(`${call.room_name} · ${next.label} 처리되었습니다.`);
  } catch (error) { text('callDialogError', error.message); }
}

async function loadRoomLayout() {
  state.roomLayout = await requestJson('/api/v1/demo/field-critical');
  state.analysis = await requestJson('/api/v1/analyze', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(state.roomLayout),
  });
  text('mapSubtitle', `CAD 기반 ${ROOMS.length}개 실·복도 근사 모델 · RoomLayout 분석 기능 별도 보존`);
  layoutMap();
  renderMarkers();
}

function updateFloorControls() {
  document.querySelectorAll('[data-floor]').forEach(button => button.classList.toggle('active', Number(button.dataset.floor) === state.floor));
  text('floorLabel', state.floor === 0 ? '전체' : `${state.floor}층`);
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
  document.querySelector('[data-view="calls"]').addEventListener('click', () => {
    window.location.hash = 'calls';
    syncView();
  });
  window.addEventListener('hashchange', syncView);
  document.querySelectorAll('[data-pending]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.pending)));
  document.querySelectorAll('[data-scroll]').forEach(button => button.addEventListener('click', () => {
    if (window.location.hash === '#calls') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      syncView();
    }
    requestAnimationFrame(() => document.getElementById(button.dataset.scroll)?.scrollIntoView({behavior:'smooth', block:'nearest'}));
  }));
  document.querySelectorAll('.event-filters button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.event-filters button').forEach(item => item.classList.remove('active'));
    button.classList.add('active'); state.eventFilter = button.dataset.filter; renderEvents();
  }));
  document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => {
    state.layers[input.dataset.layer] = input.checked;
    buildingMap?.setLayerVisibility(input.dataset.layer, input.checked);
  }));
  document.querySelectorAll('[data-floor]').forEach(button => button.addEventListener('click', () => {
    state.floor = Number(button.dataset.floor);
    buildingMap?.setFloor(state.floor);
    if (state.floor !== 0) state.selectedRoomId = BUILDING_ROOMS.find(room => room.floor === state.floor).id;
    selectRoom(state.selectedRoomId, false);
  }));
  document.getElementById('createCallButton').addEventListener('click', createCall);
  document.getElementById('transitionCallButton').addEventListener('click', transitionCall);
  document.getElementById('roomDetailButton').addEventListener('click', openRoomDialog);
  document.getElementById('detailCallAction').addEventListener('click', () => {
    document.getElementById('roomDialog').close(); openCallDialog();
  });
  document.getElementById('zoomIn').addEventListener('click', () => {
    buildingMap?.zoom(-2.4);
  });
  document.getElementById('zoomOut').addEventListener('click', () => {
    buildingMap?.zoom(2.4);
  });
  document.getElementById('overviewButton').addEventListener('click', () => {
    buildingMap?.resetView();
  });
  document.getElementById('fullscreenButton').addEventListener('click', async () => {
    const viewport = document.getElementById('mapViewport');
    if (!document.fullscreenElement) await viewport.requestFullscreen(); else await document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', layoutMap);
  window.addEventListener('resize', layoutMap);
}

async function start() {
  try {
    buildingMap = new NexusBuildingMap({
      canvas: document.getElementById('buildingCanvas'),
      labels: document.getElementById('roomMarkers'),
      onRoomSelect: roomId => selectRoom(roomId, false),
      onFloorChange: (floor, roomId) => {
        state.floor = floor;
        state.selectedRoomId = roomId;
        updateFloorControls();
        renderSelectedRoom();
      },
    });
  } catch (error) {
    document.getElementById('webglFallback').hidden = false;
    console.error('Three.js building map initialization failed', error);
  }
  bind();
  syncView();
  updateFloorControls();
  updateClock();
  setInterval(updateClock, 1000);
  await Promise.all([loadRoomLayout(), pollLive(), pollCalls()]);
  setInterval(pollLive, 1000);
  setInterval(pollCalls, 1500);
}

start();
