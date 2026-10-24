import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';

const FLOOR_COLORS = {
  normal: 0x13b981,
  requested: 0xff4d55,
  active: 0xf1aa2b,
  offline: 0x91a4b8,
};

export const BUILDING_ROOMS = [
  {id:'HM101', name:'HM101', floor:1, x:-12.4, z:2.9, w:2.7, d:4.1, r:0, kind:'office'},
  {id:'HM102', name:'HM102', floor:1, x:-9.5, z:2.9, w:2.7, d:4.1, r:0, kind:'office'},
  {id:'HM103', name:'HM103', floor:1, x:-10.4, z:-2.0, w:4.2, d:4.0, r:-0.08, kind:'classroom'},
  {id:'HM104', name:'HM104 · 3세반', floor:1, x:-5.6, z:2.6, w:4.7, d:4.6, r:0, kind:'classroom'},
  {id:'HM105', name:'HM105 · 2세반', floor:1, x:-1.4, z:2.8, w:3.1, d:4.5, r:0.05, kind:'classroom'},
  {id:'HM106', name:'HM106 · 유치원식당', floor:1, x:10.4, z:-1.8, w:5.2, d:4.5, r:-0.72, kind:'dining'},
  {id:'HM201', name:'HM201', floor:2, x:-13.1, z:2.8, w:2.0, d:3.8, r:0, kind:'office'},
  {id:'HM202', name:'HM202', floor:2, x:-11.1, z:-1.4, w:3.2, d:3.6, r:-0.06, kind:'office'},
  {id:'HM203', name:'HM203', floor:2, x:-10.3, z:2.8, w:2.5, d:3.8, r:0, kind:'office'},
  {id:'HM204', name:'HM204 · 4·5세반', floor:2, x:-7.2, z:2.7, w:3.8, d:4.2, r:0, kind:'classroom'},
  {id:'HM205', name:'HM205 · 보육교사 연구실', floor:2, x:-3.5, z:2.5, w:3.1, d:4.0, r:0.04, kind:'office'},
  {id:'HM206', name:'HM206', floor:2, x:0.8, z:2.5, w:2.0, d:3.6, r:0, kind:'service'},
  {id:'HM207', name:'HM207 · 만3세', floor:2, x:11.8, z:-0.4, w:4.2, d:4.0, r:-0.72, kind:'classroom'},
  {id:'HM208', name:'HM208 · 만5세', floor:2, x:6.7, z:-3.4, w:4.3, d:4.1, r:-0.12, kind:'classroom'},
  {id:'HM209', name:'HM209 · 만5세', floor:2, x:2.8, z:-2.7, w:3.9, d:4.1, r:-0.12, kind:'classroom'},
  {id:'HM210', name:'HM210 · 만3세', floor:2, x:10.2, z:3.7, w:4.0, d:4.0, r:-0.72, kind:'classroom'},
  {id:'HM211', name:'HM211', floor:2, x:7.2, z:3.3, w:2.1, d:2.5, r:-0.16, kind:'service'},
  {id:'HM212', name:'HM212 · 만4세', floor:2, x:4.3, z:2.5, w:4.3, d:4.0, r:0, kind:'classroom'},
  {id:'HM213', name:'HM213 · 만4세', floor:2, x:0.9, z:2.5, w:3.2, d:4.0, r:0, kind:'classroom'},
  {id:'HM214', name:'HM214 · 연결 복도', floor:2, x:7.2, z:0.2, w:5.4, d:2.0, r:-0.28, kind:'corridor'},
];

const palette = {
  wall: 0xf4f1e8,
  wallTop: 0xffffff,
  wood: 0xc99158,
  woodDark: 0x865333,
  yellow: 0xf6c84f,
  glass: 0x9ed9e7,
  blue: 0x5ea8d9,
  mint: 0x8fcfba,
  coral: 0xef9f8f,
  brick: 0xa7654f,
};

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({color, roughness:0.72, metalness:0.02, ...options});
}

