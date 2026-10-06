let room = null;
let risks = [];

const canvas = document.getElementById('roomCanvas');
const ctx = canvas.getContext('2d');

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

  for (const door of room.doors) {
    const r = door.rect;
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.fillStyle = 'rgba(230,126,34,.10)';
    const c = room.exit_clearance_cm;
    ctx.fillRect(Math.max(0, r.x-c), Math.max(0, r.y-c), r.width+c*2, r.height+c*2);
  }

  for (const item of room.furniture) {
    const r = item.rect;
    ctx.fillStyle = item.blocks_view ? '#566573' : '#85929e';
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(item.name, r.x + 8, r.y + 24);
  }

  for (const p of room.teacher_positions || []) {
    ctx.beginPath(); ctx.arc(p.x,p.y,11,0,Math.PI*2); ctx.fillStyle='#2f6fed';ctx.fill();
    ctx.fillStyle='#2f6fed';ctx.font='16px sans-serif';ctx.fillText('교사',p.x+16,p.y+5);
  }

  for (const risk of risks) {
    const p = risk.location;
    ctx.beginPath(); ctx.arc(p.x,p.y,18,0,Math.PI*2);
    ctx.fillStyle = risk.severity === 'high' ? 'rgba(231,76,60,.85)' : 'rgba(243,156,18,.85)';
    ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText('!',p.x,p.y+6);ctx.textAlign='start';
  }
}

function renderResult(result){
  risks = result.risks;
  const s = result.summary;
  document.getElementById('status').textContent = `후보 ${s.total}건`;
  document.getElementById('summary').innerHTML = `
    <div class="metric"><strong>${s.total}</strong><span>전체 위험 후보</span></div>
    <div class="metric"><strong>${s.high}</strong><span>높음</span></div>
    <div class="metric"><strong>${s.medium}</strong><span>중간</span></div>
    <div class="metric"><strong>${s.low}</strong><span>낮음</span></div>`;
  document.getElementById('riskList').innerHTML = risks.length ? risks.map(r => `
    <article class="risk-item ${r.severity}">
      <h3>${r.title}</h3>
      <p>${r.explanation}</p>
    </article>`).join('') : '<p class="muted">현재 규칙 기준 위험 후보가 없습니다.</p>';
  drawRoom();
}

async function load(){
  const res = await fetch('/api/v1/demo/room');
  room = await res.json();
  document.getElementById('roomName').textContent = room.name;
  drawRoom();
}

document.getElementById('analyzeBtn').addEventListener('click', async()=>{
  document.getElementById('status').textContent='분석 중';
  const res = await fetch('/api/v1/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(room)});
  renderResult(await res.json());
});

load().catch(err=>{ document.getElementById('status').textContent='오류'; console.error(err); });
