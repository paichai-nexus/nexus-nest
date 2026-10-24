const state = {
  room: null,
  analysis: null,
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
  layers: {rooms: true, sensors: true, furniture: true, paths: true},
  toastTimer: null,
};

const canvas = document.getElementById('floorCanvas');
const ctx = canvas.getContext('2d');
const trendCanvas = document.getElementById('distanceTrend');
const trendCtx = trendCanvas.getContext('2d');

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try { detail = (await response.json()).detail || detail; } catch (_) { /* noop */ }
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
  return new Intl.DateTimeFormat('ko-KR', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:'Asia/Seoul'}).format(value);
}

function shortClock(value) {
  return value ? clock(new Date(value)).slice(0, 5) : '-';
}

function updateClock() {
  const now = new Date();
  text('currentDate', new Intl.DateTimeFormat('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit', weekday:'short'}).format(now));
  text('currentTime', clock(now).slice(0, 5));
  const latest = state.calls.calls[0];
  text('recentCallElapsed', latest ? elapsed(latest.created_at) : '-');
  text('markerTimer', activeCall() ? elapsed(activeCall().created_at) : '-');
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

function liveMode(live) {
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

function activeCall() {
  return state.calls.calls.find(call => call.status !== 'completed') || null;
}

const statusLabels = {requested:'도움 요청', accepted:'호출 수락', responding:'이동 중', completed:'완료'};
const nextActions = {
  requested: {action:'accept', label:'호출 수락'},
  accepted: {action:'respond', label:'대응 시작'},
  responding: {action:'complete', label:'호출 완료'},
};

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
      type:'device', title:mode === 'online' ? '장치 연결' : mode === 'delayed' ? '데이터 지연' : '장치 연결 해제',
      detail:mode === 'online' ? 'Arduino UNO · USB Serial' : '장치 연결 상태를 확인하세요.',
      created_at:new Date().toISOString(), status:mode,
    });
  }

  if (!live.received_at || live.received_at === state.lastReceivedAt) return;
  state.lastReceivedAt = live.received_at;
  const value = live.sensor?.passage_cm;
  if (Number.isFinite(value)) {
    state.distances.push({value, at:new Date(live.received_at)});
    state.distances = state.distances.slice(-28);
    drawTrend();
  }
  const now = Date.now();
  const statusChanged = live.measurement_status !== state.lastMeasurementStatus;
  if (statusChanged || now - state.lastSensorEventAt >= 15000) {
    state.lastMeasurementStatus = live.measurement_status;
    state.lastSensorEventAt = now;
    addDeviceEvent({
      type:'sensor', title:'HC-SR04 거리 측정', detail:`${distanceLabel(live)} · ${sourceLabel(live)}`,
      created_at:live.received_at, status:live.measurement_status,
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
  captureDeviceEvents(live);
  renderMarker();
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
  const empty = document.getElementById('recentCallEmpty');
  const summaryElement = document.getElementById('recentCallSummary');
  empty.hidden = Boolean(recent);
  summaryElement.hidden = !recent;
  if (recent) {
    text('recentCallRoom', recent.room_name);
    text('recentCallStatus', statusLabels[recent.status]);
    text('recentCallElapsed', elapsed(recent.created_at));
  }

  const current = activeCall();
  text('selectedCallState', current ? statusLabels[current.status] : '호출 없음');
  document.getElementById('selectedCallState').className = `call-state ${current?.status || 'idle'}`;
  text('supportTeacher', current?.accepted_by || '미배정');
  text('selectedRoomAction', current ? '호출 상태 관리' : '웹 호출 요청');
  text('openCallDialog', current ? '상세 보기' : '웹 호출 요청');

  renderRecentCalls();
  renderEvents();
  renderMarker();
  updateDialog();
}

function renderRecentCalls() {
  const target = document.getElementById('recentCallList');
  if (!state.calls.calls.length) {
    target.innerHTML = '<div class="empty-row">호출 기록이 없습니다.</div>';
    return;
  }
  target.innerHTML = state.calls.calls.slice(0, 5).map((call, index) => `<div class="call-row ${call.status}"><i>${index + 1}</i><span><strong>${escapeHtml(call.room_name)}</strong><small>${shortClock(call.created_at)} · ${escapeHtml(call.accepted_by || '담당자 미배정')}</small></span><b>${statusLabels[call.status]}</b></div>`).join('');
}

function normalizedEvents() {
  const callEvents = state.calls.events.map(event => ({
    type:'call', title:statusLabels[event.type], detail:`${event.room_name}${event.actor ? ` · ${event.actor}` : ''}`,
    created_at:event.created_at, status:event.type,
  }));
  return [...callEvents, ...state.deviceEvents].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
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
  target.innerHTML = events.slice(0, 30).map(event => `<article class="event-item"><span class="event-icon ${event.type}">${icons[event.type] || '•'}</span><div class="event-body"><strong>${escapeHtml(event.title)}</strong><b>${escapeHtml(event.status || '')}</b><p>${escapeHtml(event.detail)}</p></div><time>${clock(new Date(event.created_at))}</time></article>`).join('');
}

function drawTrend() {
  const rect = trendCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  trendCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  trendCanvas.height = Math.max(1, Math.round(rect.height * dpr));
  trendCtx.setTransform(dpr,0,0,dpr,0,0);
  trendCtx.clearRect(0,0,rect.width,rect.height);
  trendCtx.strokeStyle = '#dce8f4'; trendCtx.lineWidth = 1;
  [10,26,42].forEach(y => {trendCtx.beginPath(); trendCtx.moveTo(0,y); trendCtx.lineTo(rect.width,y); trendCtx.stroke();});
  if (state.distances.length < 2) return;
  const values = state.distances.map(item => item.value);
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(max-min,10);
  trendCtx.strokeStyle = '#1780f3'; trendCtx.lineWidth = 2; trendCtx.beginPath();
  values.forEach((value,index) => {const x = index/(values.length-1)*(rect.width-8)+4; const y = 38-(value-min)/range*28; index ? trendCtx.lineTo(x,y) : trendCtx.moveTo(x,y);});
  trendCtx.stroke();
  trendCtx.fillStyle = '#1780f3'; values.forEach((value,index) => {const x = index/(values.length-1)*(rect.width-8)+4; const y = 38-(value-min)/range*28; trendCtx.beginPath(); trendCtx.arc(x,y,2,0,Math.PI*2); trendCtx.fill();});
}

function quadPoint(corners, u, v) {
  const [a,b,c,d] = corners;
  return {x:(1-u)*(1-v)*a.x+u*(1-v)*b.x+u*v*c.x+(1-u)*v*d.x,y:(1-u)*(1-v)*a.y+u*(1-v)*b.y+u*v*c.y+(1-u)*v*d.y};
}

function polygon(points, fill, stroke='#fff', lineWidth=6) {
  ctx.beginPath(); points.forEach((point,index) => index ? ctx.lineTo(point.x,point.y) : ctx.moveTo(point.x,point.y)); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) {ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
}

function drawIsoBox(center, width, height, color) {
  ctx.save(); ctx.translate(center.x,center.y); ctx.shadowBlur=8; ctx.shadowColor='rgba(36,71,104,.18)';
  const top=[{x:-width/2,y:-height/2},{x:width/2,y:-height/2-4},{x:width/2,y:height/2-4},{x:-width/2,y:height/2}]; polygon(top,color,'rgba(255,255,255,.7)',1);
  ctx.restore();
}

function drawFloor() {
  if (!state.room) return;
  const rect=canvas.getBoundingClientRect(); const dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.round(rect.width*dpr)); canvas.height=Math.max(1,Math.round(rect.height*dpr)); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,rect.width,rect.height);
  const w=rect.width,h=rect.height,z=state.zoom; const cx=w/2,cy=h/2;
  const corners=[{x:cx-(w*.34*z),y:cy-(h*.27*z)},{x:cx+(w*.24*z),y:cy-(h*.35*z)},{x:cx+(w*.38*z),y:cy+(h*.22*z)},{x:cx-(w*.22*z),y:cy+(h*.34*z)}];
  const shadow=corners.map(p=>({x:p.x+8,y:p.y+14})); polygon(shadow,'rgba(50,91,126,.18)',null,0);
  const rooms=[
    {u0:0,v0:0,u1:.48,v1:.49,color:'#f8d9c6',label:'현장검증 교실'},
    {u0:.5,v0:0,u1:1,v1:.49,color:'#dff2cf',label:'미등록 교실 A'},
    {u0:0,v0:.51,u1:.48,v1:1,color:'#d7e8f8',label:'미등록 교실 B'},
    {u0:.5,v0:.51,u1:1,v1:1,color:'#f3e4c6',label:'미등록 교실 C'},
  ];
  rooms.forEach(room=>{const pts=[quadPoint(corners,room.u0,room.v0),quadPoint(corners,room.u1,room.v0),quadPoint(corners,room.u1,room.v1),quadPoint(corners,room.u0,room.v1)];polygon(pts,room.color,'#fff',8);if(state.layers.rooms){const center=quadPoint(corners,(room.u0+room.u1)/2,(room.v0+room.v1)/2);ctx.fillStyle='#496b89';ctx.font='800 10px Inter,sans-serif';ctx.textAlign='center';ctx.fillText(room.label,center.x,center.y-28);}});
  if(state.layers.paths){ctx.save();ctx.setLineDash([6,6]);ctx.strokeStyle='rgba(33,117,203,.45)';ctx.lineWidth=2;ctx.beginPath();[quadPoint(corners,.24,.25),quadPoint(corners,.75,.25),quadPoint(corners,.75,.75),quadPoint(corners,.24,.75)].forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();}
  if(state.layers.furniture){[[.15,.16],[.3,.17],[.64,.16],[.8,.18],[.14,.67],[.31,.69],[.65,.66],[.81,.7]].forEach((pair,index)=>drawIsoBox(quadPoint(corners,pair[0],pair[1]),index%2?34:27,18,index<2?'#d88b62':index<4?'#78b88e':index<6?'#78a6cf':'#d2aa65'));}
  if(state.layers.sensors){const sensor=quadPoint(corners,.16,.36);ctx.fillStyle='#10b980';ctx.beginPath();ctx.arc(sensor.x,sensor.y,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(16,185,128,.35)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sensor.x,sensor.y,14,0,Math.PI*2);ctx.stroke();}
  const marker=quadPoint(corners,.25,.27);const markerEl=document.getElementById('roomMarker');markerEl.style.left=`${marker.x}px`;markerEl.style.top=`${marker.y}px`;
}