function createCanvasTexture(draw, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function woodTexture() {
  const texture = createCanvasTexture((ctx, size) => {
    ctx.fillStyle = '#c99a67'; ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 22) {
      ctx.fillStyle = y % 44 ? '#d5aa78' : '#bc8755'; ctx.fillRect(0, y, size, 20);
      ctx.fillStyle = 'rgba(101,66,35,.15)'; ctx.fillRect(0, y + 19, size, 1);
      for (let x = (y * 3) % 70; x < size; x += 70) ctx.fillRect(x, y, 1, 20);
    }
  });
  texture.repeat.set(3.5, 3.5);
  return texture;
}

function createTable(materials, x, z, round = true) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    round ? new THREE.CylinderGeometry(.62, .62, .10, 24) : new THREE.BoxGeometry(1.2, .10, .72),
    materials.table,
  );
  top.position.y = .48; top.castShadow = true; group.add(top);
  [[-.4,-.25],[.4,-.25],[-.4,.25],[.4,.25]].forEach(([lx,lz]) => group.add(box(.08,.45,.08,materials.wood,lx,.23,lz)));
  group.position.set(x, .16, z);
  return group;
}

function createShelf(materials, x, z, rotation = 0) {
  const group = new THREE.Group();
  group.add(box(1.28,.72,.34,materials.wood,0,.36,0));
  [-.38,0,.38].forEach(dx => group.add(box(.3,.22,.37,materials.basket,dx,.48,.02)));
  group.position.set(x,.12,z); group.rotation.y = rotation;
  return group;
}

function createDoor(materials, x, z, rotation = 0) {
  const group = new THREE.Group();
  group.add(box(.72,1.45,.09,materials.yellow,0,.72,0));
  group.add(box(.035,.035,.035,materials.metal,.25,.76,-.07));
  group.position.set(x,.12,z); group.rotation.y = rotation;
  return group;
}

function createRoom(room, materials) {
  const group = new THREE.Group();
  group.position.set(room.x, 0, room.z);
  group.rotation.y = room.r;
  group.userData.roomId = room.id;

  const floorMaterial = standard(0xd6aa73, {map:materials.woodTexture, roughness:.88});
  floorMaterial.map = materials.woodTexture.clone();
  floorMaterial.map.needsUpdate = true;
  floorMaterial.map.repeat.set(Math.max(2, room.w / 1.6), Math.max(2, room.d / 1.6));
  const slab = box(room.w,.16,room.d,floorMaterial,0,.08,0);
  slab.userData.roomId = room.id;
  group.add(slab);

  const wallHeight = room.kind === 'corridor' ? .42 : 1.35;
  const wallThickness = .13;
  group.add(box(room.w,wallHeight,wallThickness,materials.wall,0,wallHeight/2+.16,-room.d/2));
  group.add(box(wallThickness,wallHeight,room.d,materials.wall,-room.w/2,wallHeight/2+.16,0));
  group.add(box(wallThickness,wallHeight,room.d,materials.wall,room.w/2,wallHeight/2+.16,0));
  if (room.kind !== 'corridor') {
    group.add(createDoor(materials, room.w*.22, room.d/2-.06, 0));
    group.add(createShelf(materials, -room.w*.23, -room.d/2+.28, 0));
  }

  if (['classroom','dining'].includes(room.kind)) {
    const rows = room.kind === 'dining' ? 2 : 1;
    for (let row = 0; row < rows; row += 1) {
      group.add(createTable(materials, -.65, -.15 + row*1.25, room.kind !== 'dining'));
      group.add(createTable(materials, .72, -.15 + row*1.25, room.kind !== 'dining'));
    }
    group.add(createShelf(materials, -room.w/2+.28, .5, Math.PI/2));
  } else if (room.kind === 'office') {
    group.add(createTable(materials, 0, 0, false));
  }

  const beacon = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.29,.055,12,32), standard(FLOOR_COLORS.normal,{emissive:FLOOR_COLORS.normal,emissiveIntensity:.25}));
  ring.rotation.x = Math.PI/2;
  const stem = box(.035,.7,.035,materials.metal,0,.36,0);
  beacon.add(ring, stem);
  beacon.position.set(0,1.7,0);
  beacon.userData.roomId = room.id;
  group.add(beacon);

  group.traverse(object => { if (object.isMesh) object.userData.roomId = room.id; });
  group.userData.slab = slab;
  group.userData.beaconRing = ring;
  return group;
}

