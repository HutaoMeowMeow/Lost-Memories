(function(){
  "use strict";

  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  // ---------- DIFFICULTY CONFIG ----------
  let difficulty = 'normal';
  const DIFF = {
    calm:      { entitySpeedMult: 0.75, batteryDrain: 0.55, hearingMult: 0.7,  spawnDelay: 4000 },
    normal:    { entitySpeedMult: 1.0,  batteryDrain: 1.0,  hearingMult: 1.0,  spawnDelay: 1500 },
    nightmare: { entitySpeedMult: 1.28, batteryDrain: 2.8,  hearingMult: 1.4,  spawnDelay: 500 }
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
  const WALL_H = 5.4;

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
  const EXIT = { r:1, c:13 };

  function cellCenter(r,c){
    return new THREE.Vector3((c - COLS/2)*CELL, 0, (r - ROWS/2)*CELL);
  }

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const SAFE_SPAWN_LOCATIONS = [
    { r: 13, c: 1, yaw: 0 },
    { r: 13, c: 6, yaw: Math.PI / 2 },
    { r: 7, c: 4, yaw: Math.PI / 4 },
    { r: 8, c: 8, yaw: -Math.PI / 2 },
    { r: 4, c: 3, yaw: -Math.PI / 4 },
    { r: 4, c: 11, yaw: Math.PI },
    { r: 11, c: 3, yaw: 0 }
  ];

  const ALL_PAGE_LOCATIONS = [
    { posCell: {r:1, c:5}, h: 0.95, room: "Bedroom Nightstand" },
    { posCell: {r:2, c:1}, h: 0.90, room: "Bedroom Vanity" },
    { posCell: {r:3, c:8}, h: 0.98, room: "Bathroom Sink Counter" },
    { posCell: {r:8, c:3}, h: 0.54, room: "Living Room Coffee Table" },
    { posCell: {r:9, c:5}, h: 1.12, room: "Living Room Bookshelf" },
    { posCell: {r:6, c:11}, h: 1.15, room: "Kitchen Counter" },
    { posCell: {r:9, c:11}, h: 0.94, room: "Dining Room Table" },
    { posCell: {r:12, c:1}, h: 0.98, room: "Study Desk" },
    { posCell: {r:13, c:9}, h: 0.96, room: "Entry Console Table" }
  ];

  // DISTINCT LORE TITLES & CREEPY HANDWRITTEN NOTES FOR THE 3 PAGES
  const PAGE_NOTES = [
    {
      eyebrow: "JOURNAL PAGE 1 OF 3",
      title: "JOURNAL ENTRY I — THE INVITATION",
      body: "\"Day one. The heavy oak doors chained themselves shut behind me at midnight. I followed an invitation nobody sent, up the porch steps of a house forgotten by time. The air in here is freezing cold and thick with decay. Something inside is breathing in the dark... waiting for me to step into the shadows.\""
    },
    {
      eyebrow: "JOURNAL PAGE 2 OF 3",
      title: "JOURNAL ENTRY II — THE AWAKENING",
      body: "\"IT HAS AWAKENED! There's a second set of footprints in the dust. They match mine, but they're following me backwards. I heard a bone-chilling screech echo through the halls—The Watcher is hunting me right now! I must keep moving and find the last page before it catches me!\""
    },
    {
      eyebrow: "JOURNAL PAGE 3 OF 3",
      title: "JOURNAL ENTRY III — THE ESCAPE",
      body: "\"THE CHAINS HAVE BROKEN! As I picked up this final page, I heard the heavy iron lock shatter at the front entrance. The Gothic exit doors are unlocked and cracked open! RUN FOR THE MAIN EXIT NOW BEFORE THE SHADOW CONSUMES YOU FOR GOOD!\""
    }
  ];

  const HIDE_SPOTS = [ {r:4,c:5}, {r:9,c:5}, {r:9,c:11} ];
  const WHISPERS = [
    "closer...", "behind you...", "look at me...", "i remember your face...", "don't turn around...", "it's right behind you...", "run..."
  ];

  function roomNameAt(r,c){
    if (r <= 4)  return c <= 6 ? "BEDROOM" : "BATHROOM";
    if (r >= 6 && r <= 9) return c <= 6 ? "LIVING ROOM" : "KITCHEN & DINING";
    if (r >= 11) return "ENTRY HALL & STUDY";
    return "HALLWAY";
  }

  // ---------- SCENE & RENDERER SETUP ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030202, 0.048);
  scene.background = new THREE.Color(0x030202);

  const initialSpawn = SAFE_SPAWN_LOCATIONS[Math.floor(Math.random() * SAFE_SPAWN_LOCATIONS.length)];

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 200);
  camera.position.copy(cellCenter(initialSpawn.r, initialSpawn.c));
  camera.position.y = 1.6;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.84;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0x2a201a, 0.78);
  scene.add(ambientLight);

  // ---------- PROCEDURAL PBR TEXTURES & MATERIALS ----------
  function addGrime(ctx, w, h){
    ctx.fillStyle = 'rgba(15, 10, 6, 0.28)';
    for (let i=0; i<16; i++){
      ctx.beginPath();
      ctx.ellipse(Math.random()*w, Math.random()*h, 12+Math.random()*28, 8+Math.random()*20, Math.random()*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = 1.5;
    for (let i=0; i<8; i++){
      let x = Math.random()*w, y = Math.random()*h;
      ctx.beginPath(); ctx.moveTo(x,y);
      const segs = 4+Math.floor(Math.random()*7);
      for (let s=0; s<segs; s++){
        x += (Math.random()-0.5)*35;
        y += (Math.random()-0.5)*35;
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

  function makeWallpaperTexture(base, stripe, wainscot){
    const w=512, h=512;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);

    ctx.fillStyle = stripe;
    for (let x=0; x<w; x+=64) ctx.fillRect(x, 0, 24, h);

    ctx.strokeStyle = stripe; ctx.lineWidth = 3;
    for (let y=32; y<h; y+=96){
      for (let x=12; x<w; x+=64){
        ctx.beginPath(); ctx.arc(x+12, y, 16, 0, Math.PI*2); ctx.stroke();
      }
    }

    for (let i=0; i<8000; i++){
      const val = Math.floor(Math.random()*40);
      ctx.fillStyle = `rgba(${val},${val},${val},0.08)`;
      ctx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
    }
    addGrime(ctx, w, h);

    ctx.fillStyle = wainscot;
    ctx.fillRect(0, h-160, w, 160);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, h-160, w, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    for (let x=0; x<w; x+=80){
      ctx.strokeRect(x+8, h-148, 64, 136);
    }

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makeTileTexture(base, line, wainscot){
    const w=512, h=512;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = line; ctx.lineWidth = 4;
    for (let x=0; x<=w; x+=64){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y=0; y<=h; y+=64){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    addGrime(ctx, w, h);

    ctx.fillStyle = wainscot;
    ctx.fillRect(0, h-140, w, 140);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, h-140, w, 6);

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makePlankTexture(base, line){
    const w=512, h=512, plankH=64;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);

    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for(let y=0; y<h; y+=2){
      if(Math.random()<0.65) ctx.fillRect(0,y,w,1);
    }

    ctx.strokeStyle = line; ctx.lineWidth = 5;
    for (let y=0; y<h; y+=plankH){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    for (let y=0; y<h; y+=plankH*2) { ctx.beginPath(); ctx.moveTo(w*0.5,y); ctx.lineTo(w*0.5,y+plankH); ctx.stroke(); }
    for (let y=plankH; y<h; y+=plankH*2) { ctx.beginPath(); ctx.moveTo(w*0.25,y); ctx.lineTo(w*0.25,y+plankH); ctx.stroke(); }

    addGrime(ctx, w, h);

    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  function makeStoneTexture(){
    const w=256, h=256;
    const cnv = document.createElement('canvas'); cnv.width=w; cnv.height=h;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#22201e'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#0e0d0c'; ctx.lineWidth = 4;
    for(let y=0; y<=h; y+=32){
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }
    for(let y=0; y<h; y+=32){
      const offset = (y % 64 === 0) ? 0 : 32;
      for(let x=offset; x<=w; x+=64){
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+32); ctx.stroke();
      }
    }
    addGrime(ctx, w, h);
    const tex = new THREE.CanvasTexture(cnv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const bumpMap = generateNormalFromCanvas(cnv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map: tex, bumpMap };
  }

  const bedroomTex  = makeWallpaperTexture('#261720','#1c1017','#100a0d');
  const bathroomTex = makeTileTexture('#242e30','rgba(0,0,0,0.45)','#0e1314');
  const livingTex   = makeWallpaperTexture('#1a2215','#13190e','#090e06');
  const kitchenTex  = makeWallpaperTexture('#241f14','#1c170e','#0e0b06');
  const entryTex    = makeWallpaperTexture('#201a14','#17120e','#0b0805');
  const stoneTex    = makeStoneTexture();

  const bedroomWallMat  = new THREE.MeshStandardMaterial({ map: bedroomTex.map, bumpMap: bedroomTex.bumpMap, bumpScale: 0.05, color:0x8e767e, roughness:0.88, metalness: 0.1 });
  const bathroomWallMat = new THREE.MeshStandardMaterial({ map: bathroomTex.map, bumpMap: bathroomTex.bumpMap, bumpScale: 0.06, color:0x7e9396, roughness:0.45, metalness: 0.2 });
  const livingWallMat   = new THREE.MeshStandardMaterial({ map: livingTex.map, bumpMap: livingTex.bumpMap, bumpScale: 0.05, color:0x79886c, roughness:0.88, metalness: 0.1 });
  const kitchenWallMat  = new THREE.MeshStandardMaterial({ map: kitchenTex.map, bumpMap: kitchenTex.bumpMap, bumpScale: 0.05, color:0x8b7e5f, roughness:0.88, metalness: 0.1 });
  const entryWallMat    = new THREE.MeshStandardMaterial({ map: entryTex.map, bumpMap: entryTex.bumpMap, bumpScale: 0.05, color:0x7f7463, roughness:0.88, metalness: 0.1 });
  const stoneMat        = new THREE.MeshStandardMaterial({ map: stoneTex.map, bumpMap: stoneTex.bumpMap, bumpScale: 0.08, color:0x55504c, roughness:0.9 });

  const floorTex = makePlankTexture('#181007', '#0a0602');
  floorTex.map.repeat.set(COLS*1.2, ROWS*1.2);
  floorTex.bumpMap.repeat.set(COLS*1.2, ROWS*1.2);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex.map, bumpMap: floorTex.bumpMap, bumpScale: 0.06, color:0x8c7c69, roughness:0.82, metalness:0.1 });
  const ceilMat  = new THREE.MeshStandardMaterial({ color:0x080605, roughness:0.95 });

  // Wood & Furniture Materials
  const woodMatDark  = new THREE.MeshStandardMaterial({ color:0x1c130b, roughness:0.8 });
  const woodMatMid   = new THREE.MeshStandardMaterial({ color:0x2c1f14, roughness:0.85 });
  const woodMatMahogany = new THREE.MeshStandardMaterial({ color:0x3c180e, roughness:0.75 });
  const fabricMat    = new THREE.MeshStandardMaterial({ color:0x3a3236, roughness:0.95 });
  const fabricCushion= new THREE.MeshStandardMaterial({ color:0x2c2628, roughness:0.9 });
  const brassMat     = new THREE.MeshStandardMaterial({ color:0x8a703a, metalness:0.85, roughness:0.25 });
  const ironMat      = new THREE.MeshStandardMaterial({ color:0x1a1a1a, metalness:0.9, roughness:0.4 });
  const porcelainMat = new THREE.MeshStandardMaterial({ color:0xd0d0d0, roughness:0.3, metalness:0.1 });
  const chromeMat    = new THREE.MeshStandardMaterial({ color:0xa0a0a0, metalness:0.92, roughness:0.15 });

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

        // Add Crown Molding & Baseboard Trims
        const baseboard = new THREE.Mesh(
          new THREE.BoxGeometry(CELL*1.01, 0.28, CELL*1.01),
          woodMatDark
        );
        baseboard.position.set(pos.x, 0.14, pos.z);
        scene.add(baseboard);

        const crownMolding = new THREE.Mesh(
          new THREE.BoxGeometry(CELL*1.01, 0.22, CELL*1.01),
          woodMatDark
        );
        crownMolding.position.set(pos.x, WALL_H - 0.11, pos.z);
        scene.add(crownMolding);
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
  const hideSpots = [];
  const mirrors = [];
  let ambientExtinguished = false;

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

    lamps.push({ light, bulb, base: intensity, flickerPhase: Math.random()*100, willDie: Math.random()<0.4, deadUntil:0 });
    return light;
  }
  addLamp(2, 3, 0.85, 10);
  addLamp(2, 11, 0.65, 9);
  addLamp(7, 2, 0.9, 11);
  addLamp(7, 11, 0.9, 11);
  addLamp(12, 6, 0.8, 12);

  const flashlight = new THREE.SpotLight(0xfff2dc, 2.8, 30, Math.PI/6.2, 0.42, 1.4);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.width = 1024;
  flashlight.shadow.mapSize.height = 1024;
  flashlight.shadow.camera.near = 0.2;
  flashlight.shadow.camera.far = 32;
  flashlight.shadow.bias = -0.001;

  const flashTarget = new THREE.Object3D();
  scene.add(flashlight, flashTarget);
  flashlight.target = flashTarget;
  let flashlightOn = true;
  let flashFlickerT = 0;

  // ---------- REALISTIC GOTHIC FRONT EXIT DOOR SYSTEM ----------
  const exitPos = cellCenter(EXIT.r, EXIT.c);

  const archGroup = new THREE.Group();
  archGroup.position.set(exitPos.x, 0, exitPos.z);

  const archThickness = 0.8;
  const doorWidth = CELL * 0.75;
  const doorHeight = WALL_H * 0.85;

  const archLeft = new THREE.Mesh(new THREE.BoxGeometry(archThickness, doorHeight + 0.4, archThickness), stoneMat);
  archLeft.position.set(-doorWidth/2 - archThickness/2, (doorHeight+0.4)/2, 0);
  archLeft.castShadow = archLeft.receiveShadow = true;

  const archRight = new THREE.Mesh(new THREE.BoxGeometry(archThickness, doorHeight + 0.4, archThickness), stoneMat);
  archRight.position.set(doorWidth/2 + archThickness/2, (doorHeight+0.4)/2, 0);
  archRight.castShadow = archRight.receiveShadow = true;

  const archTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + archThickness*2, WALL_H - doorHeight, archThickness), stoneMat);
  archTop.position.set(0, doorHeight + (WALL_H - doorHeight)/2, 0);
  archTop.castShadow = archTop.receiveShadow = true;

  archGroup.add(archLeft, archRight, archTop);

  const signCanvas = document.createElement('canvas'); signCanvas.width = 256; signCanvas.height = 64;
  const signCtx = signCanvas.getContext('2d');
  signCtx.fillStyle = '#14100c'; signCtx.fillRect(0,0,256,64);
  signCtx.strokeStyle = '#8a703a'; signCtx.lineWidth = 4; signCtx.strokeRect(4,4,248,56);
  signCtx.fillStyle = '#d4af37'; signCtx.font = 'bold 24px serif'; signCtx.textAlign = 'center';
  signCtx.fillText('MAIN EXIT', 128, 40);
  const signTex = new THREE.CanvasTexture(signCanvas);
  const signPlaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 }));
  signPlaque.position.set(0, doorHeight + 0.3, archThickness/2 + 0.02);
  archGroup.add(signPlaque);

  scene.add(archGroup);

  const exitDoorPivotL = new THREE.Group();
  exitDoorPivotL.position.set(exitPos.x - doorWidth/2, 0, exitPos.z);

  const exitDoorPivotR = new THREE.Group();
  exitDoorPivotR.position.set(exitPos.x + doorWidth/2, 0, exitPos.z);

  const panelW = doorWidth / 2;
  const doorThickness = 0.16;

  function createGothicDoorLeaf(sign){
    const leafGroup = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(panelW, doorHeight, doorThickness), woodMatMahogany);
    leaf.position.set(sign * panelW/2, doorHeight/2, 0);
    leaf.castShadow = leaf.receiveShadow = true;
    leafGroup.add(leaf);

    for (let y = 0.5; y < doorHeight; y += 1.0) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(panelW*0.9, 0.08, doorThickness*1.15), ironMat);
      strap.position.set(sign * panelW/2, y, 0);
      leafGroup.add(strap);
    }

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 12), ironMat);
    ring.position.set(sign * (panelW*0.8), doorHeight*0.5, doorThickness/2 + 0.03);
    leafGroup.add(ring);

    return leafGroup;
  }

  exitDoorPivotL.add(createGothicDoorLeaf(1));
  exitDoorPivotR.add(createGothicDoorLeaf(-1));
  scene.add(exitDoorPivotL, exitDoorPivotR);

  const chainGroup = new THREE.Group();
  chainGroup.position.set(exitPos.x, doorHeight*0.5, exitPos.z + 0.12);

  const padlock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.1), ironMat);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 12, Math.PI), ironMat);
  shackle.position.y = 0.12;
  chainGroup.add(padlock, shackle);

  for (let i = -3; i <= 3; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 8), ironMat);
    link.position.set(i * 0.08, 0, 0);
    link.rotation.y = i % 2 === 0 ? 0 : Math.PI/2;
    chainGroup.add(link);
  }
  scene.add(chainGroup);

  const exitLight = new THREE.PointLight(0xd4af37, 0, 14);
  exitLight.position.set(exitPos.x, 2.2, exitPos.z + 0.5);
  scene.add(exitLight);

  // ---------- DOORS & ROOM ARCHITECTURE ----------
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

  const beamMat = new THREE.MeshStandardMaterial({ color:0x0f0a06, roughness:0.92 });
  for (let r=2; r<ROWS-1; r+=3){
    const beam = new THREE.Mesh(new THREE.BoxGeometry(COLS*CELL*0.94, 0.24, 0.32), beamMat);
    beam.position.set(0, WALL_H-0.15, cellCenter(r,0).z);
    beam.castShadow = true;
    scene.add(beam);
  }

  // ---------- DUST MOTES (VOLUMETRIC FLASHLIGHT BEAM PARTICLES) ----------
  const MOTE_COUNT = 220;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTE_COUNT * 3);
  const moteColors = new Float32Array(MOTE_COUNT * 3);
  const moteSpeed = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    motePos[i*3]     = (Math.random() - 0.5) * COLS * CELL;
    motePos[i*3+1]   = Math.random() * WALL_H;
    motePos[i*3+2]   = (Math.random() - 0.5) * ROWS * CELL;
    moteColors[i*3]   = 0.05;
    moteColors[i*3+1] = 0.04;
    moteColors[i*3+2] = 0.03;
    moteSpeed.push({ vy: 0.03 + Math.random() * 0.07, phase: Math.random() * 10 });
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColors, 3));
  const moteMat = new THREE.PointsMaterial({
    size: 0.06,
    transparent: true,
    opacity: 0.85,
    vertexColors: true,
    sizeAttenuation: true
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

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

  function createBloodSplatter(x, y, z, rotX, rotY, scaleW=1.4, scaleH=1.4){
    const cnv = document.createElement('canvas'); cnv.width = 128; cnv.height = 128;
    const ctx = cnv.getContext('2d');

    ctx.fillStyle = 'rgba(120, 8, 8, 0.88)';
    ctx.beginPath();
    ctx.arc(64, 64, 25+Math.random()*15, 0, Math.PI*2);
    ctx.fill();

    for(let i=0; i<14; i++){
      ctx.beginPath();
      const angle = Math.random()*Math.PI*2;
      const dist = 20 + Math.random()*38;
      ctx.arc(64 + Math.cos(angle)*dist, 64 + Math.sin(angle)*dist, 2+Math.random()*6, 0, Math.PI*2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(cnv);
    const splash = new THREE.Mesh(
      new THREE.PlaneGeometry(scaleW, scaleH),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false })
    );
    splash.position.set(x, y, z);
    splash.rotation.set(rotX, rotY, 0);
    scene.add(splash);
  }

  createBloodSplatter(cellCenter(7,2).x, 0.03, cellCenter(7,2).z, -Math.PI/2, 0, 1.8, 1.8);
  createBloodSplatter(cellCenter(1,11).x + 0.6, 0.03, cellCenter(1,11).z - 0.3, -Math.PI/2, 0, 1.4, 1.4);
  createBloodSplatter(cellCenter(9,10).x - 0.4, 0.03, cellCenter(9,10).z, -Math.PI/2, 0, 1.6, 1.6);
  createBloodSplatter(exitPos.x - 1.2, WALL_H*0.4, exitPos.z + CELL/2 - 0.04, 0, 0, 1.5, 1.5);

  function createRitualCircle(x, z){
    const cnv = document.createElement('canvas'); cnv.width = 256; cnv.height = 256;
    const ctx = cnv.getContext('2d');
    ctx.strokeStyle = 'rgba(160, 20, 20, 0.78)';
    ctx.lineWidth = 4;

    ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 128, 90, 0, Math.PI*2); ctx.stroke();

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
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.82, depthWrite: false })
    );
    circle.rotation.x = -Math.PI/2;
    circle.position.set(x, 0.025, z);
    scene.add(circle);
  }
  createRitualCircle(cellCenter(8,4).x, cellCenter(8,4).z);

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

    const cLight = new THREE.PointLight(0xff9922, 0.75, 4.5);
    cLight.position.set(x, y + 0.28, z);
    cLight.castShadow = true;
    scene.add(cLight);

    candleLights.push({ light: cLight, flame, baseIntensity: 0.75, phase: Math.random()*50 });
  }

  addCandle(cellCenter(8,3).x, 0.52, cellCenter(8,3).z);
  addCandle(cellCenter(1,5).x + 0.2, 0.92, cellCenter(1,5).z - 0.2);
  addCandle(cellCenter(12,1).x + 0.4, 0.96, cellCenter(12,1).z - 0.2);

  // ---------- HOUSE FURNITURE & INTERACTIVE SPOTS ----------
  function createBed(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const bedPos = new THREE.Vector3(pos.x, 0, pos.z - CELL/2 + 1.5);
    group.position.copy(bedPos);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 3.0), woodMatDark);
    frame.position.y = 0.25;
    frame.castShadow = frame.receiveShadow = true;
    group.add(frame);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.16), woodMatMahogany);
    headboard.position.set(0, 0.9, -1.4);
    headboard.castShadow = headboard.receiveShadow = true;
    group.add(headboard);

    const footboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 0.16), woodMatMahogany);
    footboard.position.set(0, 0.5, 1.4);
    footboard.castShadow = footboard.receiveShadow = true;
    group.add(footboard);

    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 2.7), new THREE.MeshStandardMaterial({ color:0xd0c4b4, roughness:0.9 }));
    mattress.position.set(0, 0.6, 0.05);
    mattress.castShadow = mattress.receiveShadow = true;
    group.add(mattress);

    const pillowMat = new THREE.MeshStandardMaterial({ color:0xe8e0d4, roughness:0.85 });
    const pillow1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.5), pillowMat);
    pillow1.position.set(-0.6, 0.9, -1.0); pillow1.rotation.y = 0.08; pillow1.castShadow = true;
    const pillow2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.5), pillowMat);
    pillow2.position.set(0.6, 0.9, -1.0); pillow2.rotation.y = -0.08; pillow2.castShadow = true;
    group.add(pillow1, pillow2);

    const blanket = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.15, 1.6), new THREE.MeshStandardMaterial({ color:0x4a1f1f, roughness:0.95 }));
    blanket.position.set(0, 0.85, 0.5); blanket.castShadow = blanket.receiveShadow = true;
    group.add(blanket);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 1.5, 2.6, 3.2);

    hideSpots.push({
      id: 'bed_' + cellR + '_' + cellC,
      type: 'bed',
      pos: bedPos.clone(),
      radius: 2.2,
      occupied: false,
      label: 'UNDER MASTER BED'
    });
  }
  createBed(1, 2);

  function createNightstand(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z - CELL/2 + 0.5);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.8), woodMatMid);
    body.position.y = 0.45;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), brassMat);
    handle.position.set(0, 0.5, 0.42);
    group.add(handle);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 0.5, 0.9, 0.9);
  }
  createNightstand(1, 5);

  function createWardrobe(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const wPos = new THREE.Vector3(pos.x - CELL/2 + 0.5, 0, pos.z);
    group.position.copy(wPos);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.5, 1.7), woodMatDark);
    body.position.y = 1.25;
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    scene.add(group);
    registerCollisionBox(wPos.x, wPos.z, 0.9, 1.8);

    hideSpots.push({
      id: 'wardrobe_' + cellR + '_' + cellC,
      type: 'wardrobe',
      pos: wPos.clone(),
      radius: 1.8,
      occupied: false,
      label: 'INSIDE WARDROBE'
    });
  }
  createWardrobe(4, 1);
  createWardrobe(9, 1);

  function createVanity(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const vPos = new THREE.Vector3(pos.x - CELL/2 + 0.4, 0, pos.z);
    group.position.copy(vPos);

    const table = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 1.4), woodMatMid);
    table.position.y = 0.425;
    table.castShadow = table.receiveShadow = true;
    group.add(table);

    const mirrorFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), woodMatDark);
    mirrorFrame.rotation.z = Math.PI/2;
    mirrorFrame.position.set(-0.25, 1.35, 0);
    mirrorFrame.castShadow = true;
    group.add(mirrorFrame);

    const mirrorGlass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), new THREE.MeshStandardMaterial({color:0x556677, metalness:0.85, roughness:0.2}));
    mirrorGlass.rotation.y = Math.PI/2;
    mirrorGlass.position.set(-0.22, 1.35, 0);
    group.add(mirrorGlass);

    scene.add(group);
    registerCollisionBox(vPos.x, vPos.z, 0.75, 1.5);

    mirrors.push({
      id: 'vanity_' + cellR + '_' + cellC,
      pos: new THREE.Vector3(vPos.x + 0.18, 1.35, vPos.z),
      normal: new THREE.Vector3(1, 0, 0),
      triggered: false
    });
  }
  createVanity(2, 1);

  addRug(2, 3, 3.2, 3.4, 0x5c2a2a);

  function createBathtub(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x + CELL/2 - 0.6, 0, pos.z);

    const outerTub = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 1.8), porcelainMat);
    outerTub.position.y = 0.375;
    outerTub.castShadow = outerTub.receiveShadow = true;
    group.add(outerTub);

    const waterMat = new THREE.MeshStandardMaterial({ color:0x152220, roughness:0.1, metalness:0.8 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), waterMat);
    water.rotation.x = -Math.PI/2;
    water.position.set(0, 0.6, 0);
    group.add(water);

    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2), chromeMat);
    faucet.position.set(0, 0.8, -0.75);
    group.add(faucet);

    scene.add(group);
    registerCollisionBox(pos.x + CELL/2 - 0.6, pos.z, 1.2, 1.9);
  }
  createBathtub(1, 13);

  function createToilet(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z - CELL/2 + 0.5);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.7), porcelainMat);
    base.position.y = 0.225;
    base.castShadow = true;
    group.add(base);

    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.3), porcelainMat);
    tank.position.set(0, 0.65, -0.2);
    tank.castShadow = true;
    group.add(tank);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 0.5, 0.6, 0.8);
  }
  createToilet(1, 8);

  function createVanitySink(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    const vsPos = new THREE.Vector3(pos.x - CELL/2 + 0.5, 0, pos.z);
    group.position.copy(vsPos);

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 1.4), woodMatDark);
    cabinet.position.y = 0.45;
    cabinet.castShadow = cabinet.receiveShadow = true;
    group.add(cabinet);

    const sinkBasin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.8), porcelainMat);
    sinkBasin.position.set(0, 0.92, 0);
    sinkBasin.castShadow = sinkBasin.receiveShadow = true;
    group.add(sinkBasin);

    const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 1.2), woodMatDark);
    mirrorFrame.position.set(0.38, 1.65, 0);
    mirrorFrame.castShadow = true;
    group.add(mirrorFrame);

    const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.0), new THREE.MeshStandardMaterial({ color:0x556677, metalness:0.85, roughness:0.2 }));
    mirrorGlass.rotation.y = Math.PI / 2;
    mirrorGlass.position.set(0.35, 1.65, 0);
    group.add(mirrorGlass);

    scene.add(group);
    registerCollisionBox(vsPos.x, vsPos.z, 0.9, 1.5);

    mirrors.push({
      id: 'sink_' + cellR + '_' + cellC,
      pos: new THREE.Vector3(vsPos.x + 0.35, 1.65, vsPos.z),
      normal: new THREE.Vector3(1, 0, 0),
      triggered: false
    });
  }
  createVanitySink(3, 8);

  function createSofa(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x - CELL/2 + 0.7, 0, pos.z);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 2.7), fabricMat);
    base.position.y = 0.225;
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 2.7), fabricMat);
    back.position.set(-0.4, 0.725, 0);
    back.castShadow = true;
    group.add(back);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.58, 0.32), fabricMat);
    armL.position.set(0, 0.5, -1.35);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.58, 0.32), fabricMat);
    armR.position.set(0, 0.5, 1.35);
    group.add(armL, armR);

    scene.add(group);
    registerCollisionBox(pos.x - CELL/2 + 0.7, pos.z, 1.2, 2.8);
  }
  createSofa(8, 1);

  function createCoffeeTable(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.9), woodMatMid);
    top.position.y = 0.48;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (let legX of [-0.65, 0.65]){
      for (let legZ of [-0.35, 0.35]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.44), woodMatDark);
        leg.position.set(legX, 0.22, legZ);
        group.add(leg);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 1.6, 1.0);
  }
  createCoffeeTable(8, 3);

  function createBookshelf(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z + CELL/2 - 0.4);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 0.65), woodMatDark);
    frame.position.y = 1.15;
    frame.castShadow = frame.receiveShadow = true;
    group.add(frame);

    const bookColors = [0x5c2a2a, 0x2a3e5c, 0x3e5c2a, 0x5c502a];
    for (let shelfY of [0.5, 1.0, 1.55]){
      for (let b=0; b<6; b++){
        const bMat = new THREE.MeshStandardMaterial({color: bookColors[b%bookColors.length]});
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.42), bMat);
        book.position.set(-0.6 + b*0.22, shelfY, 0);
        group.add(book);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z + CELL/2 - 0.4, 1.8, 0.75);
  }
  createBookshelf(9, 5);

  let clockPendulum = null;
  function createGrandfatherClock(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x - CELL/2 + 0.4, 0, pos.z);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.5, 0.65), woodMatMahogany);
    body.position.y = 1.25;
    body.castShadow = true;
    group.add(body);

    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshStandardMaterial({color:0xe0d4bc, roughness:0.4}));
    face.rotation.y = Math.PI/2;
    face.position.set(0.29, 2.05, 0);
    group.add(face);

    clockPendulum = new THREE.Group();
    clockPendulum.position.set(0.2, 1.6, 0);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8), brassMat);
    rod.position.y = -0.4;
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12), brassMat);
    bob.position.y = -0.8;
    clockPendulum.add(rod, bob);
    group.add(clockPendulum);

    scene.add(group);
    registerCollisionBox(pos.x - CELL/2 + 0.4, pos.z, 0.65, 0.75);
  }
  createGrandfatherClock(6, 1);

  addRug(8, 3, 3.8, 2.8, 0x2a2e3a);

  const tvBody = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.65), new THREE.MeshStandardMaterial({color:0x1a1a1a, roughness:0.8}));
  tvBody.position.set(cellCenter(6,4).x, 0.88, cellCenter(6,4).z - CELL/2 + 0.4);
  tvBody.castShadow = true;
  scene.add(tvBody);
  registerCollisionBox(cellCenter(6,4).x, cellCenter(6,4).z - CELL/2 + 0.4, 1.0, 0.75);

  const tvCanvas = document.createElement('canvas'); tvCanvas.width=64; tvCanvas.height=48;
  const tvCtx = tvCanvas.getContext('2d');
  const tvTex = new THREE.CanvasTexture(tvCanvas);
  const tvImgData = tvCtx.createImageData(tvCanvas.width, tvCanvas.height);
  const tvScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65,0.46),
    new THREE.MeshBasicMaterial({ map: tvTex })
  );
  tvScreen.position.set(tvBody.position.x, tvBody.position.y+0.05, tvBody.position.z + 0.33);
  scene.add(tvScreen);

  function drawTvStatic(){
    const data = tvImgData.data;
    for (let i=0; i<data.length; i+=4){
      const v = Math.random()*255;
      data[i]=v*0.7; data[i+1]=v*0.75; data[i+2]=v*0.85; data[i+3]=255;
    }
    tvCtx.putImageData(tvImgData,0,0);
    tvTex.needsUpdate = true;
  }

  function createKitchenCounter(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z - CELL/2 + 0.5);

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.95), woodMatMid);
    base.position.y = 0.5;
    base.castShadow = base.receiveShadow = true;
    group.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.1, 1.0), new THREE.MeshStandardMaterial({color:0x1e1e1e, roughness:0.4}));
    top.position.y = 1.05;
    group.add(top);

    scene.add(group);
    registerCollisionBox(pos.x, pos.z - CELL/2 + 0.5, 3.3, 1.05);
  }
  createKitchenCounter(6, 11);

  function createDiningSet(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.9), woodMatMahogany);
    top.position.y = 0.85;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    for (let lx of [-0.85, 0.85]){
      for (let lz of [-0.85, 0.85]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.8), woodMatDark);
        leg.position.set(lx, 0.4, lz);
        group.add(leg);
      }
    }

    scene.add(group);
    registerCollisionBox(pos.x, pos.z, 2.3, 2.3);
  }
  createDiningSet(9, 11);

  const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.0, 0.85), new THREE.MeshStandardMaterial({color:0xaaaaaa, roughness:0.4, metalness:0.6}));
  fridge.position.set(cellCenter(6,8).x + CELL/2 - 0.5, 1.0, cellCenter(6,8).z - CELL/2 + 0.5);
  fridge.castShadow = true;
  scene.add(fridge);
  registerCollisionBox(cellCenter(6,8).x + CELL/2 - 0.5, cellCenter(6,8).z - CELL/2 + 0.5, 1.05, 0.95);

  addRug(9, 11, 2.6, 2.6, 0x3a2c1c);

  function createDesk(cellR, cellC){
    const pos = cellCenter(cellR, cellC);
    const group = new THREE.Group();
    group.position.set(pos.x - CELL/2 + 0.4, 0, pos.z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 1.7), woodMatMahogany);
    top.position.y = 0.9;
    top.castShadow = top.receiveShadow = true;
    group.add(top);

    scene.add(group);
    registerCollisionBox(pos.x - CELL/2 + 0.4, pos.z, 0.85, 1.8);
  }
  createDesk(12, 1);

  addFurnitureStorage(13, 9, 1.9, 0.65, 0.95, 0x2a2016);
  function addFurnitureStorage(cellR, cellC, w, d, h, color){
    const pos = cellCenter(cellR, cellC);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), woodMatMid);
    mesh.position.set(pos.x, h/2, pos.z + CELL/2 - 0.4);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    registerCollisionBox(pos.x, pos.z + CELL/2 - 0.4, w, d);
  }

  addRug(12, 7, 4.2, 2.4, 0x3a1f1f);

  // ---------- REALISTIC RANDOM PAGE PLACEMENT ----------
  const pageMat = new THREE.MeshStandardMaterial({ color:0xd4af37, emissive:0x705814, emissiveIntensity:0.65, roughness:0.7, side:THREE.DoubleSide });
  const pageGeo = new THREE.PlaneGeometry(0.35, 0.48);

  const pages = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(pageGeo, pageMat);
    mesh.rotation.x = -Math.PI/2;
    const glow = new THREE.PointLight(0xd4af37, 0.85, 4.0);
    scene.add(mesh, glow);
    pages.push({ mesh, glow, pos: new THREE.Vector3(), collected: false, cellKey: '' });
  }

  let pagesCollected = 0;

  function randomizePages() {
    const selected = shuffleArray(ALL_PAGE_LOCATIONS).slice(0, 3);
    selected.forEach((item, i) => {
      const p = pages[i];
      const center = cellCenter(item.posCell.r, item.posCell.c);
      p.pos.set(center.x, item.h + 0.01, center.z);
      p.cellKey = item.posCell.r + ',' + item.posCell.c;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
      p.mesh.visible = true;
      p.glow.position.set(p.pos.x, p.pos.y + 0.25, p.pos.z);
      p.glow.visible = true;
      p.collected = false;
    });
    pagesCollected = 0;
    document.getElementById('pageCount').textContent = '0 / 3';
    document.getElementById('objective').classList.remove('unlocked');
  }

  // ---------- BATTERY PICKUPS ----------
  function createBatteryMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), bodyMat);
    body.position.y = 0.09;
    body.castShadow = true;
    group.add(body);

    const bandMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.9 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.08, 12), bandMat);
    band.position.y = 0.09;
    group.add(band);

    return group;
  }

  const CANDIDATE_BATTERY_SPAWNS = [
    { r: 1, c: 5, offX: 0.35, h: 0.92, offZ: 0.25 },
    { r: 3, c: 8, offX: -0.45, h: 0.95, offZ: 0.0 },
    { r: 8, c: 3, offX: -0.4, h: 0.52, offZ: 0.2 },
    { r: 6, c: 11, offX: 0.85, h: 1.12, offZ: -0.25 },
    { r: 9, c: 11, offX: -0.5, h: 0.92, offZ: 0.3 },
    { r: 12, c: 1, offX: -0.4, h: 0.96, offZ: 0.25 },
    { r: 13, c: 9, offX: 0.45, h: 0.94, offZ: 0.0 }
  ];

  const batteries = [];
  for (let i = 0; i < 4; i++) {
    const mesh = createBatteryMesh();
    mesh.rotation.z = Math.PI / 2;
    const glow = new THREE.PointLight(0x4cd964, 0.6, 2.5);
    scene.add(mesh, glow);
    batteries.push({ mesh, glow, pos: new THREE.Vector3(), collected: false });
  }

  function randomizeBatteries(pageCellKeys) {
    const blocked = new Set(pageCellKeys);
    const pool = shuffleArray(CANDIDATE_BATTERY_SPAWNS.filter(s => !blocked.has(s.r + ',' + s.c)));
    const selected = pool.slice(0, 4);
    selected.forEach((item, i) => {
      const b = batteries[i];
      const center = cellCenter(item.r, item.c);
      b.pos.set(center.x + item.offX, item.h, center.z + item.offZ);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y = Math.random() * Math.PI;
      b.mesh.visible = true;
      b.glow.position.set(b.pos.x, b.pos.y + 0.15, b.pos.z);
      b.glow.visible = true;
      b.collected = false;
    });
    for (let i = selected.length; i < batteries.length; i++) {
      batteries[i].collected = true;
      batteries[i].mesh.visible = false;
      batteries[i].glow.visible = false;
    }
  }

  function randomizeCollectibles() {
    randomizePages();
    randomizeBatteries(pages.map(p => p.cellKey));
  }

  randomizeCollectibles();

  // ---------- REFLECTIVE MIRROR JUMPSCARE OBJECT & AUDIOS ----------
  const mirrorWatcherMesh = new THREE.Group();
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x010101, transparent: true, opacity: 0.95 });
  const shadowEyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 8), shadowMat);
  mTorso.position.y = 0.9;
  const mHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), shadowMat);
  mHead.position.y = 1.95;
  const mEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), shadowEyeMat);
  mEyeL.position.set(-0.09, 1.98, 0.22);
  const mEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), shadowEyeMat);
  mEyeR.position.set(0.09, 1.98, 0.22);
  mirrorWatcherMesh.add(mTorso, mHead, mEyeL, mEyeR);
  mirrorWatcherMesh.visible = false;
  scene.add(mirrorWatcherMesh);

  let mirrorScareActive = false;
  let mirrorScareTimer = 0;
  let scareTriggerYaw = 0;
  let hidingType = null;
  const mirrorFlashEl = document.getElementById('mirrorFlash');

  // ---------- ENTITY: "THE WATCHER" ----------
  const skinMat = new THREE.MeshStandardMaterial({ color:0x050505, roughness:0.9, metalness:0.1 });
  const rimMat  = new THREE.MeshBasicMaterial({ color:0x880808, transparent:true, opacity:0.4, side:THREE.BackSide });
  const eyeMat  = new THREE.MeshBasicMaterial({ color:0xff2222 });
  const eyeGlow = new THREE.PointLight(0xff1111, 0, 5);

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
  torsoPivot.position.y = 1.7;
  const torso = rimmed(new THREE.CylinderGeometry(0.18, 0.28, 1.7, 8));
  torso.children.forEach(m => m.position.y = 0.45);
  torso.rotation.x = 0.22;
  torsoPivot.add(torso);
  entityGroup.add(torsoPivot);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.15, 0.15);
  const head = rimmed(new THREE.SphereGeometry(0.24, 10, 10));
  head.children.forEach(m => m.scale.set(0.75, 1.1, 0.88));
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), skinMat);
  jaw.position.set(0, -0.22, 0.08);
  jaw.rotation.x = Math.PI;
  headPivot.add(head, jaw);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat); eyeL.position.set(-0.08, 0.04, 0.21);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat); eyeR.position.set(0.08, 0.04, 0.21);
  eyeGlow.position.set(0, 0.04, 0.22);
  headPivot.add(eyeL, eyeR, eyeGlow);
  torsoPivot.add(headPivot);

  function makeArm(sign){
    const shoulder = new THREE.Group();
    shoulder.position.set(sign*0.24, 0.85, 0.05);
    const upper = rimmed(new THREE.CylinderGeometry(0.05, 0.04, 0.75, 6));
    upper.children.forEach(m => m.position.y = -0.37);
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.75;
    const fore = rimmed(new THREE.CylinderGeometry(0.04, 0.03, 0.8, 6));
    fore.children.forEach(m => m.position.y = -0.4);
    elbow.add(fore);

    const hand = new THREE.Group();
    hand.position.y = -0.8;
    for (let i=0; i<4; i++){
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.2, 4), skinMat);
      claw.position.set((i-1.5)*0.03, -0.1, 0.02);
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
    hip.position.set(sign*0.12, -0.05, 0);
    const thigh = rimmed(new THREE.CylinderGeometry(0.07, 0.05, 0.72, 6));
    thigh.children.forEach(m => m.position.y = -0.36);
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.72;
    const shin = rimmed(new THREE.CylinderGeometry(0.05, 0.038, 0.7, 6));
    shin.children.forEach(m => m.position.y = -0.35);
    knee.add(shin);
    hip.add(knee);
    return { hip, knee };
  }
  const legL = makeLeg(-1), legR = makeLeg(1);
  entityGroup.add(legL.hip, legR.hip);
  legL.hip.position.y = 1.05;
  legR.hip.position.y = 1.05;

  scene.add(entityGroup);

  const spawnPos = cellCenter(7,7);
  entityGroup.position.copy(spawnPos);
  entityGroup.visible = false;
  let entityActive = false;
  let entityState = 'idle';
  let entityBaseSpeed = 2.5;
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
    const cycleSpeed = 5.0 + currentSpeed*2.0;
    entWalkPhase += dt * cycleSpeed;
    const swing = Math.sin(entWalkPhase) * (0.6 + Math.min(0.45, currentSpeed*0.14));
    legL.hip.rotation.x = swing;
    legR.hip.rotation.x = -swing;
    legL.knee.rotation.x = Math.max(0, -Math.sin(entWalkPhase + 0.6)) * 1.0;
    legR.knee.rotation.x = Math.max(0, -Math.sin(entWalkPhase + 0.6 + Math.PI)) * 1.0;
    armL.shoulder.rotation.x = -swing*0.9;
    armR.shoulder.rotation.x = swing*0.9;

    entityGroup.position.y = Math.abs(Math.sin(entWalkPhase*0.5))*0.06;

    entTwitchT -= dt;
    if (entTwitchT <= 0){
      entTwitchT = hunting ? (0.1 + Math.random()*0.25) : (0.5 + Math.random()*1.0);
      entHeadTwitchTarget = (Math.random()-0.5) * (hunting ? 1.6 : 0.7);
    }
    entHeadTwitchCur += (entHeadTwitchTarget - entHeadTwitchCur) * Math.min(1, dt*16);
    headPivot.rotation.y = entHeadTwitchCur;
    headPivot.rotation.z = Math.sin(entWalkPhase*0.4) * 0.1;

    const closeness = Math.max(0, Math.min(1, 1 - distToPlayer/5));
    const stretch = 1 + closeness*0.25;
    entityGroup.scale.y = stretch;
    torso.rotation.x = 0.22 + closeness*0.3;

    const eyeIntensity = hunting ? (1.5 + closeness*3.0) : 0.2;
    eyeGlow.intensity = eyeIntensity;
    eyeMat.color.setRGB(1.0, 0.15 + closeness*0.3, 0.15);
  }

  // ---------- PAPER NOTE UI OVERLAY MECHANIC ----------
  let isNoteOpen = false;
  const noteModal = document.getElementById('noteModal');
  const noteEyebrow = document.getElementById('noteEyebrow');
  const noteTitle = document.getElementById('noteTitle');
  const noteBody = document.getElementById('noteBody');
  const closeNoteBtn = document.getElementById('closeNoteBtn');

  function openPaperNote(pageIndex){
    const data = PAGE_NOTES[pageIndex];
    if (!data) return;

    noteEyebrow.textContent = data.eyebrow;
    noteTitle.textContent = data.title;
    noteBody.textContent = data.body;

    isNoteOpen = true;
    noteModal.classList.remove('hidden');
    noteModal.classList.add('active');

    // Release mouse cursor so player can click close button or view paper
    if (document.pointerLockElement) document.exitPointerLock();

    playPageChime();
  }

  function closePaperNote(){
    if (!isNoteOpen) return;
    isNoteOpen = false;
    noteModal.classList.remove('active');
    noteModal.classList.add('hidden');

    // Seamlessly return to 1st person gameplay
    if (gameRunning && !gameOver && !isTouch){
      renderer.domElement.requestPointerLock();
    }
  }

  closeNoteBtn.addEventListener('click', closePaperNote);
  noteModal.addEventListener('click', (e) => {
    if (e.target === noteModal) closePaperNote();
  });

  // ---------- PLAYER STATE ----------
  let yaw = 0, pitch = 0;
  const move = { f:false, b:false, l:false, r:false, run:false, crouch:false };
  let pointerLocked = false;
  let gameRunning = false;
  let isHiding = false;
  let hidingSpot = null;
  let preHidePos = null;
  let hideExitCooldown = 0;
  let stamina = 100;
  let staminaExhausted = false;
  let footstepTimer = 0;
  let bobPhase = 0;
  let baseEyeHeight = 1.6;
  let crouchLerp = 0;

  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked || isNoteOpen) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-Math.PI/2 + 0.05, Math.min(Math.PI/2 - 0.05, pitch));
  });

  document.addEventListener('keydown', (e) => {
    if (isNoteOpen){
      if (e.code === 'KeyE' || e.code === 'Escape'){
        e.preventDefault();
        closePaperNote();
        return;
      }
    }

    switch(e.code){
      case 'KeyW': move.f = true; break;
      case 'KeyS': move.b = true; break;
      case 'KeyA': move.l = true; break;
      case 'KeyD': move.r = true; break;
      case 'ShiftLeft': case 'ShiftRight': move.run = true; break;
      case 'KeyC': move.crouch = !move.crouch; break;
      case 'KeyF': toggleFlashlight(); break;
      case 'KeyE': tryInteract(); break;
      case 'Escape': if (isNoteOpen) closePaperNote(); break;
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
    if (battery <= 0 || isNoteOpen) return;
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
    if (isNoteOpen) return;
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
    if (isNoteOpen) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = { x:t.clientX, y:t.clientY };
  }, { passive:false });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches){
      if (t.identifier === lookTouchId && !isNoteOpen){
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
    if (isNoteOpen) return;
    touchRunActive = !touchRunActive;
    btnRun.classList.toggle('active', touchRunActive);
  });
  btnCrouch.addEventListener('click', () => {
    if (isNoteOpen) return;
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

  function findSafePosition(x, z){
    if (!collides(x, z)) return { x, z };
    for (let dist = 0.4; dist <= 2.8; dist += 0.4){
      for (let a = 0; a < 12; a++){
        const angle = (a / 12) * Math.PI * 2;
        const tx = x + Math.cos(angle) * dist;
        const tz = z + Math.sin(angle) * dist;
        if (!collides(tx, tz)) return { x: tx, z: tz };
      }
    }
    return { x, z };
  }

  function exitHide(){
    isHiding = false;
    hidingType = null;
    document.getElementById('wardrobeOverlay').classList.add('hidden');
    document.getElementById('bedOverlay').classList.add('hidden');
    move.crouch = false;
    if (isTouch) btnCrouch.classList.remove('active');
    crouchLerp = 0;

    let tx, tz;
    if (preHidePos && hidingSpot){
      const spot = hidingSpot.pos;
      const dx = preHidePos.x - spot.x;
      const dz = preHidePos.z - spot.z;
      const dist = Math.hypot(dx, dz) || 1;
      const minDist = 2.0;
      if (dist < minDist){
        tx = spot.x + (dx / dist) * minDist;
        tz = spot.z + (dz / dist) * minDist;
      } else {
        tx = preHidePos.x;
        tz = preHidePos.z;
      }
    } else if (preHidePos){
      tx = preHidePos.x;
      tz = preHidePos.z;
    } else if (hidingSpot){
      tx = hidingSpot.pos.x + 2.0;
      tz = hidingSpot.pos.z + 2.0;
    } else {
      return;
    }

    const safe = findSafePosition(tx, tz);
    camera.position.x = safe.x;
    camera.position.z = safe.z;

    if (hidingSpot) hidingSpot.occupied = false;
    hidingSpot = null;
    preHidePos = null;
    hideExitCooldown = 0.75;
  }

  const whisperDiv = document.getElementById('whisperText');
  function showWhisper(){
    if (!entityActive) return;
    const w = WHISPERS[Math.floor(Math.random()*WHISPERS.length)];
    whisperDiv.textContent = w;
    whisperDiv.style.opacity = 0.95;
    clearTimeout(showWhisper._t);
    showWhisper._t = setTimeout(() => { whisperDiv.style.opacity = 0; }, 2000);
  }

  const toastDiv = document.getElementById('toastMsg');
  function showToast(text){
    if (!toastDiv) return;
    toastDiv.textContent = text;
    toastDiv.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastDiv.classList.remove('show'); }, 2800);
  }

  const interactHintEl = document.getElementById('interactHint');

  function tryInteract(){
    if (!gameRunning) return;

    if (isNoteOpen){
      closePaperNote();
      return;
    }

    if (isHiding){
      exitHide();
      return;
    }

    // Check Pages
    for (const p of pages){
      if (p.collected) continue;
      const d = camera.position.distanceTo(p.pos);
      if (d < 2.6){
        p.collected = true;
        p.mesh.visible = false;
        p.glow.visible = false;
        pagesCollected++;
        document.getElementById('pageCount').textContent = pagesCollected + ' / 3';

        // POP UP FULLSCREEN AGED PARCHMENT PAPER NOTE OVERLAY
        openPaperNote(pagesCollected - 1);

        // Trigger MONSTER CHASE & PERMANENT AMBIENT LIGHT EXTINCTION ON 2ND PAGE!
        if (pagesCollected === 2){
          playStinger();
          showToast("PAGE 2 COLLECTED — LIGHTS EXTINGUISHED & THE WATCHER IS HUNTING!");
          entityGroup.visible = true;
          entityActive = true;
          entityState = 'hunting';
          lastKnownPlayerPos = camera.position.clone();
          showWhisper();

          ambientExtinguished = true;
          ambientLight.intensity = 0.08;
          lamps.forEach(l => {
            l.light.intensity = 0;
            if (l.bulb) l.bulb.material.color.setHex(0x151210);
          });
          candleLights.forEach(c => {
            c.light.intensity = 0;
            if (c.flame) c.flame.visible = false;
          });

          for (const d of doors){
            if (Math.hypot(d.center.x-entityGroup.position.x, d.center.z-entityGroup.position.z) < CELL*2.5) d.slammed = true;
          }
        }

        // Unlock Exit Door when 3rd page is picked up!
        if (pagesCollected === 3){
          exitLight.intensity = 2.2;
          chainGroup.visible = false;
          exitDoorPivotL.rotation.y = Math.PI * 0.12;
          exitDoorPivotR.rotation.y = -Math.PI * 0.12;
          document.getElementById('objective').classList.add('unlocked');
          document.getElementById('pageCount').textContent = '3 / 3 — EXIT UNLOCKED!';
          showToast("CHAINS BROKEN! ESCAPE THROUGH THE MAIN EXIT!");
          playChainBreak();
        }
        return;
      }
    }

    // Check Batteries
    for (const b of batteries){
      if (b.collected) continue;
      const d = camera.position.distanceTo(b.pos);
      if (d < 2.6){
        b.collected = true;
        b.mesh.visible = false;
        b.glow.visible = false;
        battery = Math.min(100, battery + 50);
        if (battery > 0 && !flashlightOn) flashlightOn = true;
        playBatteryChime();
        showToast("+50% FLASHLIGHT BATTERY");
        return;
      }
    }

    // Check Exit Door interaction
    const distToExit = Math.hypot(camera.position.x-exitPos.x, camera.position.z-exitPos.z);
    if (distToExit < 2.8){
      if (pagesCollected < 3){
        showToast("THE EXIT IS CHAINED SHUT — FIND ALL 3 PAGES");
      } else {
        triggerWin();
      }
      return;
    }

    if (hideExitCooldown > 0) return;

    for (const spot of hideSpots){
      if (spot.occupied) continue;
      const d = Math.hypot(camera.position.x-spot.pos.x, camera.position.z-spot.pos.z);
      if (d < spot.radius){
        preHidePos = camera.position.clone();
        isHiding = true;
        hidingType = spot.type;
        hidingSpot = spot;
        spot.occupied = true;
        move.crouch = true;
        if (isTouch) btnCrouch.classList.add('active');

        if (spot.type === 'bed'){
          camera.position.set(spot.pos.x, 0.38, spot.pos.z);
          document.getElementById('bedOverlay').classList.remove('hidden');
          showToast("HIDING UNDER THE BED — STAY STILL!");
        } else {
          camera.position.set(spot.pos.x, 1.35, spot.pos.z);
          document.getElementById('wardrobeOverlay').classList.remove('hidden');
          showToast("HIDING INSIDE WARDROBE — STAY STILL!");
        }
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
  const jumpscareCanvas = document.getElementById('jumpscareCanvas');
  const winScreen = document.getElementById('win');
  const againBtn = document.getElementById('againBtn');
  const retryBtn = document.getElementById('retryBtn');
  const fearDiv = document.getElementById('fear');
  const breathFogDiv = document.getElementById('breathFog');
  const batteryFill = document.getElementById('battery-fill');
  const batteryPercent = document.getElementById('batteryPercent');
  const staminaFill = document.getElementById('stamina-fill');
  const staminaPercent = document.getElementById('staminaPercent');
  const roomLabelEl = document.getElementById('roomLabelText');
  const pickupPromptEl = document.getElementById('pickupPrompt');

  if (isTouch){
    controlsHint.textContent = 'Left joystick to move · drag anywhere else to look · buttons to run / crouch / flashlight / use';
  }

  function pickRandomSpawn(){
    const candidates = [];
    for (let r = 1; r < ROWS - 1; r++){
      for (let c = 1; c < COLS - 1; c++){
        if (MAP[r][c] !== 0) continue;
        const pos = cellCenter(r, c);
        if (!collides(pos.x, pos.z)) {
          candidates.push({ r, c, yaw: Math.random() * Math.PI * 2 });
        }
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || SAFE_SPAWN_LOCATIONS[0];
  }

  function startGame(){
    if (gameRunning || gameOver) return;
    overlay.classList.add('hidden');
    chapterCard.classList.remove('hidden');
    setTimeout(() => { chapterCard.classList.add('hidden'); }, 4200);

    randomizeCollectibles();
    chainGroup.visible = true;
    exitDoorPivotL.rotation.y = 0;
    exitDoorPivotR.rotation.y = 0;
    exitLight.intensity = 0;

    ambientExtinguished = false;
    ambientLight.intensity = 0.78;
    lamps.forEach(l => {
      l.light.intensity = l.base;
      if (l.bulb) l.bulb.material.color.setHex(0xffdfaa);
    });
    candleLights.forEach(c => {
      c.light.intensity = c.baseIntensity;
      if (c.flame) c.flame.visible = true;
    });
    mirrors.forEach(m => m.triggered = false);
    doors.forEach(d => { d.slammed = false; d.creptOpen = false; d.lastDist = null; });

    entityGroup.visible = false;
    entityActive = false;
    entityState = 'idle';
    hideSpots.forEach(s => { s.occupied = false; });

    const spawn = pickRandomSpawn();
    camera.position.copy(cellCenter(spawn.r, spawn.c));
    camera.position.y = baseEyeHeight;
    yaw = spawn.yaw;

    battery = 100;
    flashlightOn = true;
    stamina = 100;
    staminaExhausted = false;
    isHiding = false;
    hidingSpot = null;
    preHidePos = null;
    hideExitCooldown = 0;
    move.crouch = false;

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
    if (pointerLocked && !isNoteOpen) startGame();
  });

  // ---------- PROCEDURAL AUDIO DESIGN ----------
  let audioCtx = null;
  let droneGain = null;
  function initAudio(){
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 40;
    gain.gain.value = 0.04;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    droneGain = gain;

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine'; osc2.frequency.value = 55;
    gain2.gain.value = 0.015;
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
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.35);
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.55);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  }

  function playBatteryChime(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [520, 780].forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      gain.gain.value = 0.0001;
      const t0 = audioCtx.currentTime + i*0.07;
      gain.gain.linearRampToValueAtTime(0.06, t0+0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0+0.4);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0+0.45);
    });
  }

  function playChainBreak(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.8);
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.85);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.9);
  }

  function playDoorCreak(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(145, audioCtx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.65);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.7);
  }

  function playDoorSlam(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(65, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.32);
  }

  function playMirrorStinger(){
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.55);
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.45, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.65);
  }

  function playFootstep(surface){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = surface==='tile' ? 240 : 115 + Math.random()*20;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.12);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.13);
  }

  function playStinger(){
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 110;
    osc.frequency.exponentialRampToValueAtTime(24, audioCtx.currentTime+0.75);
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.55, audioCtx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.95);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+1.0);
  }

  let lastBeat = 0;
  function heartbeat(intensity){
    if (!audioCtx) return;
    const now = performance.now();
    const interval = 900 - intensity*580;
    if (now - lastBeat < interval) return;
    lastBeat = now;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 54;
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.16 + intensity*0.18, audioCtx.currentTime+0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.25);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime+0.3);
  }

  function renderJumpscareGraphic(){
    if (!jumpscareCanvas) return;
    jumpscareCanvas.width = window.innerWidth;
    jumpscareCanvas.height = window.innerHeight;
    const ctx = jumpscareCanvas.getContext('2d');
    const w = jumpscareCanvas.width, h = jumpscareCanvas.height;

    ctx.fillStyle = '#0a0000'; ctx.fillRect(0,0,w,h);

    const centerX = w/2, centerY = h/2;
    ctx.fillStyle = '#ff1111';
    ctx.beginPath();
    ctx.arc(centerX - 90, centerY - 40, 24, 0, Math.PI*2);
    ctx.arc(centerX + 90, centerY - 40, 24, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX - 90, centerY - 40, 8, 0, Math.PI*2);
    ctx.arc(centerX + 90, centerY - 40, 8, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = 'rgba(180, 10, 10, 0.6)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect(Math.random()*w, Math.random()*h, 3+Math.random()*6, 40+Math.random()*120);
    }
  }

  function triggerJumpscare(caughtWhileHiding){
    gameOver = true;
    gameRunning = false;
    if (document.pointerLockElement) document.exitPointerLock();
    touchControlsEl.classList.remove('active');
    if (isNoteOpen) closePaperNote();
    playStinger();
    renderJumpscareGraphic();
    jumpscareText.textContent = caughtWhileHiding
      ? "It dragged you from the shadows. Hiding only works if you hold perfectly still..."
      : "The thing in the house doesn't need to catch you. It just needs you to stop running.";
    jumpscare.classList.remove('hidden');
  }

  function triggerWin(){
    gameOver = true;
    gameRunning = false;
    if (document.pointerLockElement) document.exitPointerLock();
    touchControlsEl.classList.remove('active');
    if (isNoteOpen) closePaperNote();
    const secs = Math.floor((performance.now()-startTime)/1000);
    document.getElementById('winTime').textContent = `Chapter One survived in ${secs} seconds.`;
    winScreen.classList.remove('hidden');
  }

  // ---------- STATIC NOISE CANVAS ----------
  const staticCanvas = document.getElementById('staticNoise');
  const staticCtx = staticCanvas.getContext('2d');
  let staticImgData = null;

  function resizeStatic(){
    staticCanvas.width = 160;
    staticCanvas.height = Math.round(160 * window.innerHeight/window.innerWidth);
    staticImgData = staticCtx.createImageData(staticCanvas.width, staticCanvas.height);
  }
  resizeStatic();

  function drawStatic(){
    if (!staticImgData) return;
    const data = staticImgData.data;
    for (let i=0; i<data.length; i+=4){
      const v = Math.random()*255;
      data[i]=v; data[i+1]=v; data[i+2]=v; data[i+3]=255;
    }
    staticCtx.putImageData(staticImgData,0,0);
  }

  // ---------- MAIN ANIMATION LOOP ----------
  const clock = new THREE.Clock();
  let lastRoomCheck = 0;
  let whisperTimer = 0;
  let staminaRegenDelay = 0;

  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    // FIX: when the parchment note overlay is open, stop updating AND stop
    // re-rendering the 3D scene entirely. Previously the full render loop
    // (physics, entity AI, lighting flicker, particle updates, and a fresh
    // WebGL render) kept running every frame underneath the note's
    // fullscreen backdrop-filter blur. The browser has to recompute that
    // blur over a live-updating canvas 60x/sec, which is the real source
    // of the lag/stutter you feel right when a page is picked up. Since
    // nothing needs to visibly change while you're just reading the note,
    // we simply skip the frame — the last rendered frame stays on the
    // canvas and only needs to be blurred once.
    if (isNoteOpen){
      return;
    }

    if (clockPendulum) {
      clockPendulum.rotation.z = Math.sin(performance.now()*0.0025) * 0.25;
    }

    if (gameRunning && !gameOver){
      const cfg = DIFF[difficulty];

      if (hideExitCooldown > 0) hideExitCooldown -= dt;

      if (!isNoteOpen){
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = isHiding ? pitch*0.4 : pitch;
      }

      const crouchTarget = move.crouch ? 1 : 0;
      crouchLerp += (crouchTarget - crouchLerp) * Math.min(1, dt*8);
      const targetEyeHeight = baseEyeHeight - crouchLerp*0.55;

      let moving = false;
      let surfaceNoisy = false;

      if (!isHiding && !isNoteOpen){
        const forwardInput = Math.max(-1, Math.min(1, ((move.f?1:0)-(move.b?1:0)) + joyVec.y));
        const strafeInput  = Math.max(-1, Math.min(1, ((move.r?1:0)-(move.l?1:0)) + joyVec.x));
        const inputMag = Math.min(1, Math.hypot(forwardInput, strafeInput));
        moving = inputMag > 0.05;

        const runWanted = (move.run || touchRunActive) && !move.crouch && stamina > 2 && !staminaExhausted;
        const crouchSlow = move.crouch ? 0.55 : 1.0;
        const speedBase = (runWanted ? 4.8 : 2.6) * crouchSlow;
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
          stamina -= dt*8.5;
          if (stamina <= 0){ stamina = 0; staminaExhausted = true; }
          staminaRegenDelay = 0.5;
        } else {
          staminaRegenDelay -= dt;
          if (staminaRegenDelay <= 0){
            stamina += dt*18;
            if (stamina > 100) stamina = 100;
            if (stamina > 30) staminaExhausted = false;
          }
        }

        if (moving){
          bobPhase += dt * (runWanted ? 11.5 : 6.5);
          footstepTimer -= dt;
          if (footstepTimer <= 0){
            footstepTimer = runWanted ? 0.27 : 0.44;
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
        camera.position.y = targetEyeHeight - (isHiding ? 0.3 : 0);
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
      flashlight.intensity = (flashlightOn && !isHiding && battery > 0) ? Math.max(0.15, (battery/100))*2.8*flickerMod : 0;

      if (flashlightOn && battery > 0 && !isHiding && !isNoteOpen){
        battery -= dt*1.0*cfg.batteryDrain;
        if (battery < 0) battery = 0;
        if (battery === 0) flashlightOn = false;
      }
      batteryFill.style.width = battery + '%';
      if (batteryPercent) batteryPercent.textContent = Math.round(battery) + '%';
      batteryFill.classList.toggle('low', battery < 20 && battery > 0);
      staminaFill.style.width = stamina + '%';
      if (staminaPercent) staminaPercent.textContent = Math.round(stamina) + '%';

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

      let nearBattery = false;
      for (const b of batteries){
        if (b.collected) continue;
        if (camera.position.distanceTo(b.pos) < 2.6) nearBattery = true;
      }

      let nearExit = false;
      const distToExit = Math.hypot(camera.position.x-exitPos.x, camera.position.z-exitPos.z);
      if (distToExit < 2.8) nearExit = true;

      let nearHide = false;
      let nearHideSpot = null;
      if (!isHiding){
        for (const spot of hideSpots){
          if (spot.occupied) continue;
          const d = Math.hypot(camera.position.x-spot.pos.x, camera.position.z-spot.pos.z);
          if (d < spot.radius){
            nearHide = true;
            nearHideSpot = spot;
            break;
          }
        }
      }

      if (!isNoteOpen){
        if (nearExit){
          pickupPromptEl.textContent = pagesCollected === 3 ? '[ E ] ESCAPE HOUSE' : '[ E ] EXIT (CHAINED SHUT)';
          pickupPromptEl.classList.add('show');
        } else if (nearPage) {
          pickupPromptEl.textContent = '[ E ] PICK UP PAGE';
          pickupPromptEl.classList.add('show');
        } else if (nearBattery) {
          pickupPromptEl.textContent = '[ E ] PICK UP BATTERY';
          pickupPromptEl.classList.add('show');
        } else {
          pickupPromptEl.classList.remove('show');
        }

        if (isHiding){
          interactHintEl.textContent = hidingType === 'bed' ? '[ E ] EXIT UNDER BED' : '[ E ] EXIT WARDROBE';
          interactHintEl.classList.add('show');
        } else if (nearHide){
          interactHintEl.textContent = nearHideSpot ? ('[ E ] HIDE (' + nearHideSpot.label + ')') : '[ E ] HIDE';
          interactHintEl.classList.add('show');
        } else {
          interactHintEl.classList.remove('show');
        }
      } else {
        pickupPromptEl.classList.remove('show');
        interactHintEl.classList.remove('show');
      }

      // Volumetric flashlight dust beam particles update
      const mp = motes.geometry.attributes.position.array;
      const mc = motes.geometry.attributes.color.array;
      const flashPos = flashlight.position;
      const flashDir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
      const coneCos = Math.cos(flashlight.angle * 1.05);

      for (let i=0; i<MOTE_COUNT; i++){
        const s = moteSpeed[i];
        s.phase += dt*0.4;
        mp[i*3]   += Math.sin(s.phase)*0.0015;
        mp[i*3+1] += s.vy*dt*0.35;
        mp[i*3+2] += Math.cos(s.phase*0.7)*0.0015;
        if (mp[i*3+1] > WALL_H) mp[i*3+1] = 0.1;

        let r = 0.05, g = 0.04, b = 0.03;
        if (flashlightOn && battery > 0 && !isHiding && !isNoteOpen){
          const dx = mp[i*3] - flashPos.x;
          const dy = mp[i*3+1] - flashPos.y;
          const dz = mp[i*3+2] - flashPos.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > 0.3 && dist < flashlight.distance){
            const dot = (dx*flashDir.x + dy*flashDir.y + dz*flashDir.z) / dist;
            if (dot > coneCos){
              const distFactor = 1.0 - (dist / flashlight.distance);
              const coneFactor = (dot - coneCos) / (1.0 - coneCos);
              const intensity = Math.pow(distFactor * coneFactor, 0.6) * 1.8;
              r = Math.min(1.0, 0.1 + 0.9*intensity);
              g = Math.min(1.0, 0.08 + 0.8*intensity);
              b = Math.min(1.0, 0.05 + 0.55*intensity);
            }
          }
        }
        mc[i*3]   = r;
        mc[i*3+1] = g;
        mc[i*3+2] = b;
      }
      motes.geometry.attributes.position.needsUpdate = true;
      motes.geometry.attributes.color.needsUpdate = true;

      if (Math.random() < 0.3) drawTvStatic();

      // Dynamic door creak & slam mechanics
      for (const d of doors){
        const distP = Math.hypot(camera.position.x-d.center.x, camera.position.z-d.center.z);

        if (!d.creptOpen && distP < 4.2 && !d.slammed){
          d.creptOpen = true;
          d.openY = (Math.PI * 0.42) * (Math.random() < 0.5 ? 1 : -1);
          playDoorCreak();
        }

        if (d.lastDist && d.lastDist < 1.3 && distP >= 1.6 && !d.slammed && Math.random() < 0.22){
          d.slammed = true;
          playDoorSlam();
        }
        d.lastDist = distP;

        const wantOpen = distP < d.triggerR || (d.creptOpen && !d.slammed);
        const target = d.slammed ? d.closedY : (wantOpen ? d.openY : d.closedY);
        d.pivot.rotation.y += (target - d.pivot.rotation.y) * Math.min(1, dt * (d.slammed?12:2.5));
      }

      // Ambient lamp flickering & extinction
      if (ambientExtinguished){
        for (const l of lamps) l.light.intensity = 0;
        for (const c of candleLights) c.light.intensity = 0;
      } else {
        for (const l of lamps){
          l.flickerPhase += dt * (4 + Math.random()*8);
          if (l.willDie && l.deadUntil <= 0 && Math.random() < 0.003){
            l.deadUntil = 0.2 + Math.random()*1.0;
          }
          if (l.deadUntil > 0){
            l.deadUntil -= dt;
            l.light.intensity = l.base * 0.04;
          } else {
            const flicker = Math.sin(l.flickerPhase) > 0.9 ? 0.2 : (0.85 + Math.random()*0.15);
            l.light.intensity = l.base * flicker;
          }
        }
      }

      // Reflective mirror jumpscare check
      if (!isHiding && !isNoteOpen && !gameOver){
        const camPos = camera.position;
        const camDir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();

        for (const m of mirrors){
          if (m.triggered) continue;
          const distToMirror = camPos.distanceTo(m.pos);
          if (distToMirror < 2.5){
            const toMirror = m.pos.clone().sub(camPos).normalize();
            const lookDot = camDir.dot(toMirror);
            if (lookDot > 0.72){ // Player looking directly into mirror
              m.triggered = true;
              mirrorScareActive = true;
              mirrorScareTimer = 0.7;
              scareTriggerYaw = yaw;

              const behindPos = camPos.clone().sub(camDir.clone().multiplyScalar(1.2));
              behindPos.y = 0;
              mirrorWatcherMesh.position.copy(behindPos);
              mirrorWatcherMesh.lookAt(camPos.x, 1.5, camPos.z);
              mirrorWatcherMesh.visible = true;

              if (mirrorFlashEl) mirrorFlashEl.classList.add('active');
              playMirrorStinger();
              break;
            }
          }
        }

        if (mirrorScareActive){
          mirrorScareTimer -= dt;
          const yawDiff = Math.abs(yaw - scareTriggerYaw);
          if (mirrorScareTimer <= 0 || yawDiff > 0.45){
            mirrorScareActive = false;
            mirrorWatcherMesh.visible = false;
            if (mirrorFlashEl) mirrorFlashEl.classList.remove('active');
          }
        }
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
            const stateSpeedMult = entityState==='hunting' ? (isNoteOpen ? 0.4 : 1.35) : entityState==='searching' ? 0.9 : 0.6;
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

        if (!isHiding && dist < 1.15 && !isNoteOpen){
          triggerJumpscare(false);
        } else if (isHiding && dist < 1.4 && moving && !isNoteOpen){
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