function renderMarker() {
  const marker=document.getElementById('roomMarker'); const call=activeCall(); const mode=liveMode(state.live);
  let markerClass=mode==='online'?'online':'offline'; let markerText=mode==='online'?`센서 정상 · ${distanceLabel()}`:'장치 오프라인';
  if(call?.status==='requested'){markerClass='requested';markerText='도움 요청 · 수락 대기';}
  if(call && ['accepted','responding'].includes(call.status)){markerClass='active';markerText=statusLabels[call.status];}
  marker.className=`map-marker ${markerClass}`; text('markerState',markerText);
}

function updateDialog() {
  const call=activeCall(); const createView=document.getElementById('callCreateView'); const actionView=document.getElementById('callActionView');
  createView.hidden=Boolean(call); actionView.hidden=!call; document.getElementById('callRoomName').value=state.room?.name?.replace('현장검증 데모 - 위험 배치','현장검증 교실')||'현장검증 교실';
  if(call){text('dialogCallStatus',statusLabels[call.status]);const next=nextActions[call.status];text('transitionCallButton',next?.label||'완료됨');document.getElementById('transitionCallButton').disabled=!next;}
}

function openCallDialog() {
  text('callDialogError',''); updateDialog(); document.getElementById('callDialog').showModal();
}

async function createCall() {
  try {
    const snapshot=await requestJson('/api/v1/calls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:state.room?.id||'room-1',room_name:state.room?.name||'현장검증 교실',requester:document.getElementById('callRequester').value.trim()||null})});
    renderCalls(snapshot); showToast('도움 요청이 등록되었습니다.');
  } catch(error){text('callDialogError',error.message);}
}

async function transitionCall() {
  const call=activeCall(); const next=call&&nextActions[call.status]; if(!call||!next)return;
  try {
    const snapshot=await requestJson(`/api/v1/calls/${call.id}/transition`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:next.action,actor:document.getElementById('callActor').value.trim()||null})});
    renderCalls(snapshot); showToast(`${next.label} 처리되었습니다.`);
  } catch(error){text('callDialogError',error.message);}
}