function createStair(materials, x, z, rotation = 0) {
  const group = new THREE.Group();
  for (let index = 0; index < 8; index += 1) {
    group.add(box(1.65,.10 + index*.09,.34,materials.woodDark,0,.05 + index*.045,index*.29));
  }
  [-.76,.76].forEach(side => {
    const rail = box(.05,1.0,2.5,materials.metal,side,.75,1.0);
    rail.rotation.x = -.25;
    group.add(rail);
  });
  group.position.set(x,.12,z); group.rotation.y = rotation;
  return group;
}

function createCorridor(materials, x, z, w, d, rotation = 0) {
  const material = standard(0xd6aa73,{map:materials.woodTexture,roughness:.9});
  const corridor = box(w,.12,d,material,x,.06,z);
  corridor.rotation.y = rotation;
  return corridor;
}

function createFloorScene(floor, materials) {
  const group = new THREE.Group();
  const roomGroups = new Map();
  BUILDING_ROOMS.filter(room => room.floor === floor).forEach(room => {
    const roomGroup = createRoom(room, materials);
    roomGroups.set(room.id, roomGroup);
    group.add(roomGroup);
  });

  group.add(createCorridor(materials,-5.2,.1,17.7,1.55,0));
  group.add(createCorridor(materials,4.8,.35,8.0,1.55,-.18));
  group.add(createCorridor(materials,8.8,.0,6.0,1.45,-.67));
  group.add(createStair(materials,-15.2,1.8,Math.PI));
  group.add(createStair(materials,5.8,.7,-Math.PI/2));
  if (floor === 1) {
    const brickCore = box(2.3,1.7,2.0,materials.brick,1.8,.86,1.2);
    group.add(brickCore);
    const entrance = new THREE.Group();
    entrance.add(box(2.4,.14,2.2,materials.wood,0,.07,0));
    entrance.add(box(.10,1.25,2.2,materials.glass,-1.15,.7,0));
    entrance.add(box(.10,1.25,2.2,materials.glass,1.15,.7,0));
    entrance.position.set(3.0,.1,3.8); group.add(entrance);
  } else {
    const glassRail = standard(palette.glass,{transparent:true,opacity:.38,roughness:.18,metalness:.05});
    group.add(box(6.0,.82,.05,glassRail,-1.5,.62,.82));
    group.add(box(.06,.82,2.2,glassRail,1.45,.62,1.88));
  }

  const base = box(31,.18,13,standard(0xeaf0f3,{roughness:1}),0,-.16,.2);
  base.receiveShadow = true;
  group.add(base);
  return {group, roomGroups};
}

export class NexusBuildingMap {
  constructor({canvas, labels, onRoomSelect, onFloorChange}) {
    this.canvas = canvas;
    this.labels = labels;
    this.onRoomSelect = onRoomSelect;
    this.onFloorChange = onFloorChange;
    this.floor = 1;
    this.selectedRoomId = 'HM101';
    this.statuses = new Map();
    this.pointerStart = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.roomGroups = new Map();
    this.roomLabels = new Map();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeaf3f8);
    this.scene.fog = new THREE.Fog(0xeaf3f8, 34, 66);

    this.camera = new THREE.PerspectiveCamera(30,1,.1,100);
    this.camera.position.set(15.2,16,21);
    this.renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 48;
    this.controls.maxPolarAngle = Math.PI*.46;
    this.controls.minPolarAngle = Math.PI*.16;
    this.controls.target.set(0,0,0);

    this.scene.add(new THREE.HemisphereLight(0xffffff,0x9eb0bd,2.0));
    const sun = new THREE.DirectionalLight(0xfff5dc,3.0);
    sun.position.set(-12,26,15); sun.castShadow = true;
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
    this.scene.add(sun);

    const woodMap = woodTexture();
    const materials = {
      woodTexture:woodMap,
      wall:standard(palette.wall),
      wood:standard(palette.wood),
      woodDark:standard(palette.woodDark),
      yellow:standard(palette.yellow),
      glass:standard(palette.glass,{transparent:true,opacity:.44,roughness:.15}),
      table:standard(0xd6a967),
      basket:standard(palette.mint),
      metal:standard(0x8ea1ad,{metalness:.55,roughness:.3}),
      brick:standard(palette.brick,{roughness:.95}),
    };
    [1,2].forEach(floor => {
      const built = createFloorScene(floor,materials);
      built.group.visible = floor === 1;
      this.scene.add(built.group);
      this[`floor${floor}`] = built.group;
      built.roomGroups.forEach((value,key) => this.roomGroups.set(key,value));
    });

