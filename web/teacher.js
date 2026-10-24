'use strict';
const el = id => document.getElementById(id);
const api = '/api/v1/calls';
const labels = {requested:'요청 접수',accepted:'수락',responding:'대응 중',completed:'완료'};
const dateText = value => value ? new Date(value).toLocaleString('ko-KR') : '-';
let pending = false;
async function json(url, opts) {
  const response = await fetch(url, {cache:'no-store',...opts});
  const body = await response.json();
  if (!response.ok) throw Error(typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`);
  return body;
}
async function refresh() {
  try {
    const roomId = el('room').value;
    const snapshot = await json(api);
    const calls = snapshot.calls.filter(c => c.room_id === roomId);
    const active = calls.find(c => c.status !== 'completed');
    el('call').disabled = pending || !!active;
    el('current').textContent = active ? `${labels[active.status]} · ${active.reason || '사유 미입력'} · ${dateText(active.created_at)} · 담당 ${active.accepted_by || '미지정'}` : '현재 진행 중인 호출이 없습니다.';
    el('history').replaceChildren(...calls.slice(0,10).map(c => {
      const li = document.createElement('li');
      li.textContent = `${labels[c.status] || c.status} | ${c.reason || '사유 미입력'} | ${dateText(c.created_at)} | 완료 ${dateText(c.completed_at)}`;
      return li;
    }));
  } catch (error) {el('message').textContent = `조회 실패: ${error.message}`;}
}
el('call').addEventListener('click', async () => {
  if (pending) return;
  pending = true;
  el('call').disabled = true;
  try {
    const roomId = el('room').value;
    await json(api, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:roomId,room_name:roomId,requester:el('requester').value.trim() || null,reason:el('reason').value,severity:el('severity').value,event_type:'TEACHER_CALL',source:'teacher-web'})});
    el('message').textContent = '도움 요청을 전송했습니다.';
  } catch(error) {el('message').textContent = `전송 실패: ${error.message}`;}
  finally {pending = false; await refresh();}
});
el('room').addEventListener('change', refresh);
refresh();setInterval(refresh,1500);
