(function(){
  "use strict";

  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  // ---------- DIFFICULTY CONFIG ----------
  let difficulty = 'normal';
  const DIFF = {
    calm:      { entitySpeedMult: 0.78, batteryDrain: 0.55, hearingMult: 0.7,  spawnDelay: 5000 },
    normal:    { entitySpeedMult: 1.0,  batteryDrain: 1.0,  hearingMult: 1.0,  spawnDelay: 3000 },
    nightmare: { entitySpeedMult: 1.28, batteryDrain: 1.5,  hearingMult: 1.35, spawnDelay: 1500 }
  };

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      difficulty = btn.dataset.diff;
    });
  });

  // ---------- MAP & WORLD CONFIG ----------
  const CELL = 6;
  const WALL_H = 5.2;

  const MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,1,1,1,0,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,1,1,1,0,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  const ROWS = MAP.length, COLS = MAP[0].length;
  const START = {r:13, c:1};
  const EXIT  = {r:1,  c:13};

  const PAGE_LOCATIONS = [
    { pos: new THREE.Vector3(cellCenter(1,5).x, 0.92, cellCenter(1,5).z), room: "Bedroom Nightstand" },
    { pos: new THREE.Vector3(cellCenter(9,12).x, 0.92, cellCenter(9,12).z), room: "Dining Table" },
    { pos: new THREE.Vector3(cellCenter(12,3).x, 0.96, cellCenter(12,3).z), room: "Study Desk" }
  ];

  const PAGE_NOTES = [
    "\"Day one,\" the note said, though I've lost count of how many times I've read it. The walls here remember footsteps that aren't mine.",
    "There's a second set of footprints in the dust now. They match mine exactly. They're following me backwards.",
    "I found a mirror with no reflection in it, only a shape standing where I should be, smiling with my mouth."
  ];

  const HIDE_SPOTS = [ {r:4,c:5}, {r:9,c:5}, {r:9,c:12} ];
  const WHISPERS = [
    "closer", "behind you", "look at me", "i remember you", "run", "it's already inside", "don't stop"
  ];

  function roomNameAt(r,c){
    if (r <= 4)  return c <= 6 ? "BEDROOM" : "BATHROOM";
    if (r >= 6 && r <= 9) return c <= 6 ? "LIVING ROOM" : "KITCHEN";
    if (r >= 11) return "ENTRY HALL";
    return "HALLWAY";
  }

  function cellCenter(r,c){
    return new THREE.Vector3((c - COLS/2)*CELL, 0, (r - ROWS/2)*CELL);
  }

  // ---------- SCENE & RENDERER SETUP ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x040303, 0.028);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 200);
  camera.position.copy(cellCenter(START.r, START.c));
  camera.position.y = 1.6;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0x201712, 0.85);
  scene.add(ambientLight);

  // ---------- PROCEDURAL PBR TEXTURES ----------
  function addGrime(ctx, w, h){
    ctx.fillStyle = 'rgba(12, 8, 5, 0.22)';
    for (let i=0; i<12; i++){
      ctx.beginPath();
      ctx.ellipse(Math.random()*w, Math.random()*h, 8+Math.random()*22, 5+Math.random()*16, Math.random()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    for (let i=0; i<6; i++){
      let x = Math.random()*w, y = Math.random()*h;
      ctx.beginPath(); ctx.moveTo(x,y);
      const segs = 3+Math.floor(Math.random()*6);
      for (let s=0; s<segs; s++){
        x += (Math.random()-0.5)*30;
        y += (Math.random()-0.5)*30;
        ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  }

  function generateNormalFromCanvas(canvas){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0,0,w,h);
    const data = imgData.data;

    const normCanvas = document.createElement('canvas');
    normCanvas.width = w; normCanvas.height = h;
    const normCtx = normCanvas.getContext('2d');
    const normData = normCtx.createImageData(w,h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const left  = (x > 0) ? data[i - 4] : data[i];
        const right = (x < w - 1) ? data[i + 4] : data[i];
        const up    = (y > 0) ? data[i - w * 4] : data[i];
        const down  = (y < h - 1) ? data[i + w * 4] : data[i];

        const dx = (right - left) / 255.0;
        const dy = (down - up) / 255.0;
        const dz = 1.0 / 2.0;

        const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const nx = (dx / len) * 0.5 + 0.5;
        const ny = (dy / len) * 0.5 + 0.5;
        const nz = (dz / len) * 0.5 + 0.5;

        normData.data[i]     = Math.floor(nx * 255);
        normData.data[i + 1] = Math.floor(ny * 255);
        normData.data[i + 2] = Math.floor(nz * 255);
        normData.data[i + 3] = 255;
      }
    }
    normCtx.putImageData(normData, 0, 0);
    return new THREE.CanvasTexture(normCanvas);
  }

  function makeStripeTexture(base, stripe, baseboard){
    const w=256, h=256;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = stripe;
    for (let x=0; x<w; x+=32) ctx.fillRect(x,0,16,h);

    for (let i=0; i<3000; i++){
      const val = Math.floor(Math.random()*30);
      ctx.fillStyle = `rgba(${val},${val},${val},0.08)`;
      ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
    }
    addGrime(ctx, w, h);

    ctx.fillStyle = baseboard;
    ctx.fillRect(0, h-28, w, 28);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, h-28, w, 3);

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makeTileTexture(base, line, baseboard){
    const w=256, h=256;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    for (let x=0; x<=w; x+=64){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y=0; y<=h; y+=64){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    addGrime(ctx, w, h);

    ctx.fillStyle = baseboard;
    ctx.fillRect(0, h-28, w, 28);

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makePlankTexture(base, line){
    const w=256, h=256, plankH=44;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for(let y=0; y<h; y+=2){
      if(Math.random()<0.6) ctx.fillRect(0,y,w,1);
    }

    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    for (let y=0; y<h; y+=plankH){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    for (let y=0; y<h; y+=plankH*2) { ctx.beginPath(); ctx.moveTo(w*0.5,y); ctx.lineTo(w*0.5,y+plankH); ctx.stroke(); }
    for (let y=plankH; y<h; y+=plankH*2) { ctx.beginPath(); ctx.moveTo(w*0.25,y); ctx.lineTo(w*0.25,y+plankH); ctx.stroke(); }

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  const bedroomTex  = makeStripeTexture('#2c1a24','#24131c','#120a0d');
  const bathroomTex = makeTileTexture('#283336','rgba(0,0,0,0.4)','#101618');
  const livingTex   = makeStripeTexture('#1d2618','#171f13','#0b1008');
  const kitchenTex  = makeStripeTexture('#2b2617','#211c10','#100d07');
  const entryTex    = makeStripeTexture('#261f17','#1d1710','#0e0a06');

  const bedroomWallMat  = new THREE.MeshStandardMaterial({ map: bedroomTex.map, bumpMap: bedroomTex.bumpMap, bumpScale: 0.04, color:0x9e868e, roughness:0.88, metalness: 0.1 });
  const bathroomWallMat = new THREE.MeshStandardMaterial({ map: bathroomTex.map, bumpMap: bathroomTex.bumpMap, bumpScale: 0.05, color:0x8fa3a6, roughness:0.45, metalness: 0.2 });
  const livingWallMat   = new THREE.MeshStandardMaterial({ map: livingTex.map, bumpMap: livingTex.bumpMap, bumpScale: 0.04, color:0x89987c, roughness:0.88, metalness: 0.1 });
  const kitchenWallMat  = new THREE.MeshStandardMaterial({ map: kitchenTex.map, bumpMap: kitchenTex.bumpMap, bumpScale: 0.04, color:0x9b8e6f, roughness:0.88, metalness: 0.1 });
  const entryWallMat    = new THREE.MeshStandardMaterial({ map: entryTex.map, bumpMap: entryTex.bumpMap, bumpScale: 0.04, color:0x8f8473, roughness:0.88, metalness: 0.1 });

  const floorTex = makePlankTexture('#191008', '#0c0703');
  floorTex.map.repeat.set(COLS*1.2, ROWS*1.2);
  floorTex.bumpMap.repeat.set(COLS*1.2, ROWS*1.2);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex.map, bumpMap: floorTex.bumpMap, bumpScale: 0.05, color:0xa0907d, roughness:0.85, metalness:0.1 });
  const ceilMat  = new THREE.MeshStandardMaterial({ color:0x080605, roughness:0.95 });

  const woodMatDark = new THREE.MeshStandardMaterial({ color:0x1c130b, roughness:0.8 });
  const woodMatMid  = new THREE.MeshStandardMaterial({ color:0x2c1f14, roughness:0.85 });
  const fabricMat   = new THREE.MeshStandardMaterial({ color:0x3a3236, roughness:0.95 });
  const fabricCushion = new THREE.MeshStandardMaterial({ color:0x2c2628, roughness:0.9 });
  const brassMat    = new THREE.MeshStandardMaterial({ color:0x8a703a, metalness:0.85, roughness:0.25 });
  const porcelainMat= new THREE.MeshStandardMaterial({ color:0xdcdcdc, roughness:0.3, metalness:0.1 });
  const chromeMat   = new THREE.MeshStandardMaterial({ color:0xaaaaaa, metalness:0.9, roughness:0.15 });

  const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);

  function wallMatForCell(r,c){
    if (r <= 5) return c <= 7 ? bedroomWallMat : bathroomWallMat;
    if (r <= 10) return c <= 7 ? livingWallMat : kitchenWallMat;
    return entryWallMat;
  }

  const wallBoxes = [];
  for (let r=0; r<ROWS; r++){
    for (let c=0; c<COLS; c++){
      const pos = cellCenter(r,c);
      if (MAP[r][c] === 1){
        const wall = new THREE.Mesh(wallGeo, wallMatForCell(r,c));
        wall.position.set(pos.x, WALL_H/2, pos.z);
        wall.receiveShadow = true;
        wall.castShadow = true;
        scene.add(wall);
        wallBoxes.push({
          minX: pos.x - CELL/2, maxX: pos.x + CELL/2,
          minZ: pos.z - CELL/2, maxZ: pos.z + CELL/2
        });
      }
    }
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS*CELL, ROWS*CELL), floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(COLS*CELL, ROWS*CELL), ceilMat);
  ceiling.rotation.x = Math.PI/2;
  ceiling.position.set(0, WALL_H, 0);
  scene.add(ceiling);

  // ---------- LIGHTS & FLASHLIGHT ----------
  const lamps = [];
  const candleLights = [];

  function addLamp(cellR, cellC, intensity=0.9, dist=10){
    const pos = cellCenter(cellR, cellC);
    const bulbY = WALL_H*0.72;
    const light = new THREE.PointLight(0xffb463, intensity, dist, 2);
    light.position.set(pos.x, bulbY, pos.z);
    light.castShadow = true;
    light.shadow.mapSize.width = 512;
    light.shadow.mapSize.height = 512;
    light.shadow.bias = -0.002;
    scene.add(light);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshBasicMaterial({ color:0xffdfaa })
    );
    bulb.position.copy(light.position);
    scene.add(bulb);

    const cordLen = WALL_H - bulbY;
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, cordLen, 8),
      new THREE.MeshStandardMaterial({ color:0x0a0a0a, roughness:0.9 })
    );
    cord.position.set(pos.x, bulbY + cordLen/2, pos.z);
    scene.add(cord);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.3, 12, 1, true),
      new THREE.MeshStandardMaterial({ color:0x221a12, side:THREE.DoubleSide, roughness:0.85 })
    );
    shade.position.set(pos.x, bulbY+0.18, pos.z);
    scene.add(shade);

    lamps.push({ light, base: intensity, flickerPhase: Math.random()*100, willDie: Math.random()<0.4, deadUntil:0 });
    return light;
  }
  addLamp(2, 3, 0.8, 9);
  addLamp(2, 11, 0.6, 8);
  addLamp(7, 2, 0.85, 10);
  addLamp(7, 11, 0.85, 10);
  addLamp(12, 6, 0.75, 12);

  const flashlight = new THREE.SpotLight(0xffedd0, 2.5, 28, Math.PI/6.5, 0.45, 1.4);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.width = 1024;
  flashlight.shadow.mapSize.height = 1024;
  flashlight.shadow.camera.near = 0.2;
  flashlight.shadow.camera.far = 30;
  flashlight.shadow.bias = -0.001;

  const flashTarget = new THREE.Object3D();
  scene.add(flashlight, flashTarget);
  flashlight.target = flashTarget;
  let flashlightOn = true;
  let flashFlickerT = 0;

  const exitPos = cellCenter(EXIT.r, EXIT.c);
  const exitLight = new THREE.PointLight(0x33ff55, 0, 12);
  exitLight.position.set(exitPos.x, 2, exitPos.z);
  scene.add(exitLight);

  // ---------- PERFECTLY SEALED REALISTIC DOOR SYSTEM ----------
  const doors = [];
  function addSwingDoor(r,c,axis){
    const pos = cellCenter(r,c);
    const doorW = CELL * 0.96;
    const doorH = WALL_H * 0.82;
    const thick = 0.12;

    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const jambThickness = 0.18;
    const jambDepth = CELL * 0.36;
    const jambMat = woodMatDark;

    if (axis === 'x'){
      const jambL = new THREE.Mesh(new THREE.BoxGeometry(jambThickness, doorH + 0.2, jambDepth), jambMat);
      jambL.position.set(-doorW/2 - jambThickness/2, doorH/2, 0);
      jambL.castShadow = jambL.receiveShadow = true;
      group.add(jambL);

      const jambR = new THREE.Mesh(new THREE.BoxGeometry(jambThickness, doorH + 0.2, jambDepth), jambMat);
      jambR.position.set(doorW/2 + jambThickness/2, doorH/2, 0);
      jambR.castShadow = jambR.receiveShadow = true;
      group.add(jambR);

      const jambTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + jambThickness*2, (WALL_H - doorH), jambDepth), jambMat);
      jambTop.position.set(0, doorH + (WALL_H - doorH)/2, 0);
      jambTop.castShadow = jambTop.receiveShadow = true;
      group.add(jambTop);
    } else {
      const jambL = new THREE.Mesh(new THREE.BoxGeometry(jambDepth, doorH + 0.2, jambThickness), jambMat);
      jambL.position.set(0, doorH/2, -doorW/2 - jambThickness/2);
      jambL.castShadow = jambL.receiveShadow = true;
      group.add(jambL);

      const jambR = new THREE.Mesh(new THREE.BoxGeometry(jambDepth, doorH + 0.2, jambThickness), jambMat);
      jambR.position.set(0, doorH/2, doorW/2 + jambThickness/2);
      jambR.castShadow = jambR.receiveShadow = true;
      group.add(jambR);

      const jambTop = new THREE.Mesh(new THREE.BoxGeometry(jambDepth, (WALL_H - doorH), doorW + jambThickness*2), jambMat);
      jambTop.position.set(0, doorH + (WALL_H - doorH)/2, 0);
      jambTop.castShadow = jambTop.receiveShadow = true;
      group.add(jambTop);
    }

    const pivot = new THREE.Group();
    const hingeOffset = axis === 'x' ? doorW/2 : 0;
    const hingeOffsetZ = axis === 'z' ? doorW/2 : 0;
    pivot.position.set(axis==='x'?-hingeOffset:0, doorH/2, axis==='z'?-hingeOffsetZ:0);

    const panelGeo = new THREE.BoxGeometry(axis==='x'?doorW+0.04:thick, doorH+0.04, axis==='x'?thick:doorW+0.04);
    const panel = new THREE.Mesh(panelGeo, woodMatMid);
    panel.position.set(axis==='x'? doorW/2 : 0, 0, axis==='z'? doorW/2 : 0);
    panel.castShadow = panel.receiveShadow = true;
    pivot.add(panel);

    const subPanelW = axis==='x'? doorW*0.35 : thick*1.1;
    const subPanelD = axis==='x'? thick*1.1 : doorW*0.35;
    const subPanelUpper = new THREE.Mesh(new THREE.BoxGeometry(subPanelW, doorH*0.35, subPanelD), woodMatDark);
    subPanelUpper.position.set(axis==='x'? doorW*0.3 : 0, doorH*0.2, axis==='z'? doorW*0.3 : 0);
    pivot.add(subPanelUpper);

    const subPanelLower = new THREE.Mesh(new THREE.BoxGeometry(subPanelW, doorH*0.35, subPanelD), woodMatDark);
    subPanelLower.position.set(axis==='x'? doorW*0.7 : 0, doorH*0.2, axis==='z'? doorW*0.7 : 0);
    pivot.add(subPanelLower);

    const knobGroup = new THREE.Group();
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), brassMat);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.14), brassMat);
    knobGroup.add(knob, plate);
    knobGroup.position.set(axis==='x'? doorW*0.88 : 0, -0.1, axis==='z'? doorW*0.88 : 0);
    pivot.add(knobGroup);

    group.add(pivot);
    scene.add(group);

    doors.push({ pivot, closedY:0, openY: Math.PI*0.42*(Math.random()<0.5?1:-1), state:0, center:pos, triggerR: CELL*0.85, slammed:false });
    return group;
  }

  addSwingDoor(5,3,'x');
  addSwingDoor(5,10,'x');
  addSwingDoor(10,3,'x');
  addSwingDoor(10,10,'x');

  // ---------- HOUSE ARCHITECTURE & ATMOSPHERIC PROPS ----------
  const beamMat = new THREE.MeshStandardMaterial({ color:0x0f0a06, roughness:0.92 });
  for (let r=2; r<ROWS-1; r+=3){
    const beam = new THREE.Mesh(new THREE.BoxGeometry(COLS*CELL*0.94, 0.24, 0.32), beamMat);
    beam.position.set(0, WALL_H-0.15, cellCenter(r,0).z);
    beam.castShadow = true;
    scene.add(beam);
  }

  function addCobweb(x,y,z, rot){
    const web = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 8, 0, Math.PI/2),
      new THREE.MeshBasicMaterial({ color:0x666666, transparent:true, opacity:0.25, side:THREE.DoubleSide })
    );
    web.position.set(x,y,z);
    web.rotation.set(rot.x||0, rot.y||0, rot.z||0);
    scene.add(web);
  }
  addCobweb(cellCenter(1,1).x-2.5, WALL_H-0.3, cellCenter(1,1).z-2.5, {y:Math.PI*0.25});
  addCobweb(cellCenter(1,13).x+2.5, WALL_H-0.3, cellCenter(1,13).z-2.5, {y:-Math.PI*0.25});
  addCobweb(cellCenter(13,1).x-2.5, WALL_H-0.3, cellCenter(13,1).z+2.5, {y:Math.PI*0.75});
  addCobweb(cellCenter(9,5).x, WALL_H-0.3, cellCenter(9,5).z-2.5, {y:0});

  // Motes
  const MOTE_COUNT = 110;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTE_COUNT*3);
  const moteSpeed = [];
  for (let i=0; i<MOTE_COUNT; i++){
    motePos[i*3]   = (Math.random()-0.5)*COLS*CELL;
    motePos[i*3+1] = Math.random()*WALL_H;
    motePos[i*3+2] = (Math.random()-0.5)*ROWS*CELL;
    moteSpeed.push({ vy: 0.05+Math.random()*0.08, phase: Math.random()*10 });
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ color:0xe0d0a5, size:0.04, transparent:true, opacity:0.35, sizeAttenuation:true });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  // Windows
  function addWindow(r,c,side){
    const pos = cellCenter(r,c);
    const inset = CELL/2 - 0.06;
    let px=pos.x, pz=pos.z, rotY=0;
    if (side==='N'){ pz = pos.z + inset; rotY = 0; }
    if (side==='S'){ pz = pos.z - inset; rotY = Math.PI; }
    if (side==='W'){ px = pos.x + inset; rotY = Math.PI/2; }
    if (side==='E'){ px = pos.x - inset; rotY = -Math.PI/2; }
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8,2.2),
      new THREE.MeshStandardMaterial({ color:0x8faec7, emissive:0x2d485c, emissiveIntensity:0.6, roughness:0.25, side:THREE.DoubleSide })
    );
    pane.position.set(px, WALL_H*0.55, pz);
    pane.rotation.y = rotY;
    scene.add(pane);

    const moon = new THREE.PointLight(0x5e84a8, 0.55, 11);
    moon.position.set(px, WALL_H*0.55, pz);
    scene.add(moon);
  }
  addWindow(0,3,'N');
  addWindow(0,11,'N');
  addWindow(14,9,'S');
  addWindow(7,0,'W');
  addWindow(7,14,'E');

  // Exit Door
  const doorGeo = new THREE.BoxGeometry(CELL*0.7, WALL_H*0.82, 0.3);
  const doorMatLocked = new THREE.MeshStandardMaterial({ color:0x1a1a1a, emissive:0x220000, emissiveIntensity:0.4 });
  const doorMatOpen = new THREE.MeshStandardMaterial({ color:0x113311, emissive:0x114411, emissiveIntensity:0.6 });
  const door = new THREE.Mesh(doorGeo, doorMatLocked);
  door.position.set(exitPos.x, (WALL_H*0.82)/2, exitPos.z);
  door.castShadow = true;
  door.receiveShadow = true;
  scene.add(door);

  function registerCollisionBox(x, z, w, d){
    wallBoxes.push({
      minX: x - w/2, maxX: x + w/2,
      minZ: z - d/2, maxZ: z + d/2
    });
  }

  function addRug(cellR, cellC, w, d, color){
    const pos = cellCenter(cellR, cellC);
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness:0.98 })
    );
    rug.rotation.x = -Math.PI/2;
    rug.position.set(pos.x, 0.02, pos.z);
    rug.receiveShadow = true;
    scene.add(rug);
  }

  function addFrame(x, z, rotY, w, h, color){
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color, roughness:0.8, side:THREE.DoubleSide })
    );
    frame.position.set(x, WALL_H*0.55, z);
    frame.rotation.y = rotY;
    scene.add(frame);
  }

  // ---------- EERIE HORROR DECORATIONS & OCCULT PROPS ----------

  // Blood Splatters Generator (Canvas Textures)
  function createBloodSplatter(x, y, z, rotX, rotY, scaleW=1.2, scaleH=1.2){
    const cnv = document.createElement('canvas'); cnv.width = 128; cnv.height = 128;
    const ctx = cnv.getContext('2d');

    ctx.fillStyle = 'rgba(110, 8, 8, 0.85)';
    ctx.beginPath();
    ctx.arc(64, 64, 25+Math.random()*15, 0, Math.PI*2);
    ctx.fill();

    for(let i=0; i<12; i++){
      ctx.beginPath();
      const angle = Math.random()*Math.PI*2;
      const dist = 20 + Math.random()*35;
      ctx.arc(64 + Math.cos(angle)*dist, 64 + Math.sin(angle)*dist, 2+Math.random()*6, 0, Math.PI*2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cnv);
    const splash = new THREE.Mesh(
      new THREE.PlaneGeometry(scaleW, scaleH),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.88, depthWrite: false })
    );
    splash.position.set(x, y, z);
    splash.rotation.set(rotX, rotY, 0);
    scene.add(splash);
  }

  // Blood pools & splatters on floor and walls
  createBloodSplatter(cellCenter(7,2).x, 0.03, cellCenter(7,2).z, -Math.PI/2, 0, 1.8, 1.8);
  createBloodSplatter(cellCenter(1,11).x + 0.6, 0.03, cellCenter(1,11).z - 0.3, -Math.PI/2, 0, 1.4, 1.4);
  createBloodSplatter(cellCenter(9,10).x - 0.4, 0.03, cellCenter(9,10).z, -Math.PI/2, 0, 1.6, 1.6);
  createBloodSplatter(exitPos.x - 1.2, WALL_H*0.4, exitPos.z + CELL/2 - 0.04, 0, 0, 1.5, 1.5);

  // Occult Pentagram Ritual Circle on Floor
  function createRitualCircle(x, z){
    const cnv = document.createElement('canvas'); cnv.width = 256; cnv.height = 256;
    const ctx = cnv.getContext('2d');
    ctx.strokeStyle = 'rgba(160, 20, 20, 0.75)';
    ctx.lineWidth = 4;

    ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 128, 90, 0, Math.PI*2); ctx.stroke();

    // Pentagram Star
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = 128 + 90 * Math.cos(angle);
      const py = 128 + 90 * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    const tex = new THREE.CanvasTexture(cnv);
    const circle = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false })
    );
    circle.rotation.x = -Math.PI/2;
    circle.position.set(x, 0.025, z);
    scene.add(circle);
  }
  createRitualCircle(cellCenter(8,4).x, cellCenter(8,4).z);

  // Flickering Candles with Dynamic Flame Light
  function addCandle(x, y, z){
    const candleMat = new THREE.MeshStandardMaterial({ color:0xe2d6be, roughness:0.6 });
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.22, 8), candleMat);
    candle.position.set(x, y + 0.11, z);
    candle.castShadow = true;
    scene.add(candle);

    const flameMat = new THREE.MeshBasicMaterial({ color:0xffaa33 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), flameMat);
    flame.position.set(x, y + 0.25, z);
    scene.add(flame);

    const cLight = new THREE.PointLight(0xff9922, 0.7, 4);
    cLight.position.set(x, y + 0.28, z);
    cLight.castShadow = true;
    cLight.shadow.mapSize.width = 256;
    cLight.shadow.mapSize.height = 256;
    scene.add(cLight);

    candleLights.push({ light: cLight, flame, baseIntensity: 0.7, phase: Math.random()*50 });
  }

  addCandle(cellCenter(7,3).x, 0.52, cellCenter(7,3).z); // On Coffee Table
  addCandle(cellCenter(1,5).x + 0.2, 0.92, cellCenter(1,5).z - 0.2); // On Nightstand
  addCandle(cellCenter(12,3).x + 0.4, 0.96, cellCenter(12,3).z - 0.2); // On Desk

  // ---------- HOUSE FURNITURE & ROOM ASSEMBLIES ----------

  // 1. BEDROOM (r:1-4, c:1-6)
  function createBed(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x - 0.5, 0, pos.z);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 3.0), woodMatDark);
    frame.position.y = 0.25;
    frame.castShadow = frame.receiveShadow = true;
    group.add(frame);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.15), woodMatDark);
    headboard.position.set(0, 0.8, -1.4);
    headboard.castShadow = true;
    group.add(headboard);

    const footboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.15), woodMatDark);
    footboard.position.set(0, 0.5, 1.4);
    footboard.castShadow = true;
    group.add(footboard);

    const mattressMat = new THREE.MeshStandardMaterial({ color:0xd0c4b4, roughness:0.9 });
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 2.7), mattressMat);
    mattress.position.set(0, 0.6, 0.05);
    mattress.castShadow = mattress.receiveShadow = true;
    group.add(mattress);

    const pillowMat = new THREE.MeshStandardMaterial({ color:0xe8e0d4, roughness:0.85 });
    const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.5), pillowMat);
    pillow1.position.set(-0.6, 0.9, -1.0);
    pillow1.rotation.y = 0.1;
    group.add(pillow1);

    const pillow2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.5), pillowMat);
    pillow2.position.set(0.6, 0.9, -1.0);
    pillow2.rotation.y = -0.12;
    group.add(pillow2);

    const blanketMat = new THREE.MeshStandardMaterial({ color:0x4a1f1f, roughness:0.95 });
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.15, 1.6), blanketMat);
    blanket.position.set(0, 0.85, 0.5);
    group.add(blanket);

    scene.add(group);
    registerCollisionBox(pos.x - 0.5, pos.z, 2.6, 3.2);
  }
  createBed(1, 2);

  function createNightstand(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), woodMatMid);
    body.position.y = 0.45;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    const drawerLine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.82), woodMatDark);
    drawerLine.position.set(0, 0.5, 0);
    group.add(drawerLine);

    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), brassMat);
    handle.position.set(0, 0.5, 0.43);
    group.add(handle);

    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.3, 8), brassMat);
    lampBase.position.set(0, 1.05, 0);
    group.add(lampBase);

    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 10, 1, true), new THREE.MeshStandardMaterial({color:0x554433, side:THREE.DoubleSide}));
    lampShade.position.set(0, 1.3, 0);
    group.add(lampShade);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 0.9, 0.9);
  }
  createNightstand(1, 5);

  function createWardrobe(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.7), woodMatDark);
    body.position.y = 1.2;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.3, 0.72), woodMatMid);
    trim.position.y = 1.2;
    group.add(trim);

    const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25), brassMat);
    handleL.position.set(-0.1, 1.2, 0.37);
    const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25), brassMat);
    handleR.position.set(0.1, 1.2, 0.37);
    group.add(handleL, handleR);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.7, 0.8);
  }
  createWardrobe(4, 5);

  function createVanity(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 0.6), woodMatMid);
    table.position.y = 0.425;
    table.castShadow = true;
    group.add(table);

    const mirrorFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), woodMatDark);
    mirrorFrame.rotation.x = Math.PI/2;
    mirrorFrame.position.set(0, 1.35, -0.25);
    group.add(mirrorFrame);

    const mirrorGlass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), new THREE.MeshStandardMaterial({color:0x556677, metalness:0.8, roughness:0.2}));
    mirrorGlass.position.set(0, 1.35, -0.22);
    group.add(mirrorGlass);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.5, 0.7);
  }
  createVanity(3, 2);

  addRug(2, 2, 2.8, 3.4, 0x5c2a2a);
  addFrame(cellCenter(1,4).x, cellCenter(1,4).z + CELL/2 - 0.05, 0, 0.8, 1.0, 0x1e1a14);

  // 2. BATHROOM (r:1-4, c:8-14)
  function createBathtub(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const outerTub = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 1.0), porcelainMat);
    outerTub.position.y = 0.375;
    outerTub.castShadow = outerTub.receiveShadow = true;
    group.add(outerTub);

    const waterMat = new THREE.MeshStandardMaterial({ color:0x1a2624, roughness:0.1, metalness:0.8 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), waterMat);
    water.rotation.x = -Math.PI/2;
    water.position.set(0, 0.6, 0);
    group.add(water);

    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2), chromeMat);
    faucet.position.set(-0.7, 0.8, 0);
    group.add(faucet);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.7, 1.1);
  }
  createBathtub(1, 11);

  function createToilet(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.7), porcelainMat);
    base.position.y = 0.225;
    base.castShadow = true;
    group.add(base);

    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.3), porcelainMat);
    tank.position.set(0, 0.65, -0.2);
    tank.castShadow = true;
    group.add(tank);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 0.6, 0.8);
  }
  createToilet(1, 8);

  function createVanitySink(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.8), woodMatDark);
    cabinet.position.y = 0.45;
    cabinet.castShadow = cabinet.receiveShadow = true;
    group.add(cabinet);

    const sinkBasin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.5), porcelainMat);
    sinkBasin.position.set(0, 0.92, 0);
    group.add(sinkBasin);

    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18), chromeMat);
    faucet.position.set(0, 1.05, -0.15);
    group.add(faucet);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.5, 0.9);
  }
  createVanitySink(3, 9);

  // 3. LIVING ROOM (r:6-9, c:1-6)
  function createSofa(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 1.1), fabricMat);
    base.position.y = 0.225;
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.3), fabricMat);
    back.position.set(0, 0.7, -0.4);
    back.castShadow = true;
    group.add(back);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 1.1), fabricMat);
    armL.position.set(-1.3, 0.5, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 1.1), fabricMat);
    armR.position.set(1.3, 0.5, 0);
    group.add(armL, armR);

    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.7), fabricCushion);
    c1.position.set(-0.6, 0.5, 0.05);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.7), fabricCushion);
    c2.position.set(0.6, 0.5, 0.05);
    group.add(c1, c2);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 2.7, 1.2);
  }
  createSofa(8, 2);

  function createArmchair(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x + 1.2, 0, pos.z + 0.8);
    group.rotation.y = -0.6;

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.0), fabricMat);
    base.position.y = 0.225;
    base.castShadow = true;
    group.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.25), fabricMat);
    back.position.set(0, 0.65, -0.38);
    group.add(back);

    scene.add(group);
    registerCollisionBox(pos.x + 1.2, pos.z + 0.8, 1.2, 1.1);
  }
  createArmchair(8, 2);

  function createCoffeeTable(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.85), woodMatMid);
    top.position.y = 0.48;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (let legX of [-0.6, 0.6]){
      for (let legZ of [-0.32, 0.32]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.44), woodMatDark);
        leg.position.set(legX, 0.22, legZ);
        group.add(leg);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.5, 0.95);
  }
  createCoffeeTable(7, 3);

  function createBookshelf(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 1.6), woodMatDark);
    frame.position.y = 1.1;
    frame.castShadow = frame.receiveShadow = true;
    group.add(frame);

    const bookColors = [0x5c2a2a, 0x2a3e5c, 0x3e5c2a, 0x5c502a];
    for (let shelfY of [0.5, 1.0, 1.5]){
      for (let b=0; b<5; b++){
        const bMat = new THREE.MeshStandardMaterial({color: bookColors[b%bookColors.length]});
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.08), bMat);
        book.position.set(0, shelfY, -0.5 + b*0.24);
        group.add(book);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 0.7, 1.7);
  }
  createBookshelf(9, 5);

  function createGrandfatherClock(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x - 1.2, 0, pos.z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 0.5), woodMatDark);
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshStandardMaterial({color:0xe0d4bc}));
    face.position.set(0, 2.0, 0.26);
    group.add(face);

    scene.add(group);
    registerCollisionBox(pos.x - 1.2, pos.z, 0.7, 0.6);
  }
  createGrandfatherClock(9, 2);

  addRug(8, 4, 3.6, 2.8, 0x2a2e3a);
  addFrame(cellCenter(6,4).x, cellCenter(6,4).z - CELL/2 + 0.05, Math.PI, 0.9, 1.1, 0x201a12);

  // CRT TV Setup
  const tvBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), new THREE.MeshStandardMaterial({color:0x1c1c1c, roughness:0.8}));
  tvBody.position.set(cellCenter(6,2).x, 0.85, cellCenter(6,2).z);
  tvBody.castShadow = true;
  scene.add(tvBody);
  registerCollisionBox(cellCenter(6,2).x, cellCenter(6,2).z, 1.0, 0.7);

  const tvCanvas = document.createElement('canvas'); tvCanvas.width=64; tvCanvas.height=48;
  const tvCtx = tvCanvas.getContext('2d');
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  const tvScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6,0.42),
    new THREE.MeshBasicMaterial({ map: tvTex })
  );
  tvScreen.position.set(tvBody.position.x, tvBody.position.y+0.05, tvBody.position.z + 0.31);
  scene.add(tvScreen);

  function drawTvStatic(){
    const w=tvCanvas.width, h=tvCanvas.height;
    const img = tvCtx.createImageData(w,h);
    for (let i=0; i<img.data.length; i+=4){
      const v = Math.random()*255;
      img.data[i]=v*0.7; img.data[i+1]=v*0.75; img.data[i+2]=v*0.85; img.data[i+3]=255;
    }
    tvCtx.putImageData(img,0,0);
    tvTex.needsUpdate = true;
  }

  // 4. KITCHEN & DINING (r:6-9, c:8-14)
  function createKitchenCounter(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 0.9), woodMatMid);
    base.position.y = 0.5;
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.1, 0.95), new THREE.MeshStandardMaterial({color:0x202020, roughness:0.4}));
    top.position.y = 1.05;
    group.add(top);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 3.1, 1.0);
  }
  createKitchenCounter(6, 11);

  for (let i=0; i<3; i++){
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08,0.09,0.12,8),
      new THREE.MeshStandardMaterial({ color:0x555555, metalness:0.7, roughness:0.35 })
    );
    pot.position.set(cellCenter(6,11).x - 0.7 + i*0.5, WALL_H*0.78, cellCenter(6,11).z);
    pot.castShadow = true;
    scene.add(pot);

    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.35,4), new THREE.MeshStandardMaterial({color:0x1a1a1a}));
    hook.position.set(pot.position.x, WALL_H*0.9, pot.position.z);
    scene.add(hook);
  }

  function createDiningSet(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.8), woodMatDark);
    top.position.y = 0.85;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (let lx of [-0.8, 0.8]){
      for (let lz of [-0.8, 0.8]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.8), woodMatMid);
        leg.position.set(lx, 0.4, lz);
        group.add(leg);
      }
    }

    const chairOffsets = [
      {x: 1.2, z: 0, r: -Math.PI/2},
      {x: -1.2, z: 0, r: Math.PI/2},
      {x: 0, z: 1.2, r: 0},
      {x: 0, z: -1.2, r: Math.PI}
    ];

    for (let c of chairOffsets){
      const ch = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), woodMatMid);
      seat.position.y = 0.4;
      ch.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.05), woodMatMid);
      back.position.set(0, 0.65, -0.2);
      ch.add(back);

      ch.position.set(c.x, 0, c.z);
      ch.rotation.y = c.r;
      group.add(ch);
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 2.2, 2.2);
  }
  createDiningSet(9, 12);

  const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.8), new THREE.MeshStandardMaterial({color:0xaaaaaa, roughness:0.4, metalness:0.6}));
  fridge.position.set(cellCenter(9,10).x, 0.95, cellCenter(9,10).z);
  fridge.castShadow = true;
  scene.add(fridge);
  registerCollisionBox(cellCenter(9,10).x, cellCenter(9,10).z, 1.0, 0.9);

  addRug(8, 11, 2.2, 2.2, 0x3a2c1c);

  // 5. ENTRY HALL & STUDY (r:11-14, c:1-14)
  function createDesk(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.7), woodMatDark);
    top.position.y = 0.9;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    const drawers = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 0.65), woodMatMid);
    drawers.position.set(-0.5, 0.4, 0);
    group.add(drawers);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.7, 0.8);
  }
  createDesk(12, 3);

  const coatRackPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), woodMatDark);
  coatRackPole.position.set(cellCenter(11,12).x, 0.9, cellCenter(11,12).z);
  coatRackPole.castShadow = true;
  scene.add(coatRackPole);
  registerCollisionBox(cellCenter(11,12).x, cellCenter(11,12).z, 0.4, 0.4);

  const coat = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.85, 8),
    new THREE.MeshStandardMaterial({ color:0x14100c, roughness:0.95 })
  );
  coat.position.set(coatRackPole.position.x, 1.05, coatRackPole.position.z);
  coat.castShadow = true;
  scene.add(coat);

  addFurnitureStorage(13, 9, 1.8, 0.6, 0.9, 0x2a2016);
  function addFurnitureStorage(cellR, cellC, w, d, h, color){
    const pos = cellCenter(cellR, cellC);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), woodMatMid);
    mesh.position.set(pos.x, h/2, pos.z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    registerCollisionBox(pos.x, pos.z, w, d);
  }

  addRug(12, 7, 4.0, 2.2, 0x3a1f1f);
  addFrame(cellCenter(11,10).x, cellCenter(11,10).z - CELL/2 + 0.05, Math.PI, 0.8, 1.0, 0x1e1810);

  // ---------- REALISTIC PAGE PLACEMENT ON FURNITURE TOPS ----------
  const pageMat = new THREE.MeshStandardMaterial({ color:0xd9b338, emissive:0x6a5416, emissiveIntensity:0.6, roughness:0.7, side:THREE.DoubleSide });
  const pageGeo = new THREE.PlaneGeometry(0.32, 0.45);

  const pages = PAGE_LOCATIONS.map((item, i) => {
    const mesh = new THREE.Mesh(pageGeo, pageMat);
    mesh.rotation.x = -Math.PI/2;
    mesh.rotation.z = (Math.random()-0.5)*0.5;
    mesh.position.copy(item.pos);
    mesh.position.y += 0.01;

    const glow = new THREE.PointLight(0xc9a227, 0.8, 3.5);
    glow.position.set(item.pos.x, item.pos.y + 0.25, item.pos.z);
    scene.add(mesh, glow);

    return { mesh, glow, pos: item.pos, collected: false, note: PAGE_NOTES[i] };
  });

  let pagesCollected = 0;

  // ---------- HIDING SPOTS ----------
  const hideSpots = HIDE_SPOTS.map(cell => {
    const pos = cellCenter(cell.r, cell.c);
    return { pos, radius: 1.6, occupied: false };
  });

  // ---------- ENTITY: "THE WATCHER" ----------
  const skinMat = new THREE.MeshStandardMaterial({ color:0x080808, roughness:0.85, metalness:0.15 });
  const rimMat  = new THREE.MeshBasicMaterial({ color:0x3a4b5c, transparent:true, opacity:0.35, side:THREE.BackSide });
  const eyeMat  = new THREE.MeshBasicMaterial({ color:0xd8e8ff });
  const eyeGlow = new THREE.PointLight(0x6f8fbf, 0, 4);

  function rimmed(geo){
    const g = new THREE.Group();
    const core = new THREE.Mesh(geo, skinMat);
    core.castShadow = true;
    const rim = new THREE.Mesh(geo, rimMat);
    rim.scale.set(1.08, 1.08, 1.08);
    g.add(core, rim);
    return g;
  }

  const entityGroup = new THREE.Group();

  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 1.55;
  const torso = rimmed(new THREE.CylinderGeometry(0.20, 0.30, 1.55, 8));
  torso.children.forEach(m => m.position.y = 0.4);
  torso.rotation.x = 0.18;
  torsoPivot.add(torso);
  entityGroup.add(torsoPivot);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.02, 0.12);
  const head = rimmed(new THREE.SphereGeometry(0.22, 10, 10));
  head.children.forEach(m => m.scale.set(0.8, 1.05, 0.92));
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), skinMat);
  jaw.position.set(0, -0.18, 0.05);
  jaw.rotation.x = Math.PI;
  headPivot.add(head, jaw);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeMat); eyeL.position.set(-0.08, 0.03, 0.19);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeMat); eyeR.position.set(0.08, 0.03, 0.19);
  eyeGlow.position.set(0, 0.03, 0.2);
  headPivot.add(eyeL, eyeR, eyeGlow);
  torsoPivot.add(headPivot);

  function makeArm(sign){
    const shoulder = new THREE.Group();
    shoulder.position.set(sign*0.22, 0.75, 0.05);
    const upper = rimmed(new THREE.CylinderGeometry(0.055, 0.05, 0.62, 6));
    upper.children.forEach(m => m.position.y = -0.31);
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.62;
    const fore = rimmed(new THREE.CylinderGeometry(0.05, 0.038, 0.68, 6));
    fore.children.forEach(m => m.position.y = -0.34);
    elbow.add(fore);

    const hand = new THREE.Group();
    hand.position.y = -0.68;
    for (let i=0; i<3; i++){
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.14, 4), skinMat);
      claw.position.set((i-1)*0.03, -0.08, 0.02);
      claw.rotation.x = 0.5;
      hand.add(claw);
    }
    elbow.add(hand);
    shoulder.add(elbow);
    return { shoulder, elbow };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  torsoPivot.add(armL.shoulder, armR.shoulder);

  function makeLeg(sign){
    const hip = new THREE.Group();
    hip.position.set(sign*0.11, -0.05, 0);
    const thigh = rimmed(new THREE.CylinderGeometry(0.075, 0.06, 0.62, 6));
    thigh.children.forEach(m => m.position.y = -0.31);
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.62;
    const shin = rimmed(new THREE.CylinderGeometry(0.055, 0.045, 0.6, 6));
    shin.children.forEach(m => m.position.y = -0.3);
    knee.add(shin);
    hip.add(knee);
    return { hip, knee };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  entityGroup.add(legL.hip, legR.hip);
  legL.hip.position.y = 0.95;
  legR.hip.position.y = 0.95;

  scene.add(entityGroup);

  const spawnPos = cellCenter(7,7);
  entityGroup.position.copy(spawnPos);
  entityGroup.visible = false;
  let entityActive = false;
  let entityState = 'idle';
  let entityBaseSpeed = 2.35;
  let entityTargetPos = null;
  let lastKnownPlayerPos = null;
  let searchTimer = 0;
  let entWalkPhase = 0;
  let entTwitchT = 0;
  let entHeadTwitchTarget = 0;
  let entHeadTwitchCur = 0;
  const PATROL_POINTS = [ cellCenter(2,9), cellCenter(7,2), cellCenter(9,9), cellCenter(12,3) ];
  let patrolIdx = 0;

  function animateEntity(dt, currentSpeed, distToPlayer, hunting){
    const cycleSpeed = 4.5 + currentSpeed*1.8;
    entWalkPhase += dt * cycleSpeed;
    const swing = Math.sin(entWalkPhase) * (0.55 + Math.min(0.4, currentSpeed*0.12));
    legL.hip.rotation.x = swing;
    legR.hip.rotation.x = -swing;
    legL.knee.rotation.x = Math.max(0, -Math.sin(entWalkPhase + 0.6)) * 0.9;
    legR.knee.rotation.x = Math.max(0, -Math.sin(entWalkPhase + 0.6 + Math.PI)) * 0.9;
    armL.shoulder.rotation.x = -swing*0.8;
    armR.shoulder.rotation.x = swing*0.8;
    armL.elbow.rotation.x = 0.3 + Math.abs(Math.sin(entWalkPhase))*0.4;
    armR.elbow.rotation.x = 0.3 + Math.abs(Math.sin(entWalkPhase+Math.PI))*0.4;

    entityGroup.position.y = Math.abs(Math.sin(entWalkPhase*0.5))*0.05;

    entTwitchT -= dt;
    if (entTwitchT <= 0){
      entTwitchT = hunting ? (0.15 + Math.random()*0.3) : (0.6 + Math.random()*1.2);
      entHeadTwitchTarget = (Math.random()-0.5) * (hunting ? 1.4 : 0.6);
    }
    entHeadTwitchCur += (entHeadTwitchTarget - entHeadTwitchCur) * Math.min(1, dt*14);
    headPivot.rotation.y = entHeadTwitchCur;
    headPivot.rotation.z = Math.sin(entWalkPhase*0.3) * 0.08;

    const closeness = Math.max(0, Math.min(1, 1 - distToPlayer/4));
    const stretch = 1 + closeness*0.22;
    entityGroup.scale.y = stretch;
    torso.rotation.x = 0.18 + closeness*0.25;

    const eyeIntensity = hunting ? (1.0 + closeness*2.0) : 0.15;
    eyeGlow.intensity = eyeIntensity;
    eyeMat.color.setRGB(0.85+closeness*0.15, 0.9, 1);
  }

  // ---------- PLAYER STATE ----------
  let yaw = 0, pitch = 0;
  const move = { f:false, b:false, l:false, r:false, run:false, crouch:false };
  let pointerLocked = false;
  let gameRunning = false;
  let isHiding = false;
  let hidingSpot = null;
  let stamina = 100;
  let staminaExhausted = false;
  let footstepTimer = 0;
  let bobPhase = 0;
  let baseEyeHeight = 1.6;
  let crouchLerp = 0;

  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, pitch));
  });

  document.addEventListener('keydown', (e) => {
    switch(e.code){
      case 'KeyW': move.f = true; break;
      case 'KeyS': move.b = true; break;
      case 'KeyA': move.l = true; break;
      case 'KeyD': move.r = true; break;
      case 'ShiftLeft': case 'ShiftRight': move.run = true; break;
      case 'KeyC': move.crouch = !move.crouch; break;
      case 'KeyF': toggleFlashlight(); break;
      case 'KeyE': tryInteract(); break;
    }
  });
  document.addEventListener('keyup', (e) => {
    switch(e.code){
      case 'KeyW': move.f = false; break;
      case 'KeyS': move.b = false; break;
      case 'KeyA': move.l = false; break;
      case 'KeyD': move.r = false; break;
      case 'ShiftLeft': case 'ShiftRight': move.run = false; break;
    }
  });

  function toggleFlashlight(){
    if (battery <= 0) return;
    flashlightOn = !flashlightOn;
    playClick();
  }

  // ---------- TOUCH CONTROLS ----------
  const touchControlsEl = document.getElementById('touchControls');
  const joystickZone = document.getElementById('joystickZone');
  const joystickKnob = document.getElementById('joystickKnob');
  const lookLayer = document.getElementById('lookLayer');
  const btnFlash = document.getElementById('btnFlash');
  const btnRun = document.getElementById('btnRun');
  const btnCrouch = document.getElementById('btnCrouch');
  const btnInteract = document.getElementById('btnInteract');

  let joyVec = { x:0, y:0 };
  let joyTouchId = null, joyCenter = { x:0, y:0 };
  const JOY_RADIUS = 45;

  function joyStart(e){
    e.preventDefault();
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const rect = joystickZone.getBoundingClientRect();
    joyCenter = { x: rect.left+rect.width/2, y: rect.top+rect.height/2 };
    joyUpdate(t);
  }
  function joyUpdate(t){
    let dx = t.clientX - joyCenter.x, dy = t.clientY - joyCenter.y;
    const dist = Math.hypot(dx,dy);
    if (dist > JOY_RADIUS){ dx = dx/dist*JOY_RADIUS; dy = dy/dist*JOY_RADIUS; }
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joyVec.x = dx / JOY_RADIUS;
    joyVec.y = -dy / JOY_RADIUS;
  }
  function joyEnd(id){
    if (id !== joyTouchId) return;
    joyTouchId = null;
    joyVec.x = 0; joyVec.y = 0;
    joystickKnob.style.transform = 'translate(0px,0px)';
  }
  joystickZone.addEventListener('touchstart', joyStart, { passive:false });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches){
      if (t.identifier === joyTouchId){ e.preventDefault(); joyUpdate(t); }
    }
  }, { passive:false });
  document.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) joyEnd(t.identifier);
  });
  document.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) joyEnd(t.identifier);
  });

  let lookTouchId = null, lastLook = { x:0, y:0 };
  lookLayer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = { x:t.clientX, y:t.clientY };
  }, { passive:false });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches){
      if (t.identifier === lookTouchId){
        e.preventDefault();
        const dx = t.clientX - lastLook.x, dy = t.clientY - lastLook.y;
        yaw -= dx * 0.0045;
        pitch -= dy * 0.0045;
        pitch = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, pitch));
        lastLook = { x:t.clientX, y:t.clientY };
      }
    }
  }, { passive:false });
  document.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
  });

  let touchRunActive = false;
  btnRun.addEventListener('click', () => {
    touchRunActive = !touchRunActive;
    btnRun.classList.toggle('active', touchRunActive);
  });
  btnCrouch.addEventListener('click', () => {
    move.crouch = !move.crouch;
    btnCrouch.classList.toggle('active', move.crouch);
  });
  btnFlash.addEventListener('click', () => {
    toggleFlashlight();
    btnFlash.classList.toggle('active', flashlightOn);
  });
  btnInteract.addEventListener('click', () => tryInteract());
  btnFlash.classList.add('active');

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  const PLAYER_RADIUS = 0.35;
  function collides(x, z){
    for (const b of wallBoxes){
      if (x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
          z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ){
        return true;
      }
    }
    return false;
  }

  // ---------- STORY / NOTE DISPLAY ----------
  const noteDiv = document.getElementById('noteText');
  function showNote(text){
    noteDiv.textContent = text;
    noteDiv.style.opacity = 1;
    clearTimeout(showNote._t);
    showNote._t = setTimeout(() => { noteDiv.style.opacity = 0; }, 6000);
  }

  const whisperDiv = document.getElementById('whisperText');
  function showWhisper(){
    if (!entityActive) return;
    const w = WHISPERS[Math.floor(Math.random()*WHISPERS.length)];
    whisperDiv.textContent = w;
    whisperDiv.style.opacity = 0.88;
    clearTimeout(showWhisper._t);
    showWhisper._t = setTimeout(() => { whisperDiv.style.opacity = 0; }, 1800);
  }

  const interactHintEl = document.getElementById('interactHint');

  function tryInteract(){
    if (!gameRunning) return;

    if (isHiding){
      isHiding = false;
      hidingSpot.occupied = false;
      hidingSpot = null;
      return;
    }

    for (const p of pages){
      if (p.collected) continue;
      const d = camera.position.distanceTo(p.pos);
      if (d < 2.6){
        p.collected = true;
        p.mesh.visible = false;
        p.glow.visible = false;
        pagesCollected++;
        document.getElementById('pageCount').textContent = pagesCollected + ' / 3';
        showNote(p.note);
        playPageChime();
        if (pagesCollected === PAGE_LOCATIONS.length){
          door.material = doorMatOpen;
          const cfg = DIFF[difficulty];
          setTimeout(() => {
            entityGroup.visible = true;
            entityActive = true;
            entityState = 'patrol';
          }, cfg.spawnDelay);
        }
        return;
      }
    }

    for (const spot of hideSpots){
      if (spot.occupied) continue;
      const d = Math.hypot(camera.position.x-spot.pos.x, camera.position.z-spot.pos.z);
      if (d < spot.radius){
        isHiding = true;
        hidingSpot = spot;
        spot.occupied = true;
        camera.position.x = spot.pos.x;
        camera.position.z = spot.pos.z;
        return;
      }
    }
  }

  // ---------- GAME STATE ----------
  let battery = 100;
  let startTime = 0;
  let gameOver = false;

  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const controlsHint = document.getElementById('controlsHint');
  const chapterCard = document.getElementById('chapterCard');
  const jumpscare = document.getElementById('jumpscare');
  const jumpscareText = document.getElementById('jumpscareText');
  const winScreen = document.getElementById('win');
  const againBtn = document.getElementById('againBtn');
  const retryBtn = document.getElementById('retryBtn');
  const fearDiv = document.getElementById('fear');
  const breathFogDiv = document.getElementById('breathFog');
  const batteryFill = document.getElementById('battery-fill');
  const batteryPercent = document.getElementById('batteryPercent');
  const staminaFill = document.getElementById('stamina-fill');
  const roomLabelEl = document.getElementById('roomLabelText');
  const pickupPromptEl = document.getElementById('pickupPrompt');

  if (isTouch){
    controlsHint.textContent = 'Left joystick to move · drag anywhere else to look · buttons to run / crouch / flashlight / use';
  }

  function startGame(){
    if (gameRunning || gameOver) return;
    overlay.classList.add('hidden');
    chapterCard.classList.remove('hidden');
    setTimeout(() => { chapterCard.classList.add('hidden'); }, 4200);
    gameRunning = true;
    startTime = performance.now();
  }

  startBtn.addEventListener('click', () => {
    initAudio();
    if (isTouch){
      touchControlsEl.classList.add('active');
      startGame();
    } else {
      renderer.domElement.requestPointerLock();
    }
  });
  againBtn.addEventListener('click', () => location.reload());
  retryBtn.addEventListener('click', () => location.reload());

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    if (pointerLocked) startGame();
  });

  // ---------- PROCEDURAL AUDIO DESIGN ----------
  let audioCtx = null;
  let droneGain = null;
  function initAudio(){
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 42;
    gain.gain.value = 0.03;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    droneGain = gain;

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine'; osc2.frequency.value = 65;
    gain2.gain.value = 0.01;
    osc2.connect(gain2); gain2.connect(audioCtx.destination);
    osc2.start();
  }

  function playClick(){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square'; osc.frequency.value = 850;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime+0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.06);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.07);
  }

  function playPageChime(){
    if (!audioCtx) return;
    [440, 660, 880].forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      gain.gain.value = 0.0001;
      const t0 = audioCtx.currentTime + i*0.09;
      gain.gain.linearRampToValueAtTime(0.05, t0+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0+0.9);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0+1.0);
    });
  }

  function playFootstep(surface){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = surface==='tile' ? 240 : 115 + Math.random()*20;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.12);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.13);
  }

  function playStinger(){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 95;
    osc.frequency.exponentialRampToValueAtTime(28, audioCtx.currentTime+0.65);
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.45, audioCtx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.85);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.9);
  }

  let lastBeat = 0;
  function heartbeat(intensity){
    if (!audioCtx) return;
    const now = performance.now();
    const interval = 900 - intensity*550;
    if (now - lastBeat < interval) return;
    lastBeat = now;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 58;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.14 + intensity*0.16, audioCtx.currentTime+0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.25);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.3);
  }

  function triggerJumpscare(caughtWhileHiding){
    gameOver = true;
    gameRunning = false;
    document.exitPointerLock();
    touchControlsEl.classList.remove('active');
    playStinger();
    jumpscareText.textContent = caughtWhileHiding
      ? "It found you anyway. Hiding only works if you hold still — and you didn't."
      : "The thing in the house doesn't need to catch you. It just needs you to stop running.";
    jumpscare.style.display = 'flex';
  }

  function triggerWin(){
    gameOver = true;
    gameRunning = false;
    document.exitPointerLock();
    touchControlsEl.classList.remove('active');
    const secs = Math.floor((performance.now()-startTime)/1000);
    document.getElementById('winTime').textContent = `Chapter One survived in ${secs} seconds.`;
    winScreen.style.display = 'flex';
  }

  // ---------- STATIC NOISE CANVAS ----------
  const staticCanvas = document.getElementById('staticNoise');
  const staticCtx = staticCanvas.getContext('2d');
  function resizeStatic(){
    staticCanvas.width = 160;
    staticCanvas.height = Math.round(160 * window.innerHeight/window.innerWidth);
  }
  resizeStatic();
  function drawStatic(){
    const w = staticCanvas.width, h = staticCanvas.height;
    const imgData = staticCtx.createImageData(w,h);
    for (let i=0; i<imgData.data.length; i+=4){
      const v = Math.random()*255;
      imgData.data[i]=v; imgData.data[i+1]=v; imgData.data[i+2]=v; imgData.data[i+3]=255;
    }
    staticCtx.putImageData(imgData,0,0);
  }

  // ---------- MAIN ANIMATION LOOP ----------
  const clock = new THREE.Clock();
  let lastRoomCheck = 0;
  let whisperTimer = 0;
  let staminaRegenDelay = 0;

  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    if (gameRunning && !gameOver){
      const cfg = DIFF[difficulty];

      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = isHiding ? pitch*0.4 : pitch;

      const crouchTarget = move.crouch ? 1 : 0;
      crouchLerp += (crouchTarget - crouchLerp) * Math.min(1, dt*8);
      const targetEyeHeight = baseEyeHeight - crouchLerp*0.55;

      let moving = false;
      let surfaceNoisy = false;

      if (!isHiding){
        const forwardInput = Math.max(-1, Math.min(1, ((move.f?1:0)-(move.b?1:0)) + joyVec.y));
        const strafeInput  = Math.max(-1, Math.min(1, ((move.r?1:0)-(move.l?1:0)) + joyVec.x));
        const inputMag = Math.min(1, Math.hypot(forwardInput, strafeInput));
        moving = inputMag > 0.05;

        const runWanted = (move.run || touchRunActive) && !move.crouch && stamina > 2 && !staminaExhausted;
        const crouchSlow = move.crouch ? 0.55 : 1.0;
        const speedBase = (runWanted ? 4.6 : 2.6) * crouchSlow;
        const speed = speedBase * dt * inputMag;

        const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
        const dx = forwardInput*(-sinY) + strafeInput*(cosY);
        const dz = forwardInput*(-cosY) + strafeInput*(-sinY);
        const mag = Math.hypot(dx,dz) || 1;
        const stepX = (dx/mag)*speed;
        const stepZ = (dz/mag)*speed;

        const nx = camera.position.x + stepX;
        const nz = camera.position.z + stepZ;
        if (!collides(nx, camera.position.z)) camera.position.x = nx;
        if (!collides(camera.position.x, nz)) camera.position.z = nz;

        if (runWanted && moving){
          stamina -= dt*22;
          if (stamina <= 0){ stamina = 0; staminaExhausted = true; }
          staminaRegenDelay = 0.6;
        } else {
          staminaRegenDelay -= dt;
          if (staminaRegenDelay <= 0){
            stamina += dt*14;
            if (stamina > 100) stamina = 100;
            if (stamina > 30) staminaExhausted = false;
          }
        }

        if (moving){
          bobPhase += dt * (runWanted ? 11 : 6.5);
          footstepTimer -= dt;
          if (footstepTimer <= 0){
            footstepTimer = runWanted ? 0.28 : 0.44;
            const gr = Math.round(camera.position.z / CELL + ROWS/2);
            const gc = Math.round(camera.position.x / CELL + COLS/2);
            playFootstep(roomNameAt(gr,gc)==='BATHROOM' ? 'tile' : 'wood');
            surfaceNoisy = runWanted;
          }
        } else {
          bobPhase *= 0.9;
        }
        const bobY = Math.sin(bobPhase)*0.045*(moving?1:0);
        camera.position.y = targetEyeHeight + bobY;
      } else {
        camera.position.y = targetEyeHeight - 0.3;
      }

      flashlight.position.set(camera.position.x, camera.position.y+0.2, camera.position.z);
      const dir = new THREE.Vector3(0,0,-1).applyEuler(camera.rotation);
      flashTarget.position.set(camera.position.x+dir.x, camera.position.y+dir.y, camera.position.z+dir.z);

      // Candle light flickering
      for (const c of candleLights){
        c.phase += dt * 15;
        c.light.intensity = c.baseIntensity + Math.sin(c.phase)*0.15 + (Math.random()-0.5)*0.1;
      }

      // Flashlight flicker on low battery
      flashFlickerT += dt;
      let flickerMod = 1;
      if (flashlightOn && battery < 15 && battery > 0){
        flickerMod = (Math.sin(flashFlickerT*40) > -0.3) ? 1 : 0.15;
      }
      flashlight.intensity = (flashlightOn && !isHiding && battery > 0) ? Math.max(0.15, (battery/100))*2.5*flickerMod : 0;

      if (flashlightOn && battery > 0 && !isHiding){
        battery -= dt*1.0*cfg.batteryDrain;
        if (battery < 0) battery = 0;
        if (battery === 0) flashlightOn = false;
      }
      batteryFill.style.width = battery + '%';
      if (batteryPercent) batteryPercent.textContent = Math.round(battery) + '%';
      batteryFill.classList.toggle('low', battery < 20 && battery > 0);
      staminaFill.style.width = stamina + '%';

      if (battery < 25){
        drawStatic();
        staticCanvas.style.opacity = (0.25 - battery/100) * 0.9;
      } else {
        staticCanvas.style.opacity = 0;
      }

      let breathAmt = 0;

      lastRoomCheck += dt;
      if (lastRoomCheck > 0.4){
        lastRoomCheck = 0;
        const gr = Math.round(camera.position.z / CELL + ROWS/2);
        const gc = Math.round(camera.position.x / CELL + COLS/2);
        roomLabelEl.textContent = roomNameAt(gr, gc);
      }

      let nearPage = false;
      for (const p of pages){
        if (p.collected) continue;
        if (camera.position.distanceTo(p.pos) < 2.6) nearPage = true;
      }

      let nearHide = false;
      if (!isHiding){
        for (const spot of hideSpots){
          if (spot.occupied) continue;
          const d = Math.hypot(camera.position.x-spot.pos.x, camera.position.z-spot.pos.z);
          if (d < spot.radius) nearHide = true;
        }
      }

      pickupPromptEl.classList.toggle('show', nearPage);
      if (isHiding){
        interactHintEl.textContent = '[ E ] STOP HIDING';
        interactHintEl.classList.add('show');
      } else if (nearHide){
        interactHintEl.textContent = '[ E ] HIDE';
        interactHintEl.classList.add('show');
      } else {
        interactHintEl.classList.remove('show');
      }

      const mp = motes.geometry.attributes.position.array;
      for (let i=0; i<MOTE_COUNT; i++){
        const s = moteSpeed[i];
        s.phase += dt*0.4;
        mp[i*3]   += Math.sin(s.phase)*0.0015;
        mp[i*3+1] += s.vy*dt*0.3;
        mp[i*3+2] += Math.cos(s.phase*0.7)*0.0015;
        if (mp[i*3+1] > WALL_H) mp[i*3+1] = 0;
      }
      motes.geometry.attributes.position.needsUpdate = true;

      if (Math.random() < 0.3) drawTvStatic();

      for (const d of doors){
        const distP = Math.hypot(camera.position.x-d.center.x, camera.position.z-d.center.z);
        const wantOpen = distP < d.triggerR || d.slammed;
        const target = wantOpen ? d.openY : d.closedY;
        d.pivot.rotation.y += (target - d.pivot.rotation.y) * Math.min(1, dt * (d.slammed?9:2.2));
      }

      for (const l of lamps){
        l.flickerPhase += dt;
        if (l.willDie && l.deadUntil <= 0 && Math.random() < 0.0025){
          l.deadUntil = 0.3 + Math.random()*1.2;
        }
        if (l.deadUntil > 0){
          l.deadUntil -= dt;
          l.light.intensity = l.base * 0.05;
        } else {
          l.light.intensity = l.base * (0.85 + Math.random()*0.15);
        }
      }

      if (pagesCollected === PAGE_LOCATIONS.length){
        exitLight.intensity = 1.4 + Math.sin(performance.now()*0.004)*0.4;
        const distToExit = Math.hypot(camera.position.x-exitPos.x, camera.position.z-exitPos.z);
        if (distToExit < 2.2) triggerWin();
      }

      // ENTITY AI
      if (entityActive){
        const ex = entityGroup.position.x, ez = entityGroup.position.z;
        const distToPlayer = Math.hypot(camera.position.x-ex, camera.position.z-ez);

        const flashlightBoost = (flashlightOn && !isHiding) ? 1.4 : 1.0;
        const crouchStealth = move.crouch ? 0.55 : 1.0;
        const noiseBoost = (surfaceNoisy ? 1.3 : 1.0) * (moving && !move.crouch ? 1.15 : 1.0);
        const hearingRange = 9 * cfg.hearingMult * flashlightBoost * crouchStealth * noiseBoost;

        const canSense = !isHiding && distToPlayer < hearingRange;

        if (canSense && entityState !== 'hunting'){
          entityState = 'hunting';
          lastKnownPlayerPos = camera.position.clone();
          showWhisper();
          playStinger();
          for (const d of doors){
            if (Math.hypot(d.center.x-ex, d.center.z-ez) < CELL*2.2) d.slammed = true;
          }
        }

        if (entityState === 'hunting'){
          if (canSense) lastKnownPlayerPos = camera.position.clone();
          entityTargetPos = lastKnownPlayerPos;
          searchTimer = 4.5;
        } else if (entityState === 'searching'){
          searchTimer -= dt;
          if (searchTimer <= 0){
            entityState = 'patrol';
            for (const d of doors) d.slammed = false;
          }
        } else if (entityState === 'patrol'){
          const p = PATROL_POINTS[patrolIdx];
          entityTargetPos = p;
          if (Math.hypot(ex-p.x, ez-p.z) < 1.0){
            patrolIdx = (patrolIdx+1) % PATROL_POINTS.length;
          }
        }

        let curEntSpeed = 0;
        if (entityTargetPos){
          const toPx = entityTargetPos.x - ex, toPz = entityTargetPos.z - ez;
          const distTarget = Math.hypot(toPx, toPz);
          if (distTarget > 0.2){
            const nx2 = toPx/distTarget, nz2 = toPz/distTarget;
            const stateSpeedMult = entityState==='hunting' ? 1.35 : entityState==='searching' ? 0.9 : 0.6;
            const moveDist = entityBaseSpeed * cfg.entitySpeedMult * stateSpeedMult * dt;
            curEntSpeed = moveDist/dt;
            const tryX = ex + nx2*moveDist, tryZ = ez + nz2*moveDist;
            if (!collides(tryX, ez)) entityGroup.position.x = tryX;
            if (!collides(entityGroup.position.x, tryZ)) entityGroup.position.z = tryZ;
          } else if (entityState === 'hunting'){
            entityState = 'searching';
            searchTimer = 4.0;
          }
        }
        const lookTarget = new THREE.Vector3(camera.position.x, entityGroup.position.y+1.5, camera.position.z);
        entityGroup.lookAt(lookTarget);
        animateEntity(dt, curEntSpeed, distToPlayer, entityState === 'hunting');

        const dist = distToPlayer;
        const fearAmt = isHiding ? Math.max(0, Math.min(0.5, 1 - dist/14)) : Math.max(0, Math.min(1, 1 - dist/14));
        fearDiv.style.opacity = fearAmt;
        breathAmt = Math.max(breathAmt, fearAmt*0.6);
        heartbeat(fearAmt);

        whisperTimer -= dt;
        if (entityState==='hunting' && dist < 10 && whisperTimer <= 0){
          whisperTimer = 2.5 + Math.random()*2;
          showWhisper();
        }

        if (!isHiding && dist < 1.15){
          triggerJumpscare(false);
        } else if (isHiding && dist < 1.4 && move.crouch === false && moving){
          triggerJumpscare(true);
        }
      }

      breathFogDiv.style.opacity = breathAmt;
    }

    renderer.render(scene, camera);
  }
  animate();

  function handleResize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeStatic();
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 300));
})();