    this.makeLabels();
    this.bind();
    this.resetView();
    this.resize();
    this.animate();
  }

  makeLabels() {
    this.labels.innerHTML = '';
    BUILDING_ROOMS.forEach(room => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'building-room-label normal';
      button.dataset.roomId = room.id;
      button.innerHTML = `<i aria-hidden="true"></i><span><strong>${room.id}</strong><b>정상</b><small>호출 없음</small></span>`;
      button.addEventListener('click', event => { event.stopPropagation(); this.selectRoom(room.id); });
      this.labels.appendChild(button);
      this.roomLabels.set(room.id,button);
    });
  }

  bind() {
    this.canvas.addEventListener('pointerdown', event => { this.pointerStart = {x:event.clientX,y:event.clientY}; });
    this.canvas.addEventListener('pointerup', event => {
      if (!this.pointerStart || Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y) > 5) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hit = this.raycaster.intersectObjects([...this.roomGroups.values()],true).find(item => item.object.userData.roomId);
      if (hit) this.selectRoom(hit.object.userData.roomId);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
  }

  selectRoom(roomId, notify = true) {
    const room = BUILDING_ROOMS.find(item => item.id === roomId);
    if (!room) return;
    if (this.floor !== 0 && room.floor !== this.floor) this.setFloor(room.floor);
    this.selectedRoomId = room.id;
    this.updateVisuals();
    if (notify) this.onRoomSelect?.(room.id);
  }

  setFloor(floor) {
    const requestedFloor = Number(floor);
    this.floor = [0,1,2].includes(requestedFloor) ? requestedFloor : 1;
    this.floor1.visible = this.floor === 0 || this.floor === 1;
    this.floor2.visible = this.floor === 0 || this.floor === 2;
    this.floor1.position.set(this.floor === 0 ? -7.5 : 0, 0, 0);
    this.floor2.position.set(this.floor === 0 ? 7.5 : 0, this.floor === 0 ? .65 : 0, 0);
    const current = BUILDING_ROOMS.find(room => room.id === this.selectedRoomId);
    if (this.floor !== 0 && (!current || current.floor !== this.floor)) {
      this.selectedRoomId = BUILDING_ROOMS.find(room => room.floor === this.floor).id;
    }
    this.resetView();
    this.updateVisuals();
    this.onFloorChange?.(this.floor,this.selectedRoomId);
  }

  setRoomPresentation(roomId, presentation) {
    this.statuses.set(roomId,presentation);
    this.updateRoom(roomId);
  }

  updateRoom(roomId) {
    const presentation = this.statuses.get(roomId) || {className:'normal',label:'정상',detail:'호출 없음'};
    const className = presentation.className === 'online' ? 'normal' : presentation.className;
    const color = FLOOR_COLORS[className] || FLOOR_COLORS.normal;
    const roomGroup = this.roomGroups.get(roomId);
    if (roomGroup) {
      const ring = roomGroup.userData.beaconRing;
      ring.material.color.setHex(color); ring.material.emissive.setHex(color);
      ring.material.emissiveIntensity = className === 'requested' ? .9 : .35;
      roomGroup.userData.slab.material.emissive.setHex(color);
      roomGroup.userData.slab.material.emissiveIntensity = roomId === this.selectedRoomId ? .15 : className === 'requested' ? .12 : .02;
    }
    const label = this.roomLabels.get(roomId);
    if (label) {
      label.className = `building-room-label ${className}${roomId === this.selectedRoomId ? ' selected' : ''}`;
      label.querySelector('b').textContent = presentation.label;
      label.querySelector('small').textContent = presentation.detail;
      const room = BUILDING_ROOMS.find(item => item.id === roomId);
      label.setAttribute('aria-label',`${room.name}, ${presentation.label}, ${presentation.detail}`);
      label.setAttribute('aria-pressed',String(roomId === this.selectedRoomId));
    }
  }

  updateVisuals() {
    BUILDING_ROOMS.forEach(room => this.updateRoom(room.id));
  }

  setLayerVisibility(layer, visible) {
    if (layer === 'markers') this.labels.hidden = !visible;
    if (layer === 'paths') {
      // The CAD-inspired circulation floor itself remains visible; only overlays are toggled.
    }
  }

  resetView() {
    if (this.floor === 0) {
      this.camera.position.set(25,25,34);
      this.controls.target.set(0,.4,.1);
    } else {
      this.camera.position.set(15.2,16,21);
      this.controls.target.set(0,0,.1);
    }
    this.controls.update();
  }

  zoom(delta) {
    const direction = new THREE.Vector3().subVectors(this.camera.position,this.controls.target).normalize();
    this.camera.position.addScaledVector(direction,delta);
    this.controls.update();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(1,parent.clientWidth);
    const height = Math.max(1,parent.clientHeight);
    this.renderer.setSize(width,height,false);
    this.camera.aspect = width/height;
    this.camera.updateProjectionMatrix();
  }

  positionLabels() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const entries = [];
    BUILDING_ROOMS.forEach(room => {
      const label = this.roomLabels.get(room.id);
      const group = this.roomGroups.get(room.id);
      const presentation = this.statuses.get(room.id);
      const overallPriority = room.id === this.selectedRoomId || ['requested','active'].includes(presentation?.className);
      const visible = (room.floor === this.floor || (this.floor === 0 && overallPriority)) && group?.visible !== false;
      label.hidden = !visible;
      if (!visible) return;
      const point = new THREE.Vector3(0,2.4,0);
      group.localToWorld(point);
      point.project(this.camera);
      const priority = presentation?.className === 'requested' ? 3 : presentation?.className === 'active' ? 2 : room.id === this.selectedRoomId ? 1 : 0;
      entries.push({label, room, point, priority, idealX:(point.x*.5+.5)*width, idealY:(-point.y*.5+.5)*height});
    });
    entries.sort((a,b) => b.priority-a.priority || a.idealY-b.idealY || a.idealX-b.idealX);
    const safeLeft = width < 950 ? 132 : 158;
    const safeTop = height < 330 ? 54 : 68;
    const safeRight = width - 12;
    const safeBottom = height - 48;
    const stepX = width < 950 ? 52 : 66;
    const stepY = height < 330 ? 31 : 38;
    const offsets = [[0,0]];
    for (let ring = 1; ring <= 3; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx),Math.abs(dy)) === ring) offsets.push([dx*stepX,dy*stepY]);
        }
      }
    }
    const placed = [];
    entries.forEach(entry => {
      const labelWidth = Math.max(78,entry.label.offsetWidth);
      const labelHeight = Math.max(34,entry.label.offsetHeight);
      let best = null;
      offsets.forEach(([dx,dy],index) => {
        const x = Math.min(safeRight-labelWidth/2,Math.max(safeLeft+labelWidth/2,entry.idealX+dx));
        const y = Math.min(safeBottom,Math.max(safeTop+labelHeight,entry.idealY+dy));
        const rect = {left:x-labelWidth/2-4,right:x+labelWidth/2+4,top:y-labelHeight-4,bottom:y+4};
        const overlap = placed.reduce((total,item) => total + Math.max(0,Math.min(rect.right,item.right)-Math.max(rect.left,item.left))*Math.max(0,Math.min(rect.bottom,item.bottom)-Math.max(rect.top,item.top)),0);
        const score = overlap*1000 + Math.hypot(dx,dy) + index*.01;
        if (!best || score < best.score) best = {x,y,rect,score};
      });
      placed.push(best.rect);
      entry.label.style.transform = `translate(-50%,-100%) translate(${best.x}px,${best.y}px)`;
      entry.label.style.zIndex = String(2000+entry.priority*100-Math.round(entry.point.z*10));
    });
  }

  animate() {
    this.controls.update();
    this.roomGroups.forEach((group,id) => {
      const status = this.statuses.get(id);
      const pulse = status?.className === 'requested' ? 1 + Math.sin(performance.now()*.006)*.08 : 1;
      group.userData.beaconRing.scale.setScalar(pulse);
    });
    this.positionLabels();
    this.renderer.render(this.scene,this.camera);
    requestAnimationFrame(() => this.animate());
  }
}