async function loadRoom() {
  state.room=await requestJson('/api/v1/demo/field-critical'); state.analysis=await requestJson('/api/v1/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.room)});
  const displayName=state.room.name.replace('현장검증 데모 - 위험 배치','현장검증 교실'); text('selectedRoomName',displayName);text('markerRoom',displayName);text('mapSubtitle',`${displayName} · RoomLayout ${state.room.width_cm} × ${state.room.height_cm}cm · 2.5D DEMO`);document.getElementById('callRoomName').value=displayName;drawFloor();
}

async function pollLive(){try{renderLive(await requestJson('/api/v1/device/live',{cache:'no-store'}));}catch(error){text('serverLabel','서버 연결 실패');document.getElementById('serverDot').className='dot off';console.warn(error);}}
async function pollCalls(){try{renderCalls(await requestJson('/api/v1/calls',{cache:'no-store'}));}catch(error){console.warn(error);}}

function bind() {
  document.querySelectorAll('[data-pending]').forEach(button=>button.addEventListener('click',()=>showToast(button.dataset.pending)));
  document.querySelectorAll('[data-scroll]').forEach(button=>button.addEventListener('click',()=>document.getElementById(button.dataset.scroll).scrollIntoView({behavior:'smooth',block:'nearest'})));
  document.querySelectorAll('.event-filters button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.event-filters button').forEach(item=>item.classList.remove('active'));button.classList.add('active');state.eventFilter=button.dataset.filter;renderEvents();}));
  document.querySelectorAll('[data-layer]').forEach(input=>input.addEventListener('change',()=>{state.layers[input.dataset.layer]=input.checked;drawFloor();}));
  ['openCallDialog','selectedRoomAction','roomMarker'].forEach(id=>document.getElementById(id).addEventListener('click',openCallDialog));
  document.getElementById('createCallButton').addEventListener('click',createCall);document.getElementById('transitionCallButton').addEventListener('click',transitionCall);
  document.getElementById('zoomIn').addEventListener('click',()=>{state.zoom=Math.min(1.25,state.zoom+.08);drawFloor();});document.getElementById('zoomOut').addEventListener('click',()=>{state.zoom=Math.max(.75,state.zoom-.08);drawFloor();});document.getElementById('overviewButton').addEventListener('click',()=>{state.zoom=1;drawFloor();});
  document.getElementById('fullscreenButton').addEventListener('click',async()=>{const viewport=document.getElementById('mapViewport');if(!document.fullscreenElement)await viewport.requestFullscreen();else await document.exitFullscreen();});
  window.addEventListener('resize',()=>{drawFloor();drawTrend();});
}

async function start(){bind();updateClock();setInterval(updateClock,1000);await Promise.all([loadRoom(),pollLive(),pollCalls()]);setInterval(pollLive,1000);setInterval(pollCalls,1500);}
start();